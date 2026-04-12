import { Request, Response } from "express";
import { getPaginationParams } from "../utils/pagination";
import * as orderService from "../services/order.service";
import * as deliveryService from "../services/delivery.service";
import * as orderDeliveryService from "../services/orderDelivery.service";
import * as pushService from "../services/push.service";
import { requestActor } from "../utils/requestActor";
import { AppError } from "../utils/AppError";
import { logger } from "../utils/logger";

interface AuthRequest extends Request {
  user?: any;
}

const paramId = (id: string | string[] | undefined) =>
  (Array.isArray(id) ? id[0] : id) ?? "";

export const createOrder = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId?.toString?.();
  if (!orgId && !req.user?.isSuperAdmin) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  if (!orgId) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  req.body = { ...(req.body ?? {}), organizationId: orgId };
  const result = await orderService.createOrder(requestActor(req), req.body);
  const buyerId = req.user?._id?.toString?.();
  if (buyerId && orgId) {
    void (async () => {
      try {
        await pushService.notifyOrderPlaced({
          _id: result.order._id,
          user: buyerId,
          organizationId: orgId,
        });
        await pushService.notifyClientAdminNewOrder({
          _id: result.order._id,
          organizationId: orgId,
          totalAmount: result.order.totalAmount ?? undefined,
        });
        await orderDeliveryService.notifyNewOrderAvailable(String(result.order._id), orgId);
      } catch (err) {
        logger.error("[push] post-createOrder notifications", {
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
  const result = await orderService.getOrdersForAdmin({
    page,
    limit,
    skip,
    status,
    paymentStatus,
    organizationId: actor.organizationId,
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
  void pushService.notifyOrderStatusEvent(
    result.buyerId,
    status,
    result.orderId,
    actor.organizationId
  );
  res.json({ message: "Order status updated", order: result.order });
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
