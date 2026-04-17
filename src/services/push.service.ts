import mongoose from "mongoose";
import { logger } from "../utils/logger.js";
import PushToken from "../models/PushToken.js";
import User from "../models/User.js";
import { ROLES } from "../constants/roles.js";
import {
  sendPushNotification as sendSingleTokenNotification,
  sendToMultipleTokens,
  isExpoPushToken,
} from "./pushNotificationService.js";

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
    logger.info("[push] sending notification", {
      title,
      userCount: 1,
      tokenSuffixes: [`...${token.slice(-6)}`],
    });
    const { invalidTokens } = await sendSingleTokenNotification(token, title, body, data ?? {});
    if (invalidTokens.length > 0) {
      await deleteInvalidTokens(invalidTokens);
    }
    logger.info("[push] notification sent successfully", { title, userCount: 1 });
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
    logger.info("[push] sending notification", {
      title,
      userCount: tokens.length,
      tokenSuffixes: tokens.map((t) => `...${t.slice(-6)}`),
    });
    const { invalidTokens } = await sendToMultipleTokens(tokens, title, body, data ?? {});
    if (invalidTokens.length > 0) {
      await deleteInvalidTokens(invalidTokens);
    }
    logger.info("[push] notification sent successfully", {
      title,
      userCount: tokens.length,
    });
  } catch (err) {
    logger.error("[push] sendToUsers failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Buyer / end-user notifications: resolve tokens by userId only so multi-tenant
 * seller-order org vs buyer token org mismatches do not block delivery.
 * `organizationId` is kept for API compatibility and logging context only.
 */
export async function getTokenStringsForUser(userId: string, organizationId: string): Promise<string[]> {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const rows = await PushToken.find({
    userId: userObjectId,
  })
    .select("token")
    .lean();
  const fromPushTokens = [...new Set(rows.map((r) => r.token).filter((t) => typeof t === "string" && t.length > 0))];
  if (fromPushTokens.length > 0) {
    logger.info("[push] tokens fetched", {
      userId,
      contextOrganizationId: organizationId,
      count: fromPushTokens.length,
      tokenSuffixes: fromPushTokens.map((t) => `...${t.slice(-6)}`),
    });
    return fromPushTokens;
  }

  logger.warn("[push] no tokens found", {
    userId,
    contextOrganizationId: organizationId,
  });
  return [];
}

/**
 * Delivery (and other org-scoped) notifications: same user, tokens restricted to tenant.
 */
export async function getTokenStringsForUserInOrg(userId: string, organizationId: string): Promise<string[]> {
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const orgObjectId = new mongoose.Types.ObjectId(organizationId);

  const rows = await PushToken.find({
    userId: userObjectId,
    organizationId: orgObjectId,
  })
    .select("token")
    .lean();
  const fromPushTokens = [...new Set(rows.map((r) => r.token).filter((t) => typeof t === "string" && t.length > 0))];
  if (fromPushTokens.length > 0) {
    logger.info("[push] tokens fetched (org-scoped)", {
      userId,
      organizationId,
      count: fromPushTokens.length,
      tokenSuffixes: fromPushTokens.map((t) => `...${t.slice(-6)}`),
    });
    return fromPushTokens;
  }

  logger.warn("[push] no tokens found (org-scoped)", {
    userId,
    organizationId,
  });
  return [];
}

// DB stores field as "userId" — must match exactly
async function getTokenStringsForUsers(userIds: string[], organizationId: string): Promise<string[]> {
  if (userIds.length === 0) return [];
  const objectIds = userIds.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await PushToken.find({
    userId: { $in: objectIds },
    organizationId: new mongoose.Types.ObjectId(organizationId),
  })
    .select("token")
    .lean();
  const tokens = [...new Set(rows.map((r) => r.token).filter((t) => typeof t === "string" && t.length > 0))];
  if (tokens.length === 0) {
    logger.warn("[push] no tokens found", {
      organizationId,
      requestedUserCount: userIds.length,
    });
    return [];
  }
  logger.info("[push] tokens fetched", {
    organizationId,
    requestedUserCount: userIds.length,
    count: tokens.length,
    tokenSuffixes: tokens.map((t) => `...${t.slice(-6)}`),
  });
  return tokens;
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
  totalAmount?: number;
  itemsCount?: number;
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
    const shortRef = orderId.length >= 8 ? orderId.slice(-8).toUpperCase() : orderId;
    const itemsCount =
      typeof order.itemsCount === "number" && Number.isFinite(order.itemsCount)
        ? Math.max(0, Math.floor(order.itemsCount))
        : undefined;
    const totalPart =
      typeof order.totalAmount === "number" && Number.isFinite(order.totalAmount)
        ? `Total ₹${Math.floor(order.totalAmount).toLocaleString("en-IN")}. `
        : "";
    const itemsPart =
      typeof itemsCount === "number" && itemsCount > 0
        ? `${itemsCount} item${itemsCount === 1 ? "" : "s"} ordered. `
        : "";
    logger.info(`[push] notifyOrderPlaced start`, {
      buyerId,
      orgId,
      orderId,
      itemsCount: itemsCount ?? null,
      totalAmount:
        typeof order.totalAmount === "number" && Number.isFinite(order.totalAmount)
          ? Math.floor(order.totalAmount)
          : null,
    });
    const tokens = await getTokenStringsForUser(buyerId, orgId);
    logger.info(`[push] notifyOrderPlaced tokens found: ${tokens.length}`, {
      buyerId,
      orgId,
      orderId,
      tokenSuffixes: tokens.map((t) => `…${t.slice(-12)}`),
    });
    if (tokens.length === 0) {
      logger.warn("[push] notifyOrderPlaced skipped: no push tokens for buyer", {
        buyerId,
        orgId,
        orderId,
      });
      return;
    }
    await sendToUsers(
      tokens,
      "You ordered items successfully 🛍️",
      `${itemsPart}${totalPart}Order #${shortRef} placed successfully.`,
      {
        orderId,
        type: "order_placed",
        screen: "orders",
        orderRef: shortRef,
        itemsCount: itemsCount != null ? String(itemsCount) : undefined,
        totalAmount:
          typeof order.totalAmount === "number" && Number.isFinite(order.totalAmount)
            ? String(Math.floor(order.totalAmount))
            : undefined,
      }
    );
    logger.info("[push] notifyOrderPlaced dispatched", {
      buyerId,
      orgId,
      orderId,
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
    const tokens = await getTokenStringsForUserInOrg(deliveryUserId, organizationId);
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
): Promise<boolean> {
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
    logger.info(
      `[push] notifyOrderStatusEvent buyerId=${buyerId} orgId=${organizationId} orderId=${orderId} status=${status} tokens=${tokens.length}`
    );
    if (tokens.length === 0) {
      logger.warn(
        `[push] notifyOrderStatusEvent skipped: no push tokens for buyerId=${buyerId} orderId=${orderId}`
      );
      return false;
    }
    const msg = messageByStatus[status];
    await sendToUsers(tokens, msg.title, msg.body, {
      orderId,
      type: `order_${status}`,
    });
    return true;
  } catch (err) {
    logger.error("[push] notifyOrderStatusEvent failed", {
      error: err instanceof Error ? err.message : String(err),
      status,
      orderId,
    });
    return false;
  }
}

export async function notifyOtp(userId: string, organizationId: string, otp: string): Promise<boolean> {
  try {
    const tokens = await getTokenStringsForUser(userId, organizationId);
    logger.info(`[push] notifyOtp userId=${userId} orgId=${organizationId} tokens=${tokens.length}`);
    if (tokens.length === 0) {
      logger.warn(`[push] notifyOtp skipped: no push tokens for userId=${userId}`);
      return false;
    }
    await sendToUsers(tokens, "Your OTP 🔐", `Your verification code is: ${otp}. Valid for 5 minutes.`, {
      type: "otp",
      otp,
    });
    return true;
  } catch (err) {
    logger.error("[push] notifyOtp failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
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

export async function notifyAdminsDeliveryUpdate(
  organizationId: string,
  orderId: string,
  status: string
): Promise<void> {
  try {
    const orgObjectId = new mongoose.Types.ObjectId(organizationId);
    const admins = await User.find({
      organizationId: orgObjectId,
      role: ROLES.ADMIN,
    })
      .select("_id")
      .lean();
    if (admins.length === 0) return;

    const adminIds = admins.map((a) => String(a._id));
    const tokens = await getTokenStringsForUsers(adminIds, organizationId);
    if (tokens.length === 0) return;

    await sendToUsers(tokens, "Delivery Update", `Order #${orderId} status changed to ${status}`, {
      orderId,
      type: "admin_delivery_update",
      status,
    });
  } catch (err) {
    logger.error("[push] notifyAdminsDeliveryUpdate failed", {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
      orderId,
      status,
    });
  }
}

export async function notifyAdminsOrderAssigned(
  organizationId: string,
  orderId: string,
  deliveryBoyName: string
): Promise<void> {
  try {
    const orgObjectId = new mongoose.Types.ObjectId(organizationId);
    const admins = await User.find({
      organizationId: orgObjectId,
      role: ROLES.ADMIN,
    })
      .select("_id")
      .lean();
    if (admins.length === 0) return;

    const adminIds = [...new Set(admins.map((a) => String(a._id)))];
    const tokens = await getTokenStringsForUsers(adminIds, organizationId);
    if (tokens.length === 0) return;

    await sendToUsers(tokens, "Order Assigned", `Order #${orderId} accepted by ${deliveryBoyName}`, {
      orderId,
      type: "admin_order_assigned",
    });
  } catch (err) {
    logger.error("[push] notifyAdminsOrderAssigned failed", {
      error: err instanceof Error ? err.message : String(err),
      organizationId,
      orderId,
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
    // DB stores field as "userId" — must match exactly
    const rows = await PushToken.find({
      userId: { $in: adminIds },
      organizationId: orgObjectId,
    })
      .select("token")
      .lean();
    const tokens = rows.map((r) => r.token);
    if (tokens.length === 0) {
      logger.info(`[push] notifyClientAdminNewOrder orgId=${orgId} adminTokens=0`);
      return;
    }
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