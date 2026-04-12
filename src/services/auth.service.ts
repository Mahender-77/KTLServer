import { logger } from "../utils/logger";
import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/User";
import Organization from "../models/Organization";
import RefreshToken from "../models/RefreshToken";
import { ROLES } from "../constants/roles";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../utils/generateToken";
import { hashRefreshToken } from "../utils/tokenHash";
import { AppError } from "../utils/AppError";
import {
  DEFAULT_ORG_NAME,
  refreshDefaultOrgCache,
  setDefaultOrganizationCache,
  ensureDefaultRolesForOrganization,
} from "../migrations/organizationBootstrap";
import Role from "../models/Role";
import { DEFAULT_ORG_MODULES, ORG_MODULE_KEYS } from "../constants/modules";
import { DEFAULT_PRODUCT_FIELD_CONFIG } from "../constants/productFields";
import { mergeWithTenantAdminDefaults } from "../constants/tenantAdminPermissions";
import { appendAuditLogSafe } from "./auditLog.service";

const REFRESH_TOKEN_DAYS = 7;

function refreshExpiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + REFRESH_TOKEN_DAYS);
  return d;
}

async function saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
  await RefreshToken.create({
    user: userId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshExpiresAt(),
    revoked: false,
  });
}

export async function register(data: { name: string; email: string; password: string }) {
  const email = data.email.toLowerCase().trim();
  const userExists = await User.findOne({ email });
  if (userExists) throw new AppError("User already exists", 400, "USER_EXISTS");

  const name = data.name.trim();

  // Transaction ensures we never commit a user without organizationId.
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Create inside transaction so no committed user exists without organizationId.
    const user = new User({
      name,
      email,
      password: data.password,
      // Owner gets full access for now.
      role: ROLES.ADMIN,
    });
    await user.save({ session });

    const orgName = `${name}'s Organization`;

    const org = new Organization({
      name: orgName,
      owner: user._id,
      isActive: true,
      modules: [...DEFAULT_ORG_MODULES],
      productFieldConfig: { ...DEFAULT_PRODUCT_FIELD_CONFIG },
    });
    await org.save({ session });

    user.organizationId = org._id;
    await user.save({ session });

    await session.commitTransaction();

    const userId = user._id.toString();
    const organizationId = user.organizationId.toString();

    // RBAC: ensure Admin role exists for the new org and backfill roleId.
    await ensureDefaultRolesForOrganization(organizationId);
    const adminRole = await Role.findOne({
      organizationId,
      name: "Admin",
      isActive: true,
    }).lean();
    if (adminRole?._id) {
      await User.updateOne({ _id: userId }, { $set: { roleId: adminRole._id } });
    }
    const accessToken = generateAccessToken(userId, organizationId);
    const refreshToken = generateRefreshToken(userId, organizationId);
    await saveRefreshToken(userId, refreshToken);

    return { message: "User registered successfully", accessToken, refreshToken };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function login(data: { email: string; password: string }) {
  logger.log("login data", data);
  const user = await User.findOne({ email: data.email }).select("+password +failedLoginAttempts +lockOutUntil");
  if (!user) throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");

  if (user.isSuspended) {
    throw new AppError("Account suspended", 403, "ACCOUNT_SUSPENDED");
  }

  if (user.lockOutUntil && user.lockOutUntil > new Date()) {
    throw new AppError("Account locked out. Try again later", 403, "ACCOUNT_LOCKED");
  }

  const isMatch = await user.comparePassword(data.password);
  
  if (!isMatch) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockOutUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    }
    await user.save();
    throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
  }

  if ((user.failedLoginAttempts && user.failedLoginAttempts > 0) || user.lockOutUntil) {
    user.failedLoginAttempts = 0;
    user.lockOutUntil = null;
    await user.save();
  }

  if (user.organizationId == null && !user.isSuperAdmin) {
    // Legacy safety: attach the user to the default organization.
    const org = await Organization.findOneAndUpdate(
      { name: DEFAULT_ORG_NAME },
      {
        $setOnInsert: {
          name: DEFAULT_ORG_NAME,
          owner: user._id,
          isActive: true,
          modules: [...DEFAULT_ORG_MODULES],
          productFieldConfig: { ...DEFAULT_PRODUCT_FIELD_CONFIG },
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (!org?._id) {
      throw new AppError("Could not resolve organization", 500, "ORG_CREATE_FAILED");
    }

    user.organizationId = org._id;
    await user.save();
    setDefaultOrganizationCache(org._id.toString());
  }

  const userId = user._id.toString();
  const organizationId = user.organizationId?.toString();
  const tokenOpts = user.isSuperAdmin ? { isSuperAdmin: true } : undefined;
  const accessToken = generateAccessToken(userId, organizationId, tokenOpts);
  const refreshToken = generateRefreshToken(userId, organizationId, tokenOpts);
  await saveRefreshToken(userId, refreshToken);
  await refreshDefaultOrgCache();

  if (!user.isSuperAdmin && organizationId && user.role === ROLES.ADMIN) {
    void appendAuditLogSafe({
      organizationId,
      userId,
      action: "admin.login",
      metadata: { channel: "web_admin" },
    });
  }

  return { message: "Login successful", accessToken, refreshToken };
}

export async function refresh(refreshToken: string) {
  let decoded: { id: string; organizationId?: string };
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401, "REFRESH_TOKEN_INVALID");
  }
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await RefreshToken.findOne({
    tokenHash,
    user: decoded.id,
    revoked: false,
  });
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError("Invalid or expired refresh token", 401, "REFRESH_TOKEN_INVALID");
  }
  await RefreshToken.updateOne({ _id: stored._id }, { revoked: true });

  const user = await User.findById(decoded.id).select("organizationId isSuperAdmin isSuspended");
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");

  if (user.isSuspended) {
    throw new AppError("Account suspended", 403, "ACCOUNT_SUSPENDED");
  }

  if (user.isSuperAdmin) {
    const orgStr = user.organizationId?.toString();
    const tokenOpts = { isSuperAdmin: true as const };
    const newAccessToken = generateAccessToken(user._id.toString(), orgStr, tokenOpts);
    const newRefreshToken = generateRefreshToken(user._id.toString(), orgStr, tokenOpts);
    await saveRefreshToken(user._id.toString(), newRefreshToken);
    return { message: "Tokens refreshed", accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  // Backfill from token claim if needed (legacy safety).
  if (user.organizationId == null && decoded.organizationId) {
    user.organizationId = decoded.organizationId as any;
    await user.save();
  }
  if (user.organizationId == null) {
    throw new AppError("Organization context missing", 403, "ORG_REQUIRED");
  }

  const newAccessToken = generateAccessToken(user._id.toString(), user.organizationId.toString());
  const newRefreshToken = generateRefreshToken(user._id.toString(), user.organizationId.toString());
  await saveRefreshToken(user._id.toString(), newRefreshToken);
  return { message: "Tokens refreshed", accessToken: newAccessToken, refreshToken: newRefreshToken };
}

export async function logout(refreshToken: string | undefined) {
  if (refreshToken) {
    await RefreshToken.updateOne({ tokenHash: hashRefreshToken(refreshToken) }, { revoked: true });
  }
  return { message: "Logged out" };
}

function hashPasswordResetToken(plain: string): string {
  return crypto.createHash("sha256").update(plain, "utf8").digest("hex");
}

function isAdminPanelUser(user: { role?: string; isSuperAdmin?: boolean }): boolean {
  return user.isSuperAdmin === true || user.role === ROLES.ADMIN;
}

export async function changePassword(
  userId: string,
  data: { currentPassword: string; newPassword: string; confirmPassword: string }
): Promise<{ message: string }> {
  if (data.newPassword !== data.confirmPassword) {
    throw new AppError("New password and confirmation do not match", 400, "PASSWORD_MISMATCH");
  }
  const user = await User.findById(userId).select("+password");
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  const ok = await user.comparePassword(data.currentPassword);
  if (!ok) {
    throw new AppError("Current password is incorrect", 401, "INVALID_CURRENT_PASSWORD");
  }
  user.password = data.newPassword;
  await user.save();
  return { message: "Password updated successfully" };
}

export async function requestPasswordReset(email: string): Promise<{
  message: string;
  resetToken?: string;
  expiresInMinutes?: number;
}> {
  const normalized = email.toLowerCase().trim();
  const genericMessage = "If your email is registered for an admin account, you can reset your password.";

  const user = await User.findOne({ email: normalized }).select(
    "+passwordResetTokenHash +passwordResetExpires"
  );
  if (!user || !isAdminPanelUser(user)) {
    return { message: genericMessage };
  }

  const plain = crypto.randomBytes(32).toString("hex");
  const hash = hashPasswordResetToken(plain);
  user.passwordResetTokenHash = hash;
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();

  const expose = process.env.PASSWORD_RESET_RETURN_TOKEN === "true";
  if (expose) {
    return {
      message:
        "Reset token generated. Use it on the reset page within 1 hour. Do not share this token.",
      resetToken: plain,
      expiresInMinutes: 60,
    };
  }
  return { message: genericMessage };
}

export async function resetPasswordWithToken(data: {
  email: string;
  token: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ message: string }> {
  if (data.newPassword !== data.confirmPassword) {
    throw new AppError("New password and confirmation do not match", 400, "PASSWORD_MISMATCH");
  }
  const normalized = data.email.toLowerCase().trim();
  const user = await User.findOne({ email: normalized }).select(
    "+password +passwordResetTokenHash +passwordResetExpires"
  );
  if (!user || !user.passwordResetTokenHash || !user.passwordResetExpires) {
    throw new AppError("Invalid or expired reset token", 400, "RESET_INVALID");
  }
  if (user.passwordResetExpires < new Date()) {
    throw new AppError("Reset token has expired. Request a new one.", 400, "RESET_EXPIRED");
  }
  if (!isAdminPanelUser(user)) {
    throw new AppError("Invalid or expired reset token", 400, "RESET_INVALID");
  }
  const submittedHash = hashPasswordResetToken(data.token.trim());
  if (submittedHash !== user.passwordResetTokenHash) {
    throw new AppError("Invalid or expired reset token", 400, "RESET_INVALID");
  }
  user.password = data.newPassword;
  user.passwordResetTokenHash = null;
  user.passwordResetExpires = null;
  await user.save();
  return { message: "Password reset successfully. You can sign in now." };
}

export async function getCurrentUser(userId: string) {
  const user = await User.findById(userId).select("-password");
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");

  if (user.isSuperAdmin === true) {
    return {
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId?.toString?.() ?? null,
        isSuperAdmin: true,
      },
      organization: { name: "", modules: [...ORG_MODULE_KEYS] },
      permissions: ["*"],
      productFields: { ...DEFAULT_PRODUCT_FIELD_CONFIG },
    };
  }

  const organizationId = user.organizationId?.toString?.() ?? null;
  const org = organizationId
    ? await Organization.findById(organizationId).select("name modules productFieldConfig").lean()
    : null;

  let roleDoc = null as null | { permissions?: string[] };
  if (user.roleId && organizationId) {
    roleDoc = (await Role.findOne({
      _id: user.roleId,
      organizationId,
      isActive: true,
    })
      .select("permissions")
      .lean()) as { permissions?: string[] } | null;
  }
  if (!roleDoc && organizationId) {
    const roleName =
      user.role === ROLES.ADMIN
        ? "Admin"
        : user.role === ROLES.DELIVERY
          ? "Delivery"
          : "User";
    roleDoc = (await Role.findOne({
      organizationId,
      name: roleName,
      isActive: true,
    })
      .select("permissions")
      .lean()) as { permissions?: string[] } | null;
  }

  const permissionsOut = mergeWithTenantAdminDefaults(user.role as string | undefined, roleDoc?.permissions ?? []);

  return {
    user: {
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId,
      isSuperAdmin: false,
    },
    organization: {
      name: org?.name ?? "",
      modules: org?.modules ?? [],
    },
    permissions: permissionsOut,
    productFields: org?.productFieldConfig ?? { ...DEFAULT_PRODUCT_FIELD_CONFIG },
  };
}
