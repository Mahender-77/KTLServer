import rateLimit from "express-rate-limit";
import {
  RATE_LIMIT_GENERAL_MAX,
  RATE_LIMIT_GENERAL_WINDOW_MS,
  RATE_LIMIT_AUTH_MAX,
  RATE_LIMIT_AUTH_WINDOW_MS,
} from "../config/rateLimit";

/**
 * General rate limiter for all /api routes.
 * Applied first; then route-specific limiters (e.g. auth) apply on top.
 */
export const generalApiLimiter = rateLimit({
  windowMs: RATE_LIMIT_GENERAL_WINDOW_MS,
  limit: RATE_LIMIT_GENERAL_MAX,
  message: { message: "Too many requests, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter rate limiter for auth endpoints (login, register).
 * Protects against brute force and credential stuffing.
 */
export const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_AUTH_WINDOW_MS,
  limit: RATE_LIMIT_AUTH_MAX,
  message: { message: "Too many attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
