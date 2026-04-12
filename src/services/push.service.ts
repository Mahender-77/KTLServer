import mongoose from "mongoose";
import { logger } from "../utils/logger";
import PushToken from "../models/PushToken";
import User from "../models/User";
import { ROLES } from "../constants/roles";
import {
  sendPushNotification as sendSingleTokenNotification,
  sendToMultipleTokens,
  isExpoPushToken,
} from "./pushNotificationService";

/**
 * Deletes push token rows that Expo reports as no longer valid.
 */
async function deleteInvalidTokens(tokensToRemove: string[]): Promise<void> {
  const unique = [...new Set(tokensToRemove.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    const result = await PushToken.deleteMany({ token: { $in: unique } });
    if (result.deletedCount && result.deletedCount > 0) {
      logger.info(`[push] Removed ${result.deletedCount} invalid push token(s) from DB`);
    }
  } catch (err) {
    logger.error("[push] Failed to delete invalid push tokens from DB", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    if (!isExpoPushToken(token)) {
      logger.warn("[push] sendPushNotification: invalid Expo push token");
      return;
    }
    const { invalidTokens } = await sendSingleTokenNotification(token, title, body, data ?? {});
    if (invalidTokens.length > 0) {
      await deleteInvalidTokens(invalidTokens);
    }
  } catch (err) {
    logger.error("[push] sendPushNotification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function sendToUsers(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  try {
    if (tokens.length === 0) {
      logger.warn("[push] sendToUsers: no Expo push tokens");
      return;
    }
    const { invalidTokens } = await sendToMultipleTokens(tokens, title, body, data ?? {});
    if (invalidTokens.length > 0) {
      await deleteInvalidTokens(invalidTokens);
    }
  } catch (err) {
    logger.error("[push] sendToUsers failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function getTokenStringsForUser(userId: string, organizationId: string): Promise<string[]> {
  const rows = await PushToken.find({
    userId: new mongoose.Types.ObjectId(userId),
    organizationId: new mongoose.Types.ObjectId(organizationId),
  })
    .select("token")
    .lean();
  return rows.map((r) => r.token);
}

async function getTokenStringsForUsers(userIds: string[], organizationId: string): Promise<string[]> {
  if (userIds.length === 0) return [];
  const objectIds = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await PushToken.find({
    userId: { $in: objectIds },
    organizationId: new mongoose.Types.ObjectId(organizationId),
  })
    .select("token")
    .lean();
  return rows.map((r) => r.token);
}

function extractUserId(user: unknown): string | null {
  if (user == null) return null;
  if (typeof user === "string") return user;
  if (typeof user === "object" && "_id" in user && (user as { _id?: { toString(): string } })._id) {
    return (user as { _id: { toString(): string } })._id.toString();
  }
  return null;
}

/**
 * Buyer: order placed confirmation (IDs only in data).
 */
export async function notifyOrderPlaced(order: {
  _id: { toString(): string };
  user?: unknown;
  organizationId: string | { toString(): string };
}): Promise<void> {
  try {
    const buyerId = extractUserId(order.user);
    const orgId =
      typeof order.organizationId === "string"
        ? order.organizationId
        : order.organizationId.toString();
    if (!buyerId) {
      logger.warn("[push] notifyOrderPlaced: missing buyer user id");
      return;
    }
    const orderId = order._id.toString();
    const tokens = await getTokenStringsForUser(buyerId, orgId);
    await sendToUsers(tokens, "Order Confirmed 🎉", `Your order #${orderId} has been placed successfully`, {
      orderId,
      type: "order_placed",
    });
  } catch (err) {
    logger.error("[push] notifyOrderPlaced failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Courier: new assignment (IDs only in data). `deliveryUserId` is the assigned delivery person.
 */
export async function notifyDeliveryAssigned(
  subOrder: { _id: { toString(): string }; address?: string },
  deliveryUserId: string,
  organizationId: string
): Promise<void> {
  try {
    const subOrderId = subOrder._id.toString();
    const tokens = await getTokenStringsForUser(deliveryUserId, organizationId);
    await sendToUsers(
      tokens,
      "New Delivery Assigned 📦",
      `You have a new delivery order #${subOrderId} to ${subOrder.address ?? "customer address"}`,
      {
        subOrderId,
        type: "delivery_assigned",
      }
    );
    await sendToUsers(tokens, "Pickup Reminder 🏪", `Please pick up order #${subOrderId} from the store`, {
      subOrderId,
      type: "pickup_reminder",
    });
  } catch (err) {
    logger.error("[push] notifyDeliveryAssigned failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Buyer: order status text update (no PII in data).
 */
export async function notifyOrderStatusChanged(
  buyerId: string,
  status: string,
  orderId: string,
  organizationId: string
): Promise<void> {
  try {
    const tokens = await getTokenStringsForUser(buyerId, organizationId);
    await sendToUsers(
      tokens,
      "Order Update",
      `Your order status is now: ${status}`,
      { orderId, type: "order_status" }
    );
  } catch (err) {
    logger.error("[push] notifyOrderStatusChanged failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function notifyOrderStatusEvent(
  buyerId: string,
  status: "confirmed" | "out_for_delivery" | "delivered" | "cancelled",
  orderId: string,
  organizationId: string
): Promise<void> {
  const messageByStatus = {
    confirmed: {
      title: "Order Confirmed ✅",
      body: `Your order #${orderId} is confirmed and being prepared`,
    },
    out_for_delivery: {
      title: "Out for Delivery 🚚",
      body: `Your order #${orderId} is on the way!`,
    },
    delivered: {
      title: "Order Delivered 📦",
      body: `Your order #${orderId} has been delivered. Enjoy!`,
    },
    cancelled: {
      title: "Order Cancelled ❌",
      body: `Your order #${orderId} has been cancelled`,
    },
  } as const;

  try {
    const tokens = await getTokenStringsForUser(buyerId, organizationId);
    const msg = messageByStatus[status];
    await sendToUsers(tokens, msg.title, msg.body, {
      orderId,
      type: `order_${status}`,
    });
  } catch (err) {
    logger.error("[push] notifyOrderStatusEvent failed", {
      error: err instanceof Error ? err.message : String(err),
      status,
      orderId,
    });
  }
}

export async function notifyOtp(userId: string, organizationId: string, otp: string): Promise<void> {
  try {
    const tokens = await getTokenStringsForUser(userId, organizationId);
    await sendToUsers(tokens, "Your OTP 🔐", `Your verification code is: ${otp}. Valid for 5 minutes.`, {
      type: "otp",
      otp,
    });
  } catch (err) {
    logger.error("[push] notifyOtp failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function notifyDeliveryOrderAvailable(params: {
  organizationId: string;
  orderId: string;
  distanceKm: number;
  deliveryUserIds: string[];
}): Promise<void> {
  const { organizationId, orderId, distanceKm, deliveryUserIds } = params;
  try {
    const tokens = await getTokenStringsForUsers(deliveryUserIds, organizationId);
    await sendToUsers(
      tokens,
      "New Order Available 📦",
      `Order #${orderId} — ${distanceKm.toFixed(1)}km away from store. Tap to accept.`,
      { orderId, screen: "delivery/available-orders", type: "delivery_order_available" }
    );
  } catch (err) {
    logger.error("[push] notifyDeliveryOrderAvailable failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function notifyOrderNoLongerAvailable(params: {
  organizationId: string;
  orderId: string;
  deliveryUserIds: string[];
}): Promise<void> {
  const { organizationId, orderId, deliveryUserIds } = params;
  try {
    const tokens = await getTokenStringsForUsers(deliveryUserIds, organizationId);
    await sendToUsers(tokens, "Order No Longer Available", `Order #${orderId} has been accepted by another delivery boy.`, {
      orderId,
      type: "delivery_order_taken",
    });
  } catch (err) {
    logger.error("[push] notifyOrderNoLongerAvailable failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function notifyCustomerDeliveryAssigned(params: {
  organizationId: string;
  buyerId: string;
  orderId: string;
  deliveryBoyName: string;
  deliveryBoyPhone?: string;
}): Promise<void> {
  const { organizationId, buyerId, orderId, deliveryBoyName, deliveryBoyPhone } = params;
  try {
    const tokens = await getTokenStringsForUser(buyerId, organizationId);
    await sendToUsers(
      tokens,
      "Delivery Boy Assigned 🚴",
      `${deliveryBoyName} will deliver your order. Contact: ${deliveryBoyPhone ?? "N/A"}`,
      { orderId, type: "delivery_assigned_customer" }
    );
  } catch (err) {
    logger.error("[push] notifyCustomerDeliveryAssigned failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Tenant admins: new order alert (IDs only in data).
 */
export async function notifyClientAdminNewOrder(order: {
  _id: { toString(): string };
  organizationId: string | { toString(): string };
  totalAmount?: number;
}): Promise<void> {
  try {
    const orgId =
      typeof order.organizationId === "string"
        ? order.organizationId
        : order.organizationId.toString();
    const orderId = order._id.toString();
    const orgObjectId = new mongoose.Types.ObjectId(orgId);
    const admins = await User.find({
      organizationId: orgObjectId,
      role: ROLES.ADMIN,
    })
      .select("_id")
      .lean();
    if (admins.length === 0) return;
    const adminIds = admins.map((a) => a._id);
    const rows = await PushToken.find({
      userId: { $in: adminIds },
      organizationId: orgObjectId,
    })
      .select("token")
      .lean();
    const tokens = rows.map((r) => r.token);
    await sendToUsers(
      tokens,
      "New Order Received 🛒",
      `A new order #${orderId} worth ₹${Number(order.totalAmount ?? 0).toLocaleString("en-IN")} has been placed`,
      { orderId, type: "admin_new_order" }
    );
  } catch (err) {
    logger.error("[push] notifyClientAdminNewOrder failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
