import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../models/Order.js";
import Store from "../models/Store.js";
import User from "../models/User.js";
import { ROLES } from "../constants/roles.js";
import { AppError } from "../utils/AppError.js";
import type { RequestActor } from "../types/access.js";
import { andWithTenant, tenantWhereClause } from "../utils/tenantScope.js";
import * as pushService from "./push.service.js";

function toRadians(val: number): number {
  return (val * Math.PI) / 180;
}

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

function extractStoreIdFromOrder(order: any): string | null {
  const items = Array.isArray(order?.items) ? order.items : [];
  for (const item of items) {
    const batches = Array.isArray(item?.batchesUsed) ? item.batchesUsed : [];
    for (const b of batches) {
      if (b?.store) return String(b.store);
    }
  }
  return null;
}

async function getDeliveryBoyIds(organizationId: string): Promise<string[]> {
  const rows = await User.find({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    role: ROLES.DELIVERY,
  })
    .select("_id")
    .lean();
  return rows.map((r) => String(r._id));
}

function extractPopulatedUser(val: unknown): { _id?: unknown; name?: unknown; phone?: unknown } | null {
  if (val == null) return null;
  if (typeof val === "object" && ("name" in val || "phone" in val || "_id" in val)) {
    return val as { _id?: unknown; name?: unknown; phone?: unknown };
  }
  return null;
}

export async function notifyNewOrderAvailable(orderId: string, organizationId: string): Promise<void> {
  const order = await Order.findOne({ _id: orderId, ...tenantWhereClause(organizationId) }).lean();
  if (!order) return;
  const storeId = extractStoreIdFromOrder(order);
  if (!storeId) return;
  const store = await Store.findById(storeId).select("location").lean();
  const sLat = Number((store as any)?.location?.lat);
  const sLng = Number((store as any)?.location?.lng);

  const deliveryUsers = await User.find({
    organizationId: new mongoose.Types.ObjectId(organizationId),
    role: ROLES.DELIVERY,
  })
    .select("_id deliveryLastLat deliveryLastLng deliveryLastAt")
    .lean();
  if (deliveryUsers.length === 0) return;

  // Optional targeting: prefer nearby & recently-active couriers.
  // Safe fallback: if no one matches, keep legacy broadcast-to-all behavior.
  const maxDistanceKm = Number(process.env.PUSH_DELIVERY_MAX_DISTANCE_KM ?? 10);
  const maxLocationAgeMinutes = Number(process.env.PUSH_DELIVERY_LOCATION_MAX_AGE_MINUTES ?? 30);
  const hasValidStoreCoords = Number.isFinite(sLat) && Number.isFinite(sLng);
  const nowMs = Date.now();

  const filteredUsers =
    hasValidStoreCoords && Number.isFinite(maxDistanceKm) && Number.isFinite(maxLocationAgeMinutes)
      ? deliveryUsers.filter((u) => {
          const latVal = u?.deliveryLastLat;
          const lngVal = u?.deliveryLastLng;
          if (!Number.isFinite(latVal) || !Number.isFinite(lngVal)) return false;
          const lat = Number(latVal);
          const lng = Number(lngVal);
          const lastAtMs = u?.deliveryLastAt ? new Date(u.deliveryLastAt).getTime() : 0;
          if (!lastAtMs) return false;
          const ageMinutes = (nowMs - lastAtMs) / (1000 * 60);
          if (!Number.isFinite(ageMinutes) || ageMinutes > maxLocationAgeMinutes) return false;
          const km = haversineDistanceKm(lat, lng, Number(sLat), Number(sLng));
          return km <= maxDistanceKm;
        })
      : [];

  const targetUsers = filteredUsers.length > 0 ? filteredUsers : deliveryUsers;
  for (const u of targetUsers) {
    const dId = String(u._id);
    let km = 0;
    if (
      Number.isFinite(sLat) &&
      Number.isFinite(sLng) &&
      u?.deliveryLastLat != null &&
      u?.deliveryLastLng != null
    ) {
      km = haversineDistanceKm(
        Number(u.deliveryLastLat),
        Number(u.deliveryLastLng),
        Number(sLat),
        Number(sLng)
      );
    }
    const tokens = await pushService.getTokenStringsForUserInOrg(dId, organizationId);
    await pushService.sendToUsers(
      tokens,
      "New Order Available 📦",
      `Order #${orderId} — ${km.toFixed(1)}km away from store. Tap to accept.`,
      { orderId, screen: "delivery/available-orders", type: "delivery_order_available" }
    );
  }
}

export async function getAvailableOrders(actor: RequestActor, lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new AppError("Valid lat and lng are required", 400, "INVALID_LOCATION");
  }
  const filter = andWithTenant(actor.organizationId, {
    deliveryBoy: null,
    deliveryStatus: { $in: ["pending", null] },
    orderStatus: { $nin: ["cancelled", "delivered"] },
    rejectedBy: { $ne: actor.userId },
  });
  const orders = await Order.find(filter).sort({ createdAt: -1 }).lean();
  if (orders.length === 0) return [];

  const storeIds = [...new Set(orders.map((o: any) => extractStoreIdFromOrder(o)).filter(Boolean))] as string[];
  const stores = await Store.find({ _id: { $in: storeIds } })
    .select("name city address location deliveryFee")
    .lean();
  const storeById = new Map(stores.map((s: any) => [String(s._id), s]));

  const data = orders
    .map((order: any) => {
      const storeId = extractStoreIdFromOrder(order);
      const store = storeId ? storeById.get(storeId) : null;
      const sLat = Number(store?.location?.lat);
      const sLng = Number(store?.location?.lng);
      const distanceKm = Number.isFinite(sLat) && Number.isFinite(sLng)
        ? haversineDistanceKm(lat, lng, sLat, sLng)
        : Number.MAX_SAFE_INTEGER;
      const address = order.address ?? {};
      return {
        _id: String(order._id),
        itemsCount: Array.isArray(order.items) ? order.items.length : 0,
        totalAmount: Number(order.totalAmount ?? 0),
        deliveryFee: Number(store?.deliveryFee ?? 40),
        deliveryAddress: `${address?.address ?? ""}, ${address?.city ?? ""}`.trim(),
        store: store
          ? {
              _id: String(store._id),
              name: store.name,
              address: store.address,
              city: store.city,
            }
          : null,
        distanceKm,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
  return data;
}

export async function acceptOrder(actor: RequestActor, orderId: string) {
  const updated = await Order.findOneAndUpdate(
    andWithTenant(actor.organizationId, {
      _id: orderId,
      deliveryBoy: null,
      deliveryStatus: { $in: ["pending", null] },
      orderStatus: { $nin: ["cancelled", "delivered"] },
    }),
    {
      $set: {
        deliveryBoy: actor.userId,
        deliveryStatus: "assigned",
        acceptedAt: new Date(),
      },
    },
    { new: true }
  )
    .populate("user", "name phone")
    .populate("deliveryBoy", "name phone")
    .lean();

  if (!updated) {
    throw new AppError("Sorry, this order was already accepted", 409, "ORDER_ALREADY_ACCEPTED");
  }

  const allDeliveryBoys = await getDeliveryBoyIds(actor.organizationId);
  const otherIds = allDeliveryBoys.filter((id) => id !== actor.userId);
  const buyerId = typeof updated.user === "object" && updated.user?._id ? String(updated.user._id) : String(updated.user ?? "");
  const deliveryBoy = extractPopulatedUser(updated.deliveryBoy);
  const deliveryBoyName = typeof deliveryBoy?.name === "string" && deliveryBoy.name.trim() ? deliveryBoy.name : "Delivery Partner";
  const deliveryBoyPhone = typeof deliveryBoy?.phone === "string" && deliveryBoy.phone.trim() ? deliveryBoy.phone : undefined;

  if (buyerId) {
    void pushService.notifyCustomerDeliveryAssigned({
      organizationId: actor.organizationId,
      buyerId,
      orderId: String(updated._id),
      deliveryBoyName,
      deliveryBoyPhone,
    });
  }
  if (otherIds.length > 0) {
    void pushService.notifyOrderNoLongerAvailable({
      organizationId: actor.organizationId,
      orderId: String(updated._id),
      deliveryUserIds: otherIds,
    });
  }
  void pushService.notifyAdminsOrderAssigned(
    actor.organizationId,
    String(updated._id),
    deliveryBoyName
  );

  return { message: "Order accepted", order: updated };
}

export async function rejectOrder(actor: RequestActor, orderId: string) {
  const updated = await Order.findOneAndUpdate(
    andWithTenant(actor.organizationId, {
      _id: orderId,
      deliveryBoy: null,
      orderStatus: { $nin: ["cancelled", "delivered"] },
      $or: [
        { deliveryStatus: "pending" },
        { deliveryStatus: null },
        { deliveryStatus: { $exists: false } },
      ],
    }),
    {
      $addToSet: { rejectedBy: actor.userId },
    },
    { new: true }
  ).lean();
  if (!updated) {
    throw new AppError("Order not available", 404, "ORDER_NOT_AVAILABLE");
  }
  return { message: "Order rejected" };
}

export async function getMyDeliveries(actor: RequestActor) {
  const orders = await Order.find(
    andWithTenant(actor.organizationId, {
      deliveryBoy: actor.userId,
      orderStatus: { $nin: ["cancelled"] },
    })
  )
    .populate("user", "name phone")
    .sort({ createdAt: -1 })
    .lean();
  return orders;
}

export async function markPickedUp(actor: RequestActor, orderId: string) {
  const order = await Order.findOneAndUpdate(
    andWithTenant(actor.organizationId, {
      _id: orderId,
      deliveryBoy: actor.userId,
      deliveryStatus: { $in: ["assigned", "accepted"] },
    }),
    {
      $set: {
        deliveryStatus: "out_for_delivery",
        pickedUpAt: new Date(),
        orderStatus: "shipped",
      },
    },
    { new: true }
  ).lean();
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  return { message: "Order marked as picked up", order };
}

export async function sendDeliveryOtp(actor: RequestActor, orderId: string) {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
  const order = await Order.findOneAndUpdate(
    andWithTenant(actor.organizationId, {
      _id: orderId,
      deliveryBoy: actor.userId,
      deliveryStatus: "out_for_delivery",
    }),
    {
      $set: {
        otp: otpHash,
        otpExpiry: new Date(Date.now() + 5 * 60 * 1000),
      },
    },
    { new: true }
  )
    .populate("user", "_id")
    .lean();
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  const buyerId =
    typeof order.user === "object" && order.user && "_id" in order.user
      ? String((order.user as { _id: { toString(): string } })._id)
      : String(order.user ?? "");
  if (buyerId) {
    const pushed = await pushService.notifyOtp(buyerId, actor.organizationId, otp);
    if (!pushed) {
      throw new AppError(
        "Customer has no registered push token. Ask customer to login and enable notifications.",
        409,
        "CUSTOMER_PUSH_TOKEN_MISSING"
      );
    }
  }
  return { message: "OTP sent to customer" };
}

export async function confirmDelivery(actor: RequestActor, orderId: string, otp: string) {
  const order = await Order.findOne(
    andWithTenant(actor.organizationId, {
      _id: orderId,
      deliveryBoy: actor.userId,
      deliveryStatus: "out_for_delivery",
    })
  )
    .select("+otp otpExpiry otpAttempts")
    .lean();
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

  const now = Date.now();
  const expires = order.otpExpiry ? new Date(order.otpExpiry).getTime() : 0;
  if (!order.otp || !expires || expires < now) {
    throw new AppError("OTP expired. Please send OTP again.", 400, "OTP_EXPIRED");
  }
  const inputHash = crypto.createHash("sha256").update(String(otp)).digest("hex");
  if (inputHash !== order.otp) {
    await Order.updateOne({ _id: orderId }, { $inc: { otpAttempts: 1 } });
    throw new AppError("Invalid OTP", 400, "OTP_INVALID");
  }

  const updated = await Order.findOneAndUpdate(
    andWithTenant(actor.organizationId, { _id: orderId, deliveryBoy: actor.userId }),
    {
      $set: {
        deliveryStatus: "delivered",
        deliveredAt: new Date(),
        orderStatus: "delivered",
      },
      $unset: { otp: 1, otpExpiry: 1 },
    },
    { new: true }
  ).lean();
  return { message: "Delivery confirmed", order: updated };
}
