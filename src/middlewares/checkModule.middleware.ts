import { Request, Response, NextFunction } from "express";

import Organization from "../models/Organization.js";
import { ORG_MODULES, type OrgModuleKey } from "../constants/modules.js";
import { ROLES } from "../constants/roles.js";
import { AppError } from "../utils/AppError.js";
import { SUBSCRIPTION_STATUS } from "../models/Organization.js";

const ORDER_ALIASES = new Set(["order", "orders", "order_management", "order-management"]);
const DELIVERY_ALIASES = new Set([
  "delivery",
  "deliveries",
  "delivery_boy",
  "delivery-boy",
  "deliveryboy",
  "courier",
  "logistics",
]);

function moduleToken(value: unknown): string | null {
  if (typeof value === "string") {
    const token = value.trim().toLowerCase();
    return token.length > 0 ? token : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const candidates = [obj.key, obj.name, obj.module, obj.slug, obj.code];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) {
        return c.trim().toLowerCase();
      }
    }
  }
  return null;
}

/**
 * Tenant feature gate: requires `moduleName` to be listed on the user's organization.
 * Run after `protect` so `req.user.organizationId` is set.
 * Run before `checkPermission` so disabled modules block access regardless of RBAC.
 *
 * Super-admins bypass module checks (`req.user.isSuperAdmin`). Tenant module toggles remain in `organization.modules`.
 */
export function checkModule(moduleName: OrgModuleKey) {
  return async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    const req = _req as Request & {
      user?: { organizationId?: unknown; isSuperAdmin?: boolean; role?: string };
    };
    const user = req.user;

    if (user?.isSuperAdmin === true) {
      next();
      return;
    }

    const normalizedRole = String(user?.role ?? "").toLowerCase();
    const isTenantOperator =
      normalizedRole === ROLES.ADMIN || normalizedRole === ROLES.DELIVERY;

    // End customers (and legacy users without an operator role) should not be
    // blocked by tenant module toggles. Module gating is for tenant operators.
    if (!isTenantOperator) {
      next();
      return;
    }

    const organizationId = user?.organizationId?.toString?.() ?? user?.organizationId;

    if (!organizationId) {
      next(new AppError("Organization context is required", 403, "ORG_REQUIRED"));
      return;
    }

    const org = await Organization.findById(organizationId)
      .select("modules isActive planId subscriptionStatus subscriptionEndDate")
      .lean();
    if (!org) {
      res.status(403).json({
        success: false,
        message: "Module not available",
        errorCode: "MODULE_DISABLED",
      });
      return;
    }

    if (org.isActive === false) {
      res.status(403).json({
        success: false,
        message: "Organization is inactive",
        errorCode: "ORG_INACTIVE",
      });
      return;
    }

    const subStatus = org.subscriptionStatus ?? SUBSCRIPTION_STATUS.TRIAL;
    const end = org.subscriptionEndDate ? new Date(org.subscriptionEndDate) : null;
    const isExpired =
      subStatus === SUBSCRIPTION_STATUS.EXPIRED || (end != null && end.getTime() < Date.now());
    if (isExpired) {
      // Foundation behavior: block all module access if expired.
      // Future: allow limited modules/features for an "expired" grace plan.
      res.status(403).json({
        success: false,
        message: "Subscription expired",
        errorCode: "SUBSCRIPTION_EXPIRED",
      });
      return;
    }

    const enabled = Array.isArray(org.modules) ? org.modules : [];
    const normalizedEnabled = enabled
      .map((m: unknown) => moduleToken(m))
      .filter((m): m is string => Boolean(m));
    const normalizedRequested = String(moduleName).trim().toLowerCase();

    const hasRequestedModule = normalizedEnabled.includes(normalizedRequested);

    // Backward-compat aliases seen in older tenants / admin configs.
    const allowOrderAliasMatch =
      normalizedRequested === ORG_MODULES.ORDER &&
      normalizedEnabled.some((m: string) => ORDER_ALIASES.has(m));
    const allowDeliveryAliasMatch =
      normalizedRequested === ORG_MODULES.DELIVERY &&
      normalizedEnabled.some((m: string) => DELIVERY_ALIASES.has(m));
    const allowDeliverySemanticMatch =
      normalizedRequested === ORG_MODULES.DELIVERY &&
      normalizedEnabled.some((m: string) => m.includes("deliver") || m.includes("courier"));
    const allowLegacyDelivery =
      normalizedRequested === ORG_MODULES.DELIVERY &&
      normalizedEnabled.some((m: string) => ORDER_ALIASES.has(m));

    // Legacy safety: very old tenants may have an empty `modules` array due to migration
    // gaps or plan synchronization issues. Keep core order/delivery flows usable.
    const allowLegacyUnconfiguredModules =
      normalizedEnabled.length === 0 &&
      (normalizedRequested === ORG_MODULES.ORDER || normalizedRequested === ORG_MODULES.DELIVERY);

    if (
      !hasRequestedModule &&
      !allowOrderAliasMatch &&
      !allowDeliveryAliasMatch &&
      !allowDeliverySemanticMatch &&
      !allowLegacyDelivery &&
      !allowLegacyUnconfiguredModules
    ) {
      res.status(403).json({
        success: false,
        message: "Module not available",
        errorCode: "MODULE_DISABLED",
      });
      return;
    }

    next();
  };
}
