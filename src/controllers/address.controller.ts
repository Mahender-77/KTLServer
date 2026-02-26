import { Request, Response } from "express";
import * as addressService from "../services/address.service";

interface AuthRequest extends Request {
  user?: any;
}

export const getAddresses = async (req: AuthRequest, res: Response) => {
  const addresses = await addressService.getAddresses(req.user._id.toString());
  res.json(addresses);
};

export const createAddress = async (req: AuthRequest, res: Response) => {
  const newAddress = await addressService.createAddress(req.user._id.toString(), req.body);
  res.status(201).json(newAddress);
};

export const updateAddress = async (req: AuthRequest, res: Response) => {
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const address = await addressService.updateAddress(req.user._id.toString(), id, req.body);
  res.json(address);
};

export const deleteAddress = async (req: AuthRequest, res: Response) => {
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await addressService.deleteAddress(req.user._id.toString(), id);
  res.json(result);
};
