import { Request, Response } from "express";
import { getPaginationParams } from "../utils/pagination";
import * as storeService from "../services/store.service";

export const createStore = async (req: Request, res: Response) => {
  const store = await storeService.createStore(req.body);
  res.status(201).json(store);
};

export const getStores = async (req: Request, res: Response) => {
  const { page, limit, skip } = getPaginationParams(req);
  const result = await storeService.getStores({ page, limit, skip });
  res.json(result);
};

export const deleteStore = async (req: Request, res: Response) => {
  const raw = req.params.id;
  const id = typeof raw === "string" ? raw : (raw?.[0] ?? "");
  const result = await storeService.deleteStore(id);
  res.json(result);
};
