import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../utils/AppError";
import * as superAdminUsersService from "../services/superAdminUsers.service";

const paramId = (id: string | string[] | undefined) =>
  (Array.isArray(id) ? id[0] : id) ?? "";

export const listSuperAdminUsers = async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const rawLimit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  const tenantId = typeof req.query.tenantId === "string" ? req.query.tenantId.trim() : undefined;
  const roleRaw = typeof req.query.role === "string" ? req.query.role.trim() : undefined;
  let role: "user" | "admin" | "delivery" | undefined;
  if (roleRaw === "user" || roleRaw === "admin" || roleRaw === "delivery") {
    role = roleRaw;
  } else if (roleRaw) {
    throw new AppError("Invalid role filter (use user, admin, or delivery)", 400, "INVALID_QUERY");
  }

  const result = await superAdminUsersService.listUsersForSuperAdmin({
    page,
    limit,
    tenantId: tenantId || undefined,
    role,
  });
  res.json(result);
};

export const getSuperAdminUser = async (req: AuthRequest, res: Response) => {
  const id = paramId(req.params.id);
  const result = await superAdminUsersService.getUserForSuperAdmin(id);
  res.json({ user: result });
};

export const patchSuperAdminUser = async (req: AuthRequest, res: Response) => {
  const id = paramId(req.params.id);
  const actorId = req.user!._id.toString();
  const body = req.body as { roleId?: string; isSuspended?: boolean };
  const result = await superAdminUsersService.patchUserForSuperAdmin(id, body, actorId);
  res.json({ user: result });
};

export const listOrganizationRoles = async (req: AuthRequest, res: Response) => {
  const id = paramId(req.params.id);
  const roles = await superAdminUsersService.listRolesForOrganization(id);
  res.json({ data: roles });
};
