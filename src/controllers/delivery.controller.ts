import { Request, Response } from "express";
import { getPaginationParams } from "../utils/pagination";
import { requestActor } from "../utils/requestActor";
import * as deliveryService from "../services/delivery.service";
import { appendAuditLogSafe } from "../services/auditLog.service";

interface AuthRequest extends Request {
  user?: any;
}

export const getDeliverySubOrderById = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const subOrder = await deliveryService.getDeliverySubOrderById(
    req.user._id.toString(),
    actor.organizationId,
    id
  );
  res.json({ data: subOrder });
};

export const getDeliverySubOrders = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const { page, limit, skip } = getPaginationParams(req);
  const result = await deliveryService.getDeliverySubOrders(req.user._id.toString(), actor.organizationId, {
    page,
    limit,
    skip,
  });
  res.json(result);
};

export const acceptSubOrder = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await deliveryService.acceptSubOrder(req.user._id.toString(), actor.organizationId, id);
  await appendAuditLogSafe({
    organizationId: actor.organizationId,
    userId: req.user._id.toString(),
    action: "delivery.suborder_accepted",
    metadata: { subOrderId: id },
  });
  res.json(result);
};

export const startSubOrderDelivery = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await deliveryService.startSubOrderDelivery(req.user._id.toString(), actor.organizationId, id);
  await appendAuditLogSafe({
    organizationId: actor.organizationId,
    userId: req.user._id.toString(),
    action: "delivery.suborder_out_for_delivery",
    metadata: { subOrderId: id },
  });
  res.json(result);
};

export const completeSubOrderDelivery = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await deliveryService.completeSubOrderDelivery(
    req.user._id.toString(),
    actor.organizationId,
    id
  );
  await appendAuditLogSafe({
    organizationId: actor.organizationId,
    userId: req.user._id.toString(),
    action: "delivery.suborder_delivered",
    metadata: { subOrderId: id },
  });
  res.json(result);
};

export const updateLocation = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const result = await deliveryService.updateLocation(req.user._id.toString(), actor.organizationId, req.body);
  res.json(result);
};

export const getSubOrderTracking = async (req: AuthRequest, res: Response) => {
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await deliveryService.getSubOrderTracking(requestActor(req), id);
  res.json(result);
};

export const getOrderTracking = async (req: AuthRequest, res: Response) => {
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await deliveryService.getOrderTracking(requestActor(req), id);
  res.json(result);
};
