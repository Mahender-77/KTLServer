import { Request, Response } from "express";
import { getPaginationParams } from "../utils/pagination";
import * as storeService from "../services/store.service";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { requestActor } from "../utils/requestActor";
import { resolvePublicOrganizationId } from "../utils/tenantScope";
import { AppError } from "../utils/AppError";

export const createStore = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId?.toString?.();
  if (!orgId && !req.user?.isSuperAdmin) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  if (!orgId) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  req.body = { ...(req.body ?? {}), organizationId: orgId };
  const store = await storeService.createStore(orgId, req.body);
  res.status(201).json(store);
};

export const getStores = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const { page, limit, skip } = getPaginationParams(req);
  const result = await storeService.getStores({
    page,
    limit,
    skip,
    organizationId: actor.organizationId,
    isSuperAdmin: actor.isSuperAdmin === true,
  });
  res.json(result);
};

export const getPublicStores = async (req: Request, res: Response) => {
  const organizationId = await resolvePublicOrganizationId(req);
  if (!organizationId) {
    return res.json({ data: [] });
  }
  const stores = await storeService.getPublicStores(organizationId);
  res.json({ data: stores });
};

export const updateStore = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const raw = req.params.id;
  const id = typeof raw === "string" ? raw : (raw?.[0] ?? "");
  const store = await storeService.updateStore(id, organizationId, req.body);
  res.json(store);
};

export const deleteStore = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const raw = req.params.id;
  const id = typeof raw === "string" ? raw : (raw?.[0] ?? "");
  const result = await storeService.deleteStore(id, organizationId);
  res.json(result);
};
