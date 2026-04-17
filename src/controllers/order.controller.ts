import { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

import { getPaginationParams } from "../utils/pagination.js";
import * as orderService from "../services/order.service.js";
import * as deliveryService from "../services/delivery.service.js";
import * as orderDeliveryService from "../services/orderDelivery.service.js";
import * as pushService from "../services/push.service.js";
import { requestActor } from "../utils/requestActor.js";
import { logger } from "../utils/logger.js";

interface AuthRequest extends Request {
  user?: any;
}

const paramId = (id: string | string[] | undefined) =>
  (Array.isArray(id) ? id[0] : id) ?? "";

export const createOrder = async (req: AuthRequest, res: Response) => {
  console.log("createOrder", req.user);

  const buyerOrgId = req.user?.organizationId?.toString?.();

  if (!buyerOrgId && !req.user?.isSuperAdmin) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  if (!buyerOrgId) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }

  // attach buyer org to request
  req.body = { ...(req.body ?? {}), organizationId: buyerOrgId };

  const result = await orderService.createOrder(requestActor(req), req.body);

  const buyerId = req.user?._id?.toString?.();

  // ✅ seller org comes from created order
  const sellerOrgRaw = result?.order?.organizationId;
  const sellerOrgId =
    typeof sellerOrgRaw === "string"
      ? sellerOrgRaw
      : sellerOrgRaw != null
        ? String(sellerOrgRaw)
        : undefined;

  if (buyerId && buyerOrgId) {
    try {
      // ✅ USER NOTIFICATION → use buyerOrgId
      await pushService.notifyOrderPlaced({
        _id: result.order._id,
        user: buyerId,
        organizationId: buyerOrgId,
        totalAmount: result.order.totalAmount ?? undefined,
        itemsCount: Array.isArray(req.body?.items) ? req.body.items.length : undefined,
      });
    } catch (err) {
      logger.error("[push] notifyOrderPlaced after createOrder", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    void (async () => {
      try {
        if (sellerOrgId) {
          // ✅ ADMIN → seller org
          await pushService.notifyClientAdminNewOrder({
            _id: result.order._id,
            organizationId: sellerOrgId,
            totalAmount: result.order.totalAmount ?? undefined,
          });

          // ✅ DELIVERY → seller org
          await orderDeliveryService.notifyNewOrderAvailable(
            String(result.order._id),
            sellerOrgId
          );
        }
      } catch (err) {
        logger.error("[push] post-createOrder secondary notifications", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }

  res.status(201).json(result);
};

export const getOrders = async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = getPaginationParams(req);
  const result = await orderService.getOrders(requestActor(req), {
    page,
    limit,
    skip,
  });
  res.json(result);
};

export const getMyOrders = async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = getPaginationParams(req);
  const result = await orderService.getMyOrders(requestActor(req), {
    page,
    limit,
    skip,
  });
  res.json(result);
};

export const getOrderById = async (req: AuthRequest, res: Response) => {
  const id = paramId(req.params.id);
  const order = await orderService.getOrderById(requestActor(req), id);
  res.json(order);
};

export const getOrdersForAdmin = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const { page, limit, skip } = getPaginationParams(req);
  const status = req.query.status as string | undefined;
  const paymentStatus = req.query.paymentStatus as string | undefined;
  logger.info("[orders/admin] request", {
    userId: req.user?._id?.toString?.(),
    actorOrgId: actor.organizationId,
    headerOrgId:
      (Array.isArray(req.headers["x-organization-id"])
        ? req.headers["x-organization-id"][0]
        : req.headers["x-organization-id"]) ?? null,
    status: status ?? "all",
    paymentStatus: paymentStatus ?? "all",
    page,
    limit,
  });
  const result = await orderService.getOrdersForAdmin({
    page,
    limit,
    skip,
    status,
    paymentStatus,
    organizationId: actor.organizationId,
  });
  logger.info("[orders/admin] response", {
    actorOrgId: actor.organizationId,
    returned: Array.isArray(result.data) ? result.data.length : 0,
    total: result.total ?? 0,
    page: result.page ?? page,
    totalPages: result.totalPages ?? 1,
  });
  res.json(result);
};

export const getOrderByIdForAdmin = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = paramId(req.params.id);
  const order = await orderService.getOrderByIdForAdmin(id, actor.organizationId);
  res.json(order);
};

/** Same payload as GET /api/delivery/orders/:id/tracking for tenant admins (ORDER module only). */
export const getOrderTrackingForAdmin = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = paramId(req.params.id);
  const payload = await deliveryService.getOrderTracking(actor, id);
  res.json(payload);
};

export const updateOrderStatus = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = paramId(req.params.id);
  const { status } = req.body as { status: "confirmed" | "out_for_delivery" | "delivered" | "cancelled" };
  const result = await orderService.updateOrderStatusForAdmin(id, status, actor.organizationId);
  const notified = await pushService.notifyOrderStatusEvent(
    result.buyerId,
    status,
    result.orderId,
    actor.organizationId
  );
  void (async () => {
    try {
      const deliveryBoyIdRaw = (result.order as { deliveryBoy?: unknown })?.deliveryBoy;
      const deliveryBoyId =
        deliveryBoyIdRaw != null
          ? typeof deliveryBoyIdRaw === "string"
            ? deliveryBoyIdRaw
            : (deliveryBoyIdRaw as { toString?: () => string }).toString?.() ?? ""
          : "";
      if (!deliveryBoyId) return;

      const tokens = await pushService.getTokenStringsForUserInOrg(deliveryBoyId, actor.organizationId);
      if (tokens.length === 0) return;
      await pushService.sendToUsers(
        tokens,
        "Order Status Updated",
        `Order #${result.orderId} status updated to ${status}`,
        { orderId: result.orderId, type: "order_status" }
      );
    } catch (err) {
      logger.error("[push] notify delivery boy order status update failed", {
        error: err instanceof Error ? err.message : String(err),
        orderId: result.orderId,
        organizationId: actor.organizationId,
        status,
      });
    }
  })();
  res.json({
    message: notified
      ? "Order status updated and customer notified"
      : "Order status updated (customer push token missing)",
    order: result.order,
    notification: {
      delivered: notified,
      code: notified ? "PUSH_SENT" : "CUSTOMER_PUSH_TOKEN_MISSING",
    },
  });
};

export const getAvailableOrders = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const data = await orderDeliveryService.getAvailableOrders(actor, lat, lng);
  res.json({ data });
};

export const acceptOrderForDelivery = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = paramId(req.params.id);
  const result = await orderDeliveryService.acceptOrder(actor, id);
  res.json(result);
};

export const rejectOrderForDelivery = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = paramId(req.params.id);
  const result = await orderDeliveryService.rejectOrder(actor, id);
  res.json(result);
};

export const getMyDeliveries = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const data = await orderDeliveryService.getMyDeliveries(actor);
  res.json({ data });
};

export const markOrderPickedUp = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = paramId(req.params.id);
  const result = await orderDeliveryService.markPickedUp(actor, id);
  res.json(result);
};

export const sendDeliveryOtp = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = paramId(req.params.id);
  const result = await orderDeliveryService.sendDeliveryOtp(actor, id);
  res.json(result);
};

export const confirmOrderDelivery = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = paramId(req.params.id);
  const otp = String(req.body?.otp ?? "");
  const result = await orderDeliveryService.confirmDelivery(actor, id, otp);
  res.json(result);
};
