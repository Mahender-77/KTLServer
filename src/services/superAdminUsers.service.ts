import mongoose from "mongoose";
import User from "../models/User.js";
import Role from "../models/Role.js";
import { AppError } from "../utils/AppError.js";
import { logSuperAdminAction } from "../utils/superAdminAudit.js";

const LEGACY_ROLES = ["user", "admin", "delivery"] as const;
type LegacyRole = (typeof LEGACY_ROLES)[number];

export interface ListUsersQuery {
  page: number;
  limit: number;
  tenantId?: string;
  /** Legacy enum: user | admin | delivery */
  role?: LegacyRole;
}

function assertNotSuperAdminTarget(user: { isSuperAdmin?: boolean }) {
  if (user.isSuperAdmin) {
    throw new AppError("Cannot modify platform super-admin users via this API", 400, "USER_IS_SUPER_ADMIN");
  }
}

export async function listUsersForSuperAdmin(params: ListUsersQuery) {
  const skip = (params.page - 1) * params.limit;
  const filter: Record<string, unknown> = {
    isSuperAdmin: { $ne: true },
  };

  if (params.tenantId && mongoose.isValidObjectId(params.tenantId)) {
    filter.organizationId = new mongoose.Types.ObjectId(params.tenantId);
  }

  if (params.role && LEGACY_ROLES.includes(params.role)) {
    filter.role = params.role;
  }

  const [raw, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(params.limit)
      .populate("roleId", "name permissions")
      .populate("organizationId", "name")
      .select("name email role roleId organizationId isSuspended createdAt")
      .lean(),
    User.countDocuments(filter),
  ]);

  const data = raw.map((u) => {
    const org = u.organizationId as { _id?: unknown; name?: string } | null | undefined;
    const r = u.roleId as { _id?: unknown; name?: string } | null | undefined;
    return {
      _id: String(u._id),
      name: u.name,
      email: u.email,
      legacyRole: u.role,
      roleName: r?.name ?? null,
      roleId: r?._id ? String(r._id) : u.roleId ? String(u.roleId) : null,
      tenantId: org?._id ? String(org._id) : u.organizationId ? String(u.organizationId) : null,
      tenantName: org?.name ?? null,
      isSuspended: Boolean(u.isSuspended),
      createdAt: u.createdAt,
    };
  });

  const totalPages = params.limit > 0 ? Math.ceil(total / params.limit) : 0;

  return {
    data,
    total,
    page: params.page,
    limit: params.limit,
    totalPages,
  };
}

export async function getUserForSuperAdmin(userId: string) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError("Invalid user id", 400, "INVALID_ID");
  }
  const u = await User.findById(userId)
    .populate("roleId", "name permissions")
    .populate("organizationId", "name")
    .select("name email role roleId organizationId isSuspended isSuperAdmin createdAt")
    .lean();

  if (!u) throw new AppError("User not found", 404, "USER_NOT_FOUND");

  const org = u.organizationId as { _id?: unknown; name?: string } | null | undefined;
  const r = u.roleId as { _id?: unknown; name?: string } | null | undefined;

  return {
    _id: String(u._id),
    name: u.name,
    email: u.email,
    legacyRole: u.role,
    roleName: r?.name ?? null,
    roleId: r?._id ? String(r._id) : u.roleId ? String(u.roleId) : null,
    tenantId: org?._id ? String(org._id) : u.organizationId ? String(u.organizationId) : null,
    tenantName: org?.name ?? null,
    isSuspended: Boolean(u.isSuspended),
    isSuperAdmin: Boolean(u.isSuperAdmin),
    createdAt: u.createdAt,
  };
}

export async function listRolesForOrganization(organizationId: string) {
  if (!mongoose.isValidObjectId(organizationId)) {
    throw new AppError("Invalid organization id", 400, "INVALID_ID");
  }
  const roles = await Role.find({ organizationId, isActive: true })
    .select("_id name")
    .sort({ name: 1 })
    .lean();
  return roles.map((r) => ({ _id: String(r._id), name: r.name }));
}

export async function patchUserForSuperAdmin(
  userId: string,
  body: { roleId?: string; isSuspended?: boolean },
  actorUserId: string
) {
  if (!mongoose.isValidObjectId(userId)) {
    throw new AppError("Invalid user id", 400, "INVALID_ID");
  }

  const user = await User.findById(userId).select("organizationId isSuperAdmin roleId isSuspended");
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  assertNotSuperAdminTarget(user);

  if (body.isSuspended !== undefined) {
    user.isSuspended = body.isSuspended;
  }

  if (body.roleId !== undefined) {
    if (!mongoose.isValidObjectId(body.roleId)) {
      throw new AppError("Invalid role id", 400, "INVALID_ID");
    }
    const orgId = user.organizationId?.toString();
    if (!orgId) {
      throw new AppError("User has no organization; assign role after organization is set", 400, "NO_ORG");
    }
    const role = await Role.findOne({
      _id: body.roleId,
      organizationId: orgId,
      isActive: true,
    })
      .select("_id name")
      .lean();
    if (!role) throw new AppError("Role not found for this tenant", 404, "ROLE_NOT_FOUND");
    user.roleId = role._id as mongoose.Types.ObjectId;
  }

  await user.save();

  logSuperAdminAction("user.patch", actorUserId, {
    targetUserId: userId,
    organizationId: user.organizationId?.toString(),
    updates: {
      ...(body.roleId !== undefined && { roleId: body.roleId }),
      ...(body.isSuspended !== undefined && { isSuspended: body.isSuspended }),
    },
  });

  return getUserForSuperAdmin(userId);
}
