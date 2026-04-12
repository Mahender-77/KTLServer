import { Request, Response } from "express";
import { getPaginationParams } from "../utils/pagination";
import * as storeService from "../services/store.service";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { requestActor } from "../utils/requestActor";
import { resolvePublicCatalogScope } from "../utils/tenantScope";
import { AppError } from "../utils/AppError";
import { appendAuditLogSafe } from "../services/auditLog.service";

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
  await appendAuditLogSafe({
    organizationId: orgId,
    userId: req.user!._id.toString(),
    action: "store.created",
    metadata: { storeId: String(store._id), name: store.name },
  });
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
  const scope = await resolvePublicCatalogScope(req);
  const stores =
    scope.mode === "single"
      ? await storeService.getPublicStores(scope.organizationId)
      : scope.organizationIds.length === 0
        ? []
        : await storeService.getPublicStoresMarketplace(scope.organizationIds);
  res.json({ data: stores });
};

export const updateStore = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const raw = req.params.id;
  const id = typeof raw === "string" ? raw : (raw?.[0] ?? "");
  const store = await storeService.updateStore(id, organizationId, req.body);
  await appendAuditLogSafe({
    organizationId,
    userId: req.user!._id.toString(),
    action: "store.updated",
    metadata: { storeId: id },
  });
  res.json(store);
};

export const deleteStore = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const raw = req.params.id;
  const id = typeof raw === "string" ? raw : (raw?.[0] ?? "");
  const result = await storeService.deleteStore(id, organizationId);
  await appendAuditLogSafe({
    organizationId,
    userId: req.user!._id.toString(),
    action: "store.deleted",
    metadata: { storeId: id },
  });
  res.json(result);
};
