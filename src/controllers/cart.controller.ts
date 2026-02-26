import { Request, Response } from "express";
import * as cartService from "../services/cart.service";

interface AuthRequest extends Request {
  user?: any;
}

export const getCart = async (req: AuthRequest, res: Response) => {
  const result = await cartService.getCart(req.user._id.toString());
  res.json(result);
};

export const addToCart = async (req: AuthRequest, res: Response) => {
  const result = await cartService.addToCart(req.user._id.toString(), req.body);
  res.json(result);
};

export const removeFromCart = async (req: AuthRequest, res: Response) => {
  const result = await cartService.removeFromCart(req.user._id.toString(), req.body);
  res.json(result);
};

export const updateCartItem = async (req: AuthRequest, res: Response) => {
  const result = await cartService.updateCartItem(req.user._id.toString(), req.body);
  res.json(result);
};

export const clearCart = async (req: AuthRequest, res: Response) => {
  const result = await cartService.clearCart(req.user._id.toString());
  res.json(result);
};
