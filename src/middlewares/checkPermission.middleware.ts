import { Request, Response, NextFunction } from "express";
import Role from "../models/Role.js";
import { ROLES } from "../constants/roles.js";
import { AppError } from "../utils/AppError.js";
import { mergeWithTenantAdminDefaults } from "../constants/tenantAdminPermissions.js";

type LegacyRole = (typeof ROLES)[keyof typeof ROLES];

function legacyRoleToRoleName(role: LegacyRole | undefined | null): string | null {
  if (!role) return null;
  if (role === ROLES.ADMIN) return "Admin";
  if (role === ROLES.DELIVERY) return "Delivery";
  if (role === ROLES.USER) return "User";
  return null;
}

function roleAllowsPermission(rolePermissions: string[], permission: string): boolean {
  if (!Array.isArray(rolePermissions)) return false;
  if (rolePermissions.includes("*")) return true;

  // Exact match
  if (rolePermissions.includes(permission)) return true;

  // Module-based permissions (future-friendly):
  // e.g. role has `product.*` and request asks for `product.create`.
  const module = permission.split(".")[0];
  if (!module) return false;
  if (rolePermissions.includes(`${module}.*`)) return true;

  // Also allow module-only permission (`product`) to cover all actions.
  if (rolePermissions.includes(module)) return true;

  return false;
}

export function checkPermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // `protect` attaches the authenticated Mongoose user document to `req.user`.
    // This file can't rely on Express request augmentation, so we read it safely.
    const actor = (req as any).user as
      | undefined
      | {
          roleId?: any;
          role?: string;
          organizationId?: any;
        };

    if (!actor) {
      next(new AppError("Not authorized", 401, "NO_AUTH_CONTEXT"));
      return;
    }

    // Align with `checkModule`: platform super-admins bypass per-tenant RBAC lookups.
    if ((actor as { isSuperAdmin?: boolean }).isSuperAdmin === true) {
      next();
      return;
    }

    const organizationId = actor.organizationId?.toString?.() ?? actor.organizationId;
    if (!organizationId) {
      next(new AppError("Organization context is required", 403, "ORG_REQUIRED"));
      return;
    }

    // 1) Prefer RBAC roleId (new path).
    let role = null;
    if (actor.roleId) {
      role = await Role.findOne({
        _id: actor.roleId,
        organizationId,
        isActive: true,
      });
    }

    // 2) Backward compatibility (legacy path).
    if (!role) {
      const legacyRole = actor.role as LegacyRole | undefined;
      const roleName = legacyRoleToRoleName(legacyRole);
      if (roleName) {
        role = await Role.findOne({
          organizationId,
          name: roleName,
          isActive: true,
        });
      }
    }

    // Tenant admins without a Role row (legacy / migration gaps) still get default Admin capabilities.
    if (!role) {
      if (actor.role !== ROLES.ADMIN) {
        res.status(403).json({ message: "Access denied" });
        return;
      }
      const effective = mergeWithTenantAdminDefaults(ROLES.ADMIN, []);
      if (!roleAllowsPermission(effective, permission)) {
        res.status(403).json({ message: "Access denied" });
        return;
      }
      next();
      return;
    }

    const effective = mergeWithTenantAdminDefaults(actor.role as LegacyRole | undefined, role.permissions ?? []);
    if (!roleAllowsPermission(effective, permission)) {
      res.status(403).json({ message: "Access denied" });
      return;
    }

    next();
  };
}

