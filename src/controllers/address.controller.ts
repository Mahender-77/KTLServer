import { Request, Response } from "express";
import * as addressService from "../services/address.service";
import { requestActor } from "../utils/requestActor";
import { AppError } from "../utils/AppError";

interface AuthRequest extends Request {
  user?: any;
}

export const getAddresses = async (req: AuthRequest, res: Response) => {
  const addresses = await addressService.getAddresses(requestActor(req));
  res.json(addresses);
};

export const createAddress = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId?.toString?.();
  if (!orgId && !req.user?.isSuperAdmin) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  if (!orgId) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  req.body = { ...(req.body ?? {}), organizationId: orgId };
  const newAddress = await addressService.createAddress(requestActor(req), req.body);
  res.status(201).json(newAddress);
};

export const updateAddress = async (req: AuthRequest, res: Response) => {
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const address = await addressService.updateAddress(requestActor(req), id, req.body);
  res.json(address);
};

export const deleteAddress = async (req: AuthRequest, res: Response) => {
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await addressService.deleteAddress(requestActor(req), id);
  res.json(result);
};
