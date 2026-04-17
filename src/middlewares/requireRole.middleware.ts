import { Request, Response, NextFunction } from "express";
import { ROLES } from "../constants/roles.js";

/**
 * Require an authenticated user whose role is one of `allowedRoles`.
 * Must run after `protect`. Extensible for future RBAC (replace with permission checks).
 */
function accessDeniedMessage(allowedRoles: string[]): string {
  if (allowedRoles.length === 1) {
    if (allowedRoles[0] === ROLES.ADMIN) return "Admin access required";
    if (allowedRoles[0] === ROLES.DELIVERY) return "Delivery access required";
  }
  return "Access denied";
}

export function requireRoles(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req as Request & { user?: { role?: string } }).user?.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ message: accessDeniedMessage(allowedRoles) });
      return;
    }
    next();
  };
}

/** Only users with role `admin` (bootstrap / super-admin until multi-tenant RBAC). */
export const adminOnly = requireRoles(ROLES.ADMIN);

/** Only users with role `delivery` (courier app / delivery APIs). */
export const deliveryOnly = requireRoles(ROLES.DELIVERY);
