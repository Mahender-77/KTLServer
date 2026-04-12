import { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { getPaginationParams } from "../utils/pagination";
import * as inventoryService from "../services/inventory.service";

const paramProductId = (id: string | string[] | undefined) =>
  (Array.isArray(id) ? id[0] : id) ?? "";

export const listInventory = async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId!.toString();
  const { page, limit, skip } = getPaginationParams(req);
  const result = await inventoryService.listInventory({
    organizationId: orgId,
    page,
    limit,
    skip,
  });
  res.json(result);
};

export const patchInventoryThreshold = async (req: AuthRequest, res: Response) => {
  const orgId = req.user!.organizationId!.toString();
  const productId = paramProductId(req.params.productId);
  const lowStockThreshold = Number((req.body as { lowStockThreshold?: number }).lowStockThreshold);
  const actorUserId = req.user!._id.toString();
  const result = await inventoryService.patchLowStockThreshold(
    productId,
    orgId,
    lowStockThreshold,
    actorUserId
  );
  res.json(result);
};
