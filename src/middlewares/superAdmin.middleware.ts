import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";
import { AppError } from "../utils/AppError";

/**
 * Requires an authenticated user with `isSuperAdmin: true` (see `protect`).
 * Use only on `/api/super-admin/*` routes.
 */
export function checkSuperAdmin(req: AuthRequest, _res: Response, next: NextFunction): void {
  if (!req.user?.isSuperAdmin) {
    next(new AppError("Super admin access required", 403, "SUPER_ADMIN_REQUIRED"));
    return;
  }
  next();
}
