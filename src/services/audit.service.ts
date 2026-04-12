import mongoose from "mongoose";
import SuperAdminAuditLog from "../models/SuperAdminAuditLog";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface AuditListQuery {
  page: number;
  limit: number;
  tenantId?: string;
  action?: string;
  from?: Date;
  to?: Date;
}

export async function listAuditLogs(params: AuditListQuery) {
  const skip = (params.page - 1) * params.limit;
  const filter: Record<string, unknown> = {};

  if (params.tenantId && mongoose.isValidObjectId(params.tenantId)) {
    filter.organizationId = new mongoose.Types.ObjectId(params.tenantId);
  }

  if (params.action?.trim()) {
    filter.action = new RegExp(escapeRegex(params.action.trim()), "i");
  }

  if (params.from || params.to) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (params.from) range.$gte = params.from;
    if (params.to) range.$lte = params.to;
    filter.createdAt = range;
  }

  const [raw, total] = await Promise.all([
    SuperAdminAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(params.limit)
      .populate("actorUserId", "email name role isSuperAdmin")
      .lean(),
    SuperAdminAuditLog.countDocuments(filter),
  ]);

  const data = raw.map((row) => {
    const actor = row.actorUserId as
      | { _id?: unknown; email?: string; name?: string; role?: string; isSuperAdmin?: boolean }
      | null
      | undefined;
    const role =
      actor && typeof actor === "object" && actor.isSuperAdmin === true
        ? "super_admin"
        : actor && typeof actor === "object" && typeof actor.role === "string"
          ? actor.role
          : "—";

    const actorId =
      actor && typeof actor === "object" && actor._id != null ? String(actor._id) : null;
    const fallbackId = row.actorUserId != null ? String(row.actorUserId) : "";
    const userId = actorId ?? fallbackId;

    let timestamp: string | undefined;
    const ca = row.createdAt;
    if (ca instanceof Date) {
      timestamp = ca.toISOString();
    } else if (typeof ca === "string") {
      timestamp = ca;
    }

    return {
      _id: String(row._id),
      timestamp,
      tenantId: row.organizationId ? String(row.organizationId) : null,
      userId,
      userEmail: actor && typeof actor === "object" && typeof actor.email === "string" ? actor.email : null,
      role,
      action: String(row.action ?? ""),
      metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {},
    };
  });

  const totalPages = params.limit > 0 ? Math.max(1, Math.ceil(total / params.limit)) : 1;

  return {
    data,
    total,
    page: params.page,
    limit: params.limit,
    totalPages,
  };
}
