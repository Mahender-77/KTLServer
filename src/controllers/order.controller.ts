import { Request, Response } from "express";
import { getPaginationParams } from "../utils/pagination";
import * as orderService from "../services/order.service";

interface AuthRequest extends Request {
  user?: any;
}

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
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const order = await orderService.getOrderById(req.user._id.toString(), id);
  res.json(order);
};
