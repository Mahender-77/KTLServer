import mongoose from "mongoose";
import { logger } from "../utils/logger.js";
import SuperAdminAuditLog from "../models/SuperAdminAuditLog.js";

async function persistSuperAdminAudit(
  action: string,
  actorUserId: string,
  details: Record<string, unknown>
): Promise<void> {
  let organizationId: mongoose.Types.ObjectId | null = null;
  const rawOrg = details.organizationId;
  if (typeof rawOrg === "string" && mongoose.isValidObjectId(rawOrg)) {
    organizationId = new mongoose.Types.ObjectId(rawOrg);
  }

  await SuperAdminAuditLog.create({
    action,
    actorUserId: new mongoose.Types.ObjectId(actorUserId),
    organizationId,
    metadata: details,
  });
}

/**
 * Structured audit log for platform (super-admin) actions.
 * Persists to MongoDB (read via GET /api/audit) and mirrors to logger.
 */
export function logSuperAdminAction(
  action: string,
  actorUserId: string,
  details: Record<string, unknown>
): void {
  logger.log(
    JSON.stringify({
      type: "SUPER_ADMIN_AUDIT",
      ts: new Date().toISOString(),
      action,
      actorUserId,
      ...details,
    })
  );
  void persistSuperAdminAudit(action, actorUserId, details).catch((err) => {
    logger.error("Failed to persist SuperAdmin audit log", err);
  });
}
