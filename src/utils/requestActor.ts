import type { Request } from "express";
import type { RequestActor } from "../types/access.js";
import { AppError } from "./AppError.js";
import { normalizeOrganizationId } from "./tenantScope.js";

const OBJECT_ID_HEX = /^[a-fA-F0-9]{24}$/;

/**
 * Tenant scope for APIs: JWT user org, optionally aligned with `X-Organization-Id`
 * (admin web sends this). Super-admins may scope to a tenant via header.
 */
export function resolveScopedOrganizationId(
  req: Request,
  u: { organizationId?: unknown; isSuperAdmin?: boolean }
): string {
  const fromUser = normalizeOrganizationId(u.organizationId);
  const raw = req.headers["x-organization-id"];
  const fromHeader = normalizeOrganizationId(
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined
  );

  if (u.isSuperAdmin === true) {
    if (fromHeader && OBJECT_ID_HEX.test(fromHeader)) return fromHeader;
    if (fromUser) return fromUser;
    throw new AppError("Organization context is required", 403, "ORG_REQUIRED");
  }

  if (!fromUser) {
    throw new AppError("Organization context is required", 403, "ORG_REQUIRED");
  }
  if (fromHeader && fromHeader !== fromUser) {
    throw new AppError("Organization mismatch", 403, "ORG_MISMATCH");
  }
  return fromUser;
}

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
  const organizationId = resolveScopedOrganizationId(req, u);
  return {
    userId: u._id.toString(),
    role: u.role,
    organizationId,
    isSuperAdmin: u.isSuperAdmin === true,
  };
}
