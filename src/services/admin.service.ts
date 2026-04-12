import User from "../models/User";
import Role from "../models/Role";
import { AppError } from "../utils/AppError";
import { ROLES } from "../constants/roles";
import { ensureDefaultRolesForOrganization } from "../migrations/organizationBootstrap";

export interface CreateAdminInput {
  name: string;
  email: string;
  password: string;
  organizationId: string;
}

export interface CreateUserInOrgInput {
  name: string;
  email: string;
  password: string;
  role: "admin" | "delivery" | "user";
  organizationId: string;
}

/**
 * Create a new admin user. Only callable from protected admin routes.
 * Password hashing is handled by User schema pre("save") hook.
 */
export async function createAdminUser(data: CreateAdminInput) {
  const email = data.email.toLowerCase().trim();

  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError("Email already registered", 400, "EMAIL_EXISTS");
  }

  await ensureDefaultRolesForOrganization(data.organizationId);

  const adminRole = await Role.findOne({
    organizationId: data.organizationId,
    name: "Admin",
    isActive: true,
  });
  if (!adminRole?._id) {
    throw new AppError("Admin role missing for organization", 500, "RBAC_ROLE_MISSING");
  }

  const user = await User.create({
    name: data.name.trim(),
    email,
    password: data.password,
    role: ROLES.ADMIN,
    organizationId: data.organizationId,
    roleId: adminRole._id,
  });

  return {
    message: "Admin user created",
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.get("createdAt") as Date | undefined,
    },
  };
}

/**
 * Create a user inside the same organization as the creator.
 * organizationId is required and cannot be overridden by request body (enforced in controller/route schema).
 */
export async function createUserInOrganization(data: CreateUserInOrgInput) {
  if (!data.organizationId) {
    throw new AppError("Organization context is required", 403, "ORG_REQUIRED");
  }

  await ensureDefaultRolesForOrganization(data.organizationId);

  const email = data.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) {
    throw new AppError("Email already registered", 400, "EMAIL_EXISTS");
  }

  // Validate and map role to stored user.role values.
  const role = (() => {
    if (data.role === "admin") return ROLES.ADMIN;
    if (data.role === "delivery") return ROLES.DELIVERY;
    return ROLES.USER;
  })();

  const roleName = (() => {
    if (role === ROLES.ADMIN) return "Admin";
    if (role === ROLES.DELIVERY) return "Delivery";
    return "User";
  })();

  const roleDoc = await Role.findOne({
    organizationId: data.organizationId,
    name: roleName,
    isActive: true,
  });
  if (!roleDoc?._id) {
    throw new AppError("Role missing for organization", 500, "RBAC_ROLE_MISSING");
  }

  const user = await User.create({
    name: data.name.trim(),
    email,
    password: data.password,
    role,
    organizationId: data.organizationId,
    roleId: roleDoc._id,
  });

  if (!user.organizationId) {
    throw new AppError("Organization context missing after user creation", 500, "ORG_MISSING");
  }

  return {
    message: "User created",
    user: {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId.toString(),
      createdAt: user.get("createdAt") as Date | undefined,
    },
  };
}
