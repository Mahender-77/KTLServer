import jwt from "jsonwebtoken";
import { getJwtAccessSecret, getJwtRefreshSecret } from "../config/env.js";

const ACCESS_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

export type TokenOptions = {
  /** Platform super-admin (optional org in token). */
  isSuperAdmin?: boolean;
};

function buildPayload(
  userId: string,
  organizationId?: string | null,
  options?: TokenOptions
): Record<string, unknown> {
  const payload: Record<string, unknown> = { id: userId };
  if (organizationId) payload.organizationId = organizationId;
  if (options?.isSuperAdmin) payload.isSuperAdmin = true;
  return payload;
}

export const generateAccessToken = (
  userId: string,
  organizationId?: string | null,
  options?: TokenOptions
): string => {
  return jwt.sign(buildPayload(userId, organizationId, options), getJwtAccessSecret(), {
    expiresIn: ACCESS_EXPIRY,
  });
};

export const generateRefreshToken = (
  userId: string,
  organizationId?: string | null,
  options?: TokenOptions
): string => {
  return jwt.sign(buildPayload(userId, organizationId, options), getJwtRefreshSecret(), {
    expiresIn: REFRESH_EXPIRY,
  });
};

export const verifyRefreshToken = (token: string): {
  id: string;
  organizationId?: string;
  isSuperAdmin?: boolean;
} => {
  return jwt.verify(token, getJwtRefreshSecret()) as {
    id: string;
    organizationId?: string;
    isSuperAdmin?: boolean;
  };
};
