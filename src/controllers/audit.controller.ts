import mongoose from "mongoose";
import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import * as auditService from "../services/audit.service";
import { AppError } from "../utils/AppError";
import { firstQueryString } from "../utils/queryParams";
import { logger } from "../utils/logger";

export const listAuditLogs = async (req: AuthRequest, res: Response) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const rawLimit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));

  const tenantIdRaw = firstQueryString(req, "tenantId");
  const tenantId = tenantIdRaw || undefined;
  if (tenantId && !mongoose.isValidObjectId(tenantId)) {
    throw new AppError("Invalid tenant id — use a valid organization ObjectId.", 400, "INVALID_TENANT_ID");
  }
  const actionRaw = firstQueryString(req, "action");
  const action = actionRaw || undefined;

  let from: Date | undefined;
  let to: Date | undefined;
  const fromStr = firstQueryString(req, "from");
  if (fromStr) {
    const d = new Date(fromStr);
    if (!Number.isNaN(d.getTime())) from = d;
  }
  const toStr = firstQueryString(req, "to");
  if (toStr) {
    const d = new Date(toStr);
    if (!Number.isNaN(d.getTime())) to = d;
  }

  const result = await auditService.listAuditLogs({
    page,
    limit,
    tenantId: tenantId || undefined,
    action: action || undefined,
    from,
    to,
  });

  logger.info("[audit] GET /api/audit ok", {
    userId: req.user?._id?.toString(),
    isSuperAdmin: req.user?.isSuperAdmin === true,
    page,
    limit,
    tenantId: tenantId ?? null,
    total: result.total,
    returned: result.data.length,
  });

  res.json(result);
};
