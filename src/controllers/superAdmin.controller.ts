import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import * as superAdminService from "../services/superAdmin.service";
import type { OrgModuleKey } from "../constants/modules";
import type { ProductFieldKey } from "../constants/productFields";

const paramId = (id: string | string[] | undefined) =>
  (Array.isArray(id) ? id[0] : id) ?? "";

export const listOrganizations = async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const rawLimit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
  const limit = Math.min(100, Math.max(1, rawLimit));
  const result = await superAdminService.listOrganizations({ page, limit });
  res.json(result);
};

export const patchOrganizationModules = async (req: AuthRequest, res: Response) => {
  const id = paramId(req.params.id);
  const { modules } = req.body as { modules: OrgModuleKey[] };
  const actorId = req.user!._id.toString();
  const result = await superAdminService.updateOrganizationModules(id, modules, actorId);
  res.json(result);
};

export const patchOrganizationStatus = async (req: AuthRequest, res: Response) => {
  const id = paramId(req.params.id);
  const { isActive } = req.body as { isActive: boolean };
  const actorId = req.user!._id.toString();
  const result = await superAdminService.updateOrganizationStatus(id, isActive, actorId);
  res.json(result);
};

export const createPlan = async (req: AuthRequest, res: Response) => {
  const body = req.body as {
    name: string;
    price: number;
    modules: OrgModuleKey[];
    isActive?: boolean;
  };
  const actorId = req.user!._id.toString();
  const result = await superAdminService.createPlan(body, actorId);
  res.status(201).json(result);
};

export const listPlans = async (_req: AuthRequest, res: Response) => {
  const result = await superAdminService.listPlans();
  res.json(result);
};

export const patchOrganizationPlan = async (req: AuthRequest, res: Response) => {
  const id = paramId(req.params.id);
  const { planId } = req.body as { planId: string };
  const actorId = req.user!._id.toString();
  const result = await superAdminService.assignOrganizationPlan(id, planId, actorId);
  res.json(result);
};

export const createOrganizationFull = async (req: AuthRequest, res: Response) => {
  const body = req.body as {
    organization: { name: string };
    admin: { name: string; email: string; password: string };
    modules: OrgModuleKey[];
    productFields?: Partial<Record<ProductFieldKey, boolean>>;
  };
  const actorId = req.user!._id.toString();
  const result = await superAdminService.createOrganizationFull(body, actorId);
  res.status(201).json(result);
};
