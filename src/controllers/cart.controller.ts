import { Request, Response } from "express";
import * as cartService from "../services/cart.service";
import { requestActor } from "../utils/requestActor";
import { AppError } from "../utils/AppError";

interface AuthRequest extends Request {
  user?: any;
}

export const getCart = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const result = await cartService.getCart(req.user._id.toString(), actor.organizationId);
  res.json(result);
};

export const addToCart = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId?.toString?.();
  if (!orgId && !req.user?.isSuperAdmin) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  if (!orgId) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  req.body = { ...(req.body ?? {}), organizationId: orgId };
  const actor = requestActor(req);
  const result = await cartService.addToCart(req.user._id.toString(), actor.organizationId, req.body);
  res.json(result);
};

export const removeFromCart = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const result = await cartService.removeFromCart(req.user._id.toString(), actor.organizationId, req.body);
  res.json(result);
};

export const updateCartItem = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const result = await cartService.updateCartItem(req.user._id.toString(), actor.organizationId, req.body);
  res.json(result);
};

export const clearCart = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const result = await cartService.clearCart(req.user._id.toString(), actor.organizationId);
  res.json(result);
};
