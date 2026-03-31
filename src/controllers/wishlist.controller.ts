import { Request, Response } from "express";
import * as wishlistService from "../services/wishlist.service";
import { requestActor } from "../utils/requestActor";

interface AuthRequest extends Request {
  user?: any;
}

export const getWishlist = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const result = await wishlistService.getWishlist(req.user._id.toString(), actor.organizationId);
  res.json(result);
};

export const addToWishlist = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const result = await wishlistService.addToWishlist(
    req.user._id.toString(),
    actor.organizationId,
    req.body.productId
  );
  res.json(result);
};

export const removeFromWishlist = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const result = await wishlistService.removeFromWishlist(
    req.user._id.toString(),
    actor.organizationId,
    req.body.productId
  );
  res.json(result);
};
