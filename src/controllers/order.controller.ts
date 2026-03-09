import { Request, Response } from "express";
import { getPaginationParams } from "../utils/pagination";
import * as orderService from "../services/order.service";

interface AuthRequest extends Request {
  user?: any;
}

const paramId = (id: string | string[] | undefined) =>
  (Array.isArray(id) ? id[0] : id) ?? "";

export const createOrder = async (req: AuthRequest, res: Response) => {
  const result = await orderService.createOrder(req.user._id.toString(), req.body);
  res.status(201).json(result);
};

export const getOrders = async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = getPaginationParams(req);
  const result = await orderService.getOrders(req.user._id.toString(), {
    page,
    limit,
    skip,
  });
  res.json(result);
};

export const getOrderById = async (req: AuthRequest, res: Response) => {
  const id = paramId(req.params.id);
  const order = await orderService.getOrderById(req.user._id.toString(), id);
  res.json(order);
};

export const getOrdersForAdmin = async (req: AuthRequest, res: Response) => {
  const { page, limit, skip } = getPaginationParams(req);
  const status = req.query.status as string | undefined;
  const paymentStatus = req.query.paymentStatus as string | undefined;
  const result = await orderService.getOrdersForAdmin({
    page,
    limit,
    skip,
    status,
    paymentStatus,
  });
  res.json(result);
};

export const getOrderByIdForAdmin = async (req: AuthRequest, res: Response) => {
  const id = paramId(req.params.id);
  const order = await orderService.getOrderByIdForAdmin(id);
  res.json(order);
};
