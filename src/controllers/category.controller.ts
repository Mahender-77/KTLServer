import { Request, Response } from "express";
import * as categoryService from "../services/category.service";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { requestActor } from "../utils/requestActor";
import { resolvePublicCatalogScope } from "../utils/tenantScope";
import { AppError } from "../utils/AppError";
import { appendAuditLogSafe } from "../services/auditLog.service";

export const createCategory = async (req: AuthRequest, res: Response) => {
  const orgId = req.user?.organizationId?.toString?.();
  if (!orgId && !req.user?.isSuperAdmin) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  if (!orgId) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  req.body = { ...(req.body ?? {}), organizationId: orgId };
  const category = await categoryService.createCategory(orgId, req.body);
  await appendAuditLogSafe({
    organizationId: orgId,
    userId: req.user!._id.toString(),
    action: "category.created",
    metadata: { categoryId: String(category._id), name: category.name },
  });
  res.status(201).json(category);
};

export const getCategories = async (req: Request, res: Response) => {
  const scope = await resolvePublicCatalogScope(req);
  if (scope.mode === "single") {
    const tree = await categoryService.getCategoriesTree(scope.organizationId);
    return res.json(tree);
  }
  if (scope.organizationIds.length === 0) {
    return res.json([]);
  }
  const tree = await categoryService.getCategoriesTreeMarketplace(scope.organizationIds);
  res.json(tree);
};

export const getSubCategories = async (req: Request, res: Response) => {
  const scope = await resolvePublicCatalogScope(req);
  const parentId = (Array.isArray(req.params.parentId) ? req.params.parentId[0] : req.params.parentId) ?? "";
  if (scope.mode === "single") {
    const subCategories = await categoryService.getSubCategories(scope.organizationId, parentId);
    return res.json(subCategories);
  }
  if (scope.organizationIds.length === 0) {
    return res.json([]);
  }
  const subCategories = await categoryService.getSubCategoriesMarketplace(
    scope.organizationIds,
    parentId
  );
  res.json(subCategories);
};

export const getFlatCategories = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const categories = await categoryService.getFlatCategories(actor.organizationId);
  res.json(categories);
};

export const getCategoryById = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const category = await categoryService.getCategoryById(actor.organizationId, id);
  res.json(category);
};

export const updateCategory = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const category = await categoryService.updateCategory(organizationId, id, req.body);
  await appendAuditLogSafe({
    organizationId,
    userId: req.user!._id.toString(),
    action: "category.updated",
    metadata: { categoryId: id },
  });
  res.json(category);
};

export const deleteCategory = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await categoryService.deleteCategory(organizationId, id);
  await appendAuditLogSafe({
    organizationId,
    userId: req.user!._id.toString(),
    action: "category.deleted",
    metadata: { categoryId: id },
  });
  res.json(result);
};
