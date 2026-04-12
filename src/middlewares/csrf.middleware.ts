import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { isProduction } from "../config/env";

/** HttpOnly cookie + matching header (double-submit). */
export const CSRF_COOKIE_NAME = "_csrf";
const CSRF_HEADER = "x-csrf-token";
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function normalizePath(url: string): string {
  const path = url.split("?")[0];
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/**
 * Public auth routes that must stay callable without a prior CSRF handshake
 * (mobile clients, first-party login body, refresh flows).
 */
function isCsrfExcluded(path: string, method: string): boolean {
  if (method === "POST") {
    return (
      path === "/api/auth/login" ||
      path === "/api/auth/register" ||
      path === "/api/auth/refresh" ||
      path === "/api/auth/logout" ||
      path === "/api/auth/forgot-password" ||
      path === "/api/auth/reset-password" ||
      /** Bearer + protect(); CSRF cookie often fails cross-origin (admin Vite → API). */
      path === "/api/auth/change-password"
    );
  }
  return false;
}

/**
 * Browsers send `Origin` on cross-origin XHR/fetch. Native / CLI clients usually omit it.
 * When Origin is absent, skip CSRF so mobile and tooling keep working.
 * When Origin is present, require a valid double-submit pair (defense in depth with SameSite cookies).
 */
function shouldEnforceCsrf(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin || !String(origin).trim()) return false;
  return true;
}

function readHeaderToken(req: Request): string | undefined {
  const raw = req.headers[CSRF_HEADER];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/**
 * Issue CSRF token (GET /api/auth/csrf-token). Sets HttpOnly cookie and returns token in JSON body.
 */
export function issueCsrfToken(req: Request, res: Response): void {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 60 * 60 * 1000,
    path: "/",
  });
  res.status(200).json({ csrfToken: token });
}

/**
 * Validates double-submit cookie + header for mutating /api/** requests when Origin is present.
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  const path = normalizePath(req.originalUrl);
  if (!path.startsWith("/api")) {
    next();
    return;
  }

  const method = req.method.toUpperCase();
  if (!MUTATING.has(method)) {
    next();
    return;
  }

  if (isCsrfExcluded(path, method)) {
    next();
    return;
  }

  if (!shouldEnforceCsrf(req)) {
    next();
    return;
  }

  const cookieTok = req.cookies?.[CSRF_COOKIE_NAME];
  const headerTok = readHeaderToken(req);

  if (
    typeof cookieTok !== "string" ||
    cookieTok.length === 0 ||
    typeof headerTok !== "string" ||
    headerTok.length === 0 ||
    cookieTok !== headerTok
  ) {
    res.status(403).json({ message: "Invalid or missing CSRF token" });
    return;
  }

  next();
}
