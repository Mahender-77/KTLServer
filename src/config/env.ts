import { logger } from '../utils/logger';
/**
 * Central environment configuration. All server settings should be read from here or `process.env` via these helpers.
 * Future: inject organization-specific config or secrets from a vault without scattering `process.env` usage.
 */
import "./loadEnv";

export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const isProduction = NODE_ENV === "production";

export function getPort(): number {
  const raw = process.env.PORT?.trim();
  if (!raw) return 5000;
  const p = parseInt(raw, 10);
  return Number.isNaN(p) || p < 1 || p > 65535 ? 5000 : p;
}

/** Bind address (default all interfaces). Override with HOST=127.0.0.1 for local-only. */
export function getListenHost(): string {
  const h = process.env.HOST?.trim();
  return h && h.length > 0 ? h : "0.0.0.0";
}

/** MongoDB connection string (required). See `.env.example`. */
export function getMongoUri(): string {
  const u = process.env.MONGO_URI?.trim();
  if (u) return u;
  logger.error("FATAL: MONGO_URI is required. Copy server/.env.example to server/.env and set MONGO_URI.");
  process.exit(1);
}

/**
 * Browser CORS allowlist (comma-separated origins). Required for browser clients; mobile apps often send no Origin.
 * Set in `.env` per environment — see `.env.example`.
 */
export function getCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    if (!isProduction) {
      logger.warn(
        "[config] CORS_ORIGINS is empty — browser requests with an Origin header may be blocked. Set CORS_ORIGINS in .env (see .env.example)."
      );
    }
    return [];
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function assertJwtSecrets(): void {
  const a = process.env.JWT_SECRET?.trim();
  const b = process.env.JWT_REFRESH_SECRET?.trim();
  if (!a || a.length < 16 || !b || b.length < 16) {
    logger.error(
      "Fatal: JWT_SECRET and JWT_REFRESH_SECRET must be set and at least 16 characters each."
    );
    process.exit(1);
  }
}

export function getJwtAccessSecret(): string {
  return process.env.JWT_SECRET!.trim();
}

export function getJwtRefreshSecret(): string {
  return process.env.JWT_REFRESH_SECRET!.trim();
}

/** Comma-separated emails that receive `User.isSuperAdmin` on startup (platform operators). */
export function getSuperAdminEmails(): string[] {
  const raw = process.env.SUPER_ADMIN_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export interface CloudinaryConfig {
  cloud_name: string;
  api_key: string;
  api_secret: string;
}

/** Returns null if any Cloudinary variable is missing (upload routes will fail until configured). */
export function getCloudinaryConfig(): CloudinaryConfig | null {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const api_key = process.env.CLOUDINARY_API_KEY?.trim();
  const api_secret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (cloud_name && api_key && api_secret) {
    return { cloud_name, api_key, api_secret };
  }
  return null;
}
