import { Request, Response } from "express";
import { getPaginationParams } from "../utils/pagination";
import * as orderService from "../services/order.service";
import { requestActor } from "../utils/requestActor";
import { AppError } from "../utils/AppError";

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
