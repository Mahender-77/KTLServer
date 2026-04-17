import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { getJwtAccessSecret } from "../config/env.js";
import { tryGetDefaultOrganizationId } from "../migrations/organizationBootstrap.js";

export interface AuthRequest extends Request {
  user?: InstanceType<typeof User>;
}

export const protect = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  let token: string | undefined;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return next(new AppError("Not authorized, no token", 401, "NO_TOKEN"));
  }

  try {
    const decoded = jwt.verify(token, getJwtAccessSecret()) as {
      id: string;
      organizationId?: string;
      isSuperAdmin?: boolean;
    };

    const user = await User.findById(decoded.id);
    if (!user) {
      return next(new AppError("User not found", 401, "USER_NOT_FOUND"));
    }

    const isSuperAdmin = user.isSuperAdmin === true;
    const tokenOrgId = decoded.organizationId;

    if (!isSuperAdmin) {
      // Backfill missing user.organizationId from token claim or default org (legacy safety).
      if (user.organizationId == null) {
        const sourceOrgId = tokenOrgId ?? tryGetDefaultOrganizationId();
        if (sourceOrgId) {
          user.set("organizationId", new mongoose.Types.ObjectId(sourceOrgId));
          await User.updateOne(
            { _id: user._id },
            { $set: { organizationId: sourceOrgId } }
          );
        }
      }

      // If token has orgId, it must match the user’s org to prevent token/org tampering.
      if (
        tokenOrgId &&
        user.organizationId &&
        user.organizationId.toString() !== tokenOrgId
      ) {
        return next(new AppError("Organization mismatch", 403, "ORG_MISMATCH"));
      }

      if (!user.organizationId && !user.isSuperAdmin) {
        return next(new AppError("Organization context missing", 403, "ORG_REQUIRED"));
      }
    }

    req.user = user;
    next();
  } catch (err) {
    if (err && typeof err === "object" && "name" in err && err.name === "TokenExpiredError") {
      return next(new AppError("Access token expired", 401, "TOKEN_EXPIRED"));
    }
    return next(new AppError("Not authorized, token failed", 401, "TOKEN_INVALID"));
  }
};

export { adminOnly } from "./requireRole.middleware.js";
