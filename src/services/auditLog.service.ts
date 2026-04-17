import mongoose, { ClientSession } from "mongoose";
import { logger } from "../utils/logger.js";
import AuditLog from "../models/AuditLog.js";
import { paginated, PaginatedResponse } from "../utils/pagination.js";

export async function appendAuditLog(
  input: {
    organizationId: string;
    userId?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  },
  session?: ClientSession
): Promise<void> {
  const oid = new mongoose.Types.ObjectId(input.organizationId);
  const doc: Record<string, unknown> = {
    organizationId: oid,
    action: input.action,
    metadata: input.metadata ?? {},
  };
  if (input.userId && mongoose.isValidObjectId(input.userId)) {
    doc.userId = new mongoose.Types.ObjectId(input.userId);
  }
  await AuditLog.create([doc], { session });
}

/** Same as `appendAuditLog`, but failures never break the primary request (e.g. product save). */
export async function appendAuditLogSafe(
  input: {
    organizationId: string;
    userId?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  },
  session?: ClientSession
): Promise<void> {
  try {
    await appendAuditLog(input, session);
  } catch (err) {
    logger.warn("[auditLog] appendAuditLogSafe failed", { action: input.action, err });
  }
}

export async function listAuditLogsForOrganization(params: {
  organizationId: string;
  page: number;
  limit: number;
  skip: number;
  action?: string;
}): Promise<PaginatedResponse<Record<string, unknown>>> {
  const { organizationId, page, limit, skip, action } = params;
  const oid = new mongoose.Types.ObjectId(organizationId);
  const filter: Record<string, unknown> = { organizationId: oid };
  if (action?.trim()) {
    filter.action = action.trim();
  }
  const [rows, total] = await Promise.all([
    AuditLog.find(filter)
      .populate({ path: "userId", select: "name email" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  const data = rows.map((r) => {
    const uid = r.userId as
      | { _id?: unknown; name?: string; email?: string }
      | string
      | null
      | undefined;
    let userIdStr: string | null = null;
    let userName: string | null = null;
    let userEmail: string | null = null;
    if (uid != null && typeof uid === "object" && "_id" in uid) {
      userIdStr = String((uid as { _id: unknown })._id);
      userName = typeof uid.name === "string" ? uid.name : null;
      userEmail = typeof uid.email === "string" ? uid.email : null;
    } else if (typeof uid === "string") {
      userIdStr = uid;
    } else if (uid != null) {
      userIdStr = String(uid);
    }
    return {
      _id: String(r._id),
      organizationId: String(r.organizationId),
      userId: userIdStr,
      userName,
      userEmail,
      action: r.action,
      metadata: r.metadata ?? {},
      createdAt: r.createdAt,
    };
  });
  return paginated(data, total, page, limit);
}
