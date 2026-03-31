import { Request, Response } from "express";
import { getPaginationParams } from "../utils/pagination";
import { requestActor } from "../utils/requestActor";
import * as deliveryService from "../services/delivery.service";

interface AuthRequest extends Request {
  user?: any;
}

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
  res.json(result);
};

export const startSubOrderDelivery = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await deliveryService.startSubOrderDelivery(req.user._id.toString(), actor.organizationId, id);
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
