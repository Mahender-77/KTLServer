import Order from "../models/Order.js";
import SubOrder from "../models/SubOrder.js";
import { paginated, PaginatedResponse } from "../utils/pagination.js";
import { AppError } from "../utils/AppError.js";
import { ROLES } from "../constants/roles.js";
import type { RequestActor } from "../types/access.js";
import { andWithTenant, tenantWhereClause, tenantScopedIdFilter } from "../utils/tenantScope.js";
import * as pushService from "./push.service.js";

function getBuyerUserIdFromSubOrder(subOrder: { order?: unknown }): string | null | undefined {
  const order = subOrder?.order;
  if (order == null || typeof order !== "object" || !("user" in order)) return null;
  const u = (order as { user?: unknown }).user;
  if (u == null) return null;
  if (typeof u === "string") return u;
  if (typeof u === "object" && "_id" in u && (u as { _id?: { toString(): string } })._id) {
    return (u as { _id: { toString(): string } })._id.toString();
  }
  return null;
}

/**
 * Single sub-order for courier: same visibility as list (pool pending, or assigned to this user).
 */
export async function getDeliverySubOrderById(
  userId: string,
  organizationId: string,
  subOrderId: string
): Promise<Record<string, unknown>> {
  const filter = andWithTenant(organizationId, {
    _id: subOrderId,
    $or: [{ deliveryBoyId: userId }, { deliveryBoyId: null, deliveryStatus: "pending" }],
  });
  const subOrder = await SubOrder.findOne(filter)
    .populate({
      path: "order",
      populate: { path: "user", select: "name email phone" },
      select: "user address createdAt totalAmount paymentStatus orderStatus",
    })
    .populate("category", "name")
    .populate("items.product", "name images")
    .populate("deliveryBoyId", "name phone")
    .lean();

  if (!subOrder) {
    throw new AppError("SubOrder not found or not available", 404, "SUBORDER_NOT_FOUND");
  }
  return subOrder as unknown as Record<string, unknown>;
}

export async function getDeliverySubOrders(
  userId: string,
  organizationId: string,
  params: { page: number; limit: number; skip: number }
): Promise<PaginatedResponse<any>> {
  const { page, limit, skip } = params;
  const filter = andWithTenant(organizationId, {
    $or: [
      { deliveryBoyId: userId },
      { deliveryBoyId: null, deliveryStatus: "pending" },
    ],
  });
  const [subOrders, total] = await Promise.all([
    SubOrder.find(filter)
      .populate({
        path: "order",
        populate: { path: "user", select: "name email phone" },
        select: "user address createdAt totalAmount paymentStatus orderStatus",
      })
      .populate("category", "name")
      .populate("items.product", "name images")
      .populate("deliveryBoyId", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SubOrder.countDocuments(filter),
  ]);
  return paginated(subOrders, total, page, limit);
}

export async function acceptSubOrder(userId: string, organizationId: string, subOrderId: string) {
  const subOrder = await SubOrder.findOneAndUpdate(
    andWithTenant(organizationId, {
      _id: subOrderId,
      deliveryBoyId: null,
      deliveryStatus: "pending",
    }),
    { $set: { deliveryBoyId: userId, deliveryStatus: "accepted" } },
    { new: true, runValidators: true }
  )
    .populate({
      path: "order",
      populate: { path: "user", select: "name email phone" },
      select: "user address createdAt totalAmount paymentStatus orderStatus",
    })
    .populate("category", "name")
    .populate("items.product", "name images");

  if (!subOrder) {
    throw new AppError(
      "SubOrder not found, already accepted, or not available for acceptance",
      400,
      "SUBORDER_UNAVAILABLE"
    );
  }
  const orderPopulated = subOrder.order as { address?: { address?: string } } | null | undefined;
  const targetAddress =
    typeof orderPopulated?.address?.address === "string" ? orderPopulated.address.address : undefined;
  void pushService.notifyDeliveryAssigned({ _id: subOrder._id, address: targetAddress }, userId, organizationId);
  return { message: "SubOrder accepted successfully", subOrder };
}

export async function startSubOrderDelivery(userId: string, organizationId: string, subOrderId: string) {
  const subOrder = await SubOrder.findOneAndUpdate(
    andWithTenant(organizationId, {
      _id: subOrderId,
      deliveryBoyId: userId,
      deliveryStatus: "accepted",
    }),
    { $set: { deliveryStatus: "out_for_delivery" } },
    { new: true, runValidators: true }
  )
    .populate({
      path: "order",
      populate: { path: "user", select: "name email phone" },
      select: "user address createdAt totalAmount paymentStatus orderStatus",
    })
    .populate("category", "name")
    .populate("items.product", "name images");

  if (!subOrder) {
    throw new AppError(
      "SubOrder not found or not authorized to start delivery",
      403,
      "SUBORDER_UNAUTHORIZED"
    );
  }
  {
    const buyerId = getBuyerUserIdFromSubOrder(subOrder);
    const orderId = subOrder.order?._id?.toString?.();
    if (orderId) {
      if (buyerId) {
        void pushService.notifyOrderStatusChanged(buyerId, "In Transit", orderId, organizationId);
      }
      void pushService.notifyAdminsDeliveryUpdate(organizationId, orderId, "In Transit");
    }
  }
  return { message: "Delivery started", subOrder };
}

export async function completeSubOrderDelivery(userId: string, organizationId: string, subOrderId: string) {
  const subOrder = await SubOrder.findOneAndUpdate(
    andWithTenant(organizationId, {
      _id: subOrderId,
      deliveryBoyId: userId,
      deliveryStatus: "out_for_delivery",
    }),
    { $set: { deliveryStatus: "delivered" } },
    { new: true, runValidators: true }
  )
    .populate({
      path: "order",
      populate: { path: "user", select: "name email phone" },
      select: "user address createdAt totalAmount paymentStatus orderStatus",
    })
    .populate("category", "name")
    .populate("items.product", "name images");

  if (!subOrder) {
    throw new AppError(
      "SubOrder not found or not authorized to complete delivery",
      403,
      "SUBORDER_UNAUTHORIZED"
    );
  }

  const allSubOrders = await SubOrder.find(
    andWithTenant(organizationId, { order: subOrder.order._id })
  );
  const allDelivered = allSubOrders.every((so) => so.deliveryStatus === "delivered");
  if (allDelivered) {
    const updatedOrder = await Order.findOneAndUpdate(
      andWithTenant(organizationId, { _id: subOrder.order._id }),
      { $set: { orderStatus: "delivered" } }
    );
    if (!updatedOrder) {
      throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    }
  }

  {
    const buyerId = getBuyerUserIdFromSubOrder(subOrder);
    const orderId = subOrder.order?._id?.toString?.();
    if (orderId) {
      if (buyerId) {
        void pushService.notifyOrderStatusChanged(buyerId, "Delivered", orderId, organizationId);
      }
      void pushService.notifyAdminsDeliveryUpdate(organizationId, orderId, "Delivered");
    }
  }

  return {
    message: "SubOrder delivered successfully",
    subOrder,
    allDelivered,
  };
}

export async function updateLocation(
  userId: string,
  organizationId: string,
  data: { latitude: number; longitude: number }
) {
  const { latitude, longitude } = data;
  if (latitude == null || longitude == null) {
    throw new AppError("Latitude and longitude are required", 400, "LOCATION_REQUIRED");
  }
  const result = await SubOrder.updateMany(
    andWithTenant(organizationId, {
      deliveryBoyId: userId,
      deliveryStatus: { $in: ["accepted", "out_for_delivery"] },
    }),
    {
      $set: {
        "deliveryPersonLocation.latitude": latitude,
        "deliveryPersonLocation.longitude": longitude,
        "deliveryPersonLocation.lastUpdated": new Date(),
      },
    }
  );
  if (!(result as any)?.matchedCount || (result as any).matchedCount === 0) {
    throw new AppError("SubOrder not found", 404, "SUBORDER_NOT_FOUND");
  }
  return { message: "Location updated successfully" };
}

export async function getSubOrderTracking(actor: RequestActor, subOrderId: string) {
  const subOrder = await SubOrder.findOne(tenantScopedIdFilter(actor.organizationId, subOrderId))
    .populate("deliveryBoyId", "name phone")
    .populate({
      path: "order",
      select: "address user organizationId",
      populate: { path: "user", select: "name phone" },
    })
    .select("deliveryBoyId deliveryStatus deliveryPersonLocation order organizationId");

  if (!subOrder) throw new AppError("SubOrder not found", 404, "SUBORDER_NOT_FOUND");

  const orderDoc = subOrder.order as { user?: { toString(): string } | string };
  const ownerId =
    orderDoc?.user != null
      ? typeof orderDoc.user === "string"
        ? orderDoc.user
        : orderDoc.user.toString()
      : "";

  if (actor.role === ROLES.ADMIN) {
    return {
      deliveryBoy: subOrder.deliveryBoyId,
      location: subOrder.deliveryPersonLocation,
      deliveryStatus: subOrder.deliveryStatus,
      order: subOrder.order,
    };
  }

  if (ownerId === actor.userId) {
    return {
      deliveryBoy: subOrder.deliveryBoyId,
      location: subOrder.deliveryPersonLocation,
      deliveryStatus: subOrder.deliveryStatus,
      order: subOrder.order,
    };
  }

  if (actor.role === ROLES.DELIVERY) {
    const boyId = subOrder.deliveryBoyId?.toString?.() ?? "";
    if (boyId === actor.userId) {
      return {
        deliveryBoy: subOrder.deliveryBoyId,
        location: subOrder.deliveryPersonLocation,
        deliveryStatus: subOrder.deliveryStatus,
        order: subOrder.order,
      };
    }
  }

  throw new AppError("You do not have access to this sub-order", 403, "SUBORDER_ACCESS_DENIED");
}

async function loadOrderTrackingPayload(orderId: string, organizationId: string) {
  const order = await Order.findOne({ _id: orderId, ...tenantWhereClause(organizationId) })
    .populate("deliveryPerson", "name phone")
    .populate({
      path: "subOrders",
      populate: { path: "deliveryBoyId", select: "name phone" },
      select: "deliveryStatus deliveryBoyId deliveryPersonLocation",
    })
    .select("user deliveryPersonLocation deliveryStatus deliveryPerson subOrders");

  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

  return {
    deliveryPerson: order.deliveryPerson,
    location: order.deliveryPersonLocation,
    deliveryStatus: order.deliveryStatus,
    subOrders: order.subOrders,
  };
}

/**
 * Order-level tracking: buyer (owner), admin, or delivery person assigned to any suborder.
 */
export async function getOrderTracking(actor: RequestActor, orderId: string) {
  const stub = await Order.findOne(tenantScopedIdFilter(actor.organizationId, orderId))
    .select("user organizationId")
    .lean();
  if (!stub) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

  const ownerId = stub.user?.toString?.() ?? String(stub.user);

  if (actor.role === ROLES.ADMIN) {
    return loadOrderTrackingPayload(orderId, actor.organizationId);
  }

  if (ownerId === actor.userId) {
    return loadOrderTrackingPayload(orderId, actor.organizationId);
  }

  if (actor.role === ROLES.DELIVERY) {
    const assigned = await SubOrder.exists(
      andWithTenant(actor.organizationId, {
        order: orderId,
        deliveryBoyId: actor.userId,
      })
    );
    if (!assigned) {
      throw new AppError("You do not have access to this order", 403, "ORDER_ACCESS_DENIED");
    }
    return loadOrderTrackingPayload(orderId, actor.organizationId);
  }

  throw new AppError("You do not have access to this order", 403, "ORDER_ACCESS_DENIED");
}
