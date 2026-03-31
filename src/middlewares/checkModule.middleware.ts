import { Request, Response, NextFunction } from "express";
import Organization from "../models/Organization";
import type { OrgModuleKey } from "../constants/modules";
import { AppError } from "../utils/AppError";
import { SUBSCRIPTION_STATUS } from "../models/Organization";

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
      user?: { organizationId?: unknown; isSuperAdmin?: boolean };
    };
    const user = req.user;

    if (user?.isSuperAdmin === true) {
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
    if (!enabled.includes(moduleName)) {
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
