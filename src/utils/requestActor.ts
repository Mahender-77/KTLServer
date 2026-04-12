import type { Request } from "express";
import type { RequestActor } from "../types/access";
import { AppError } from "./AppError";
import { normalizeOrganizationId } from "./tenantScope";

/** Use only after `protect` (or equivalent) so `req.user` is set. */
export function requestActor(
  req: Request & {
    user?: {
      _id: { toString(): string };
      role: string;
      organizationId?: unknown;
      isSuperAdmin?: boolean;
    };
  }
): RequestActor {
  const u = req.user;
  if (!u) {
    throw new Error("requestActor: missing req.user — add protect middleware");
  }
  const organizationId = normalizeOrganizationId(u.organizationId);
  if (!organizationId) {
    throw new AppError("Organization context is required", 403, "ORG_REQUIRED");
  }
  return {
    userId: u._id.toString(),
    role: u.role,
    organizationId,
    isSuperAdmin: u.isSuperAdmin === true,
  };
}
