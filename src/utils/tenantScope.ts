import mongoose from "mongoose";
import type { Request } from "express";
import Organization from "../models/Organization.js";
import { AppError } from "./AppError.js";
import { tryGetDefaultOrganizationId } from "../migrations/organizationBootstrap.js";

/** Public catalog: single org (header/query) or all active organizations (marketplace). */
export type PublicCatalogScope =
  | { mode: "single"; organizationId: string }
  | { mode: "marketplace"; organizationIds: string[] };

export async function getActiveOrganizationIds(): Promise<string[]> {
  const rows = await Organization.find({ isActive: { $ne: false } })
    .select("_id")
    .lean();
  return rows.map((r) => r._id.toString());
}

/**
 * Resolves public API scope for consumer apps.
 * If `X-Organization-Id` or `?organizationId=` is set to an active org → single-tenant.
 * Otherwise → marketplace (all active organizations).
 */
export async function resolvePublicCatalogScope(req: Request): Promise<PublicCatalogScope> {
  const explicit = await resolvePublicOrganizationId(req);
  if (explicit) {
    return { mode: "single", organizationId: explicit };
  }
  const ids = await getActiveOrganizationIds();
  return { mode: "marketplace", organizationIds: ids };
}

export function normalizeOrganizationId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof (value as { toString?: () => string }).toString === "function") {
    return (value as { toString: () => string }).toString();
  }
  return String(value);
}

/**
 * Mongo filter fragment for listing/querying rows in the actor's tenant.
 * Includes legacy documents without organizationId only when they belong to the default org
 * (migration backfill removes the need over time).
 */
export function tenantWhereClause(organizationId: string): Record<string, unknown> {
  const oid = new mongoose.Types.ObjectId(organizationId);
  const def = tryGetDefaultOrganizationId();
  if (def && organizationId === def) {
    return {
      $or: [
        { organizationId: oid },
        { organizationId: { $exists: false } },
        { organizationId: null },
      ],
    };
  }
  return { organizationId: oid };
}

/**
 * Tenant-scoped lookup filter for `_id` reads.
 * Ensures the DB query itself cannot match a document from another organization.
 */
export function tenantScopedIdFilter(
  organizationId: string,
  id: string
): Record<string, unknown> {
  return andWithTenant(organizationId, { _id: id });
}

/** Combine tenant scope with additional constraints (uses `$and` so `$or` in tenant clause is safe). */
export function andWithTenant(
  organizationId: string,
  other: Record<string, unknown>
): Record<string, unknown> {
  return { $and: [tenantWhereClause(organizationId), other] };
}

export function assertSameOrganization(
  resourceOrganizationId: unknown,
  actorOrganizationId: string | undefined
): void {
  const res = normalizeOrganizationId(resourceOrganizationId);
  const actor = actorOrganizationId?.trim();
  if (!actor) {
    throw new AppError("Organization context is required", 403, "ORG_REQUIRED");
  }
  if (res === null || res === "") {
    const def = tryGetDefaultOrganizationId();
    if (def === actor) return;
    throw new AppError("You do not have access to this resource", 403, "ORG_MISMATCH");
  }
  if (res !== actor) {
    throw new AppError("You do not have access to this resource", 403, "ORG_MISMATCH");
  }
}

/**
 * Public routes: optional `X-Organization-Id` header or `organizationId` query.
 * Falls back to the default organization when present; otherwise null (empty catalog).
 */
export async function resolvePublicOrganizationId(req: Request): Promise<string | null> {
  const header = typeof req.headers["x-organization-id"] === "string" ? req.headers["x-organization-id"].trim() : "";
  const q = req.query.organizationId;
  const queryStr = typeof q === "string" ? q.trim() : Array.isArray(q) ? String(q[0] ?? "").trim() : "";
  const candidate = header || queryStr;
  if (!candidate) return null;
  if (candidate && mongoose.Types.ObjectId.isValid(candidate)) {
    const org = await Organization.findById(candidate).select("isActive").lean();
    if (org && org.isActive !== false) {
      return candidate;
    }
  }
  return null;
}
