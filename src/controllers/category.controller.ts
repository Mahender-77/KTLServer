import { Request, Response } from "express";
import * as categoryService from "../services/category.service";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { requestActor } from "../utils/requestActor";
import { resolvePublicOrganizationId } from "../utils/tenantScope";
import { AppError } from "../utils/AppError";

async function resolveCategoryOrganizationId(req: Request): Promise<string | null> {
  const authReq = req as AuthRequest;
  if (authReq.user?._id) {
    return requestActor(authReq).organizationId;
  }
  return resolvePublicOrganizationId(req);
}

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
  res.status(201).json(category);
};

export const getCategories = async (req: Request, res: Response) => {
  const organizationId = await resolveCategoryOrganizationId(req);
  if (!organizationId) {
    return res.json([]);
  }
  const tree = await categoryService.getCategoriesTree(organizationId);
  res.json(tree);
};

export const getSubCategories = async (req: Request, res: Response) => {
  const organizationId = await resolveCategoryOrganizationId(req);
  if (!organizationId) {
    return res.json([]);
  }
  const parentId = (Array.isArray(req.params.parentId) ? req.params.parentId[0] : req.params.parentId) ?? "";
  const subCategories = await categoryService.getSubCategories(organizationId, parentId);
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
  res.json(category);
};

export const deleteCategory = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const id = (Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) ?? "";
  const result = await categoryService.deleteCategory(organizationId, id);
  res.json(result);
};
