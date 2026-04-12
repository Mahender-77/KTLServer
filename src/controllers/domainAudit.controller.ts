import mongoose from "mongoose";
import { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { getPaginationParams } from "../utils/pagination";
import * as auditLogService from "../services/auditLog.service";
import Organization from "../models/Organization";
import { AppError } from "../utils/AppError";
import { firstQueryString } from "../utils/queryParams";
import { logger } from "../utils/logger";

export const listDomainAuditLogs = async (req: AuthRequest, res: Response) => {
  const u = req.user!;
  let orgId: string;

  if (u.isSuperAdmin === true) {
    const headerOrg =
      typeof req.headers["x-organization-id"] === "string" ? req.headers["x-organization-id"].trim() : "";
    const qOrg = firstQueryString(req, "organizationId");
    const raw = headerOrg || qOrg;
    if (!raw || !mongoose.isValidObjectId(raw)) {
      throw new AppError(
        "Pass organization id: query ?organizationId=... or header x-organization-id",
        400,
        "ORG_REQUIRED"
      );
    }
    orgId = raw;
  } else {
    const oid = u.organizationId?.toString();
    if (!oid) {
      throw new AppError("Organization context is required", 403, "ORG_REQUIRED");
    }
    orgId = oid;
  }

  const { page, limit, skip } = getPaginationParams(req, { maxLimit: 100 });
  const actionRaw = firstQueryString(req, "action");
  const action = actionRaw || undefined;
  const result = await auditLogService.listAuditLogsForOrganization({
    organizationId: orgId,
    page,
    limit,
    skip,
    action: action || undefined,
  });

  const org = await Organization.findById(orgId).select("name").lean();

  logger.info("[audit-entries] GET /api/audit-entries ok", {
    userId: u._id?.toString(),
    isSuperAdmin: u.isSuperAdmin === true,
    organizationId: orgId,
    organizationName: org?.name ?? null,
    page: result.page,
    limit,
    total: result.total,
    returned: result.data.length,
  });

  res.json({
    ...result,
    organizationId: orgId,
    organizationName: org?.name ?? null,
  });
};
