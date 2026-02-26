/**
 * Rate limit configuration from environment variables.
 * All values have safe defaults for production.
 *
 * Env vars (all optional):
 *   RATE_LIMIT_GENERAL_MAX     - max requests per window for all /api (default: 100)
 *   RATE_LIMIT_GENERAL_WINDOW_MS - window in ms for general limit (default: 900000 = 15 min)
 *   RATE_LIMIT_AUTH_MAX        - max requests per window for login/register (default: 5)
 *   RATE_LIMIT_AUTH_WINDOW_MS  - window in ms for auth limit (default: 900000 = 15 min)
 */

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === "") return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n < 0 ? fallback : n;
};

const parseWindowMs = (value: string | undefined, fallbackMs: number): number => {
  if (value === undefined || value === "") return fallbackMs;
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n < 1000 ? fallbackMs : n;
};

/** General API: max requests per window (all /api/* routes) */
export const RATE_LIMIT_GENERAL_MAX = parsePositiveInt(
  process.env.RATE_LIMIT_GENERAL_MAX,
  100
);

/** General API: time window in milliseconds (default 15 minutes) */
export const RATE_LIMIT_GENERAL_WINDOW_MS = parseWindowMs(
  process.env.RATE_LIMIT_GENERAL_WINDOW_MS,
  15 * 60 * 1000
);

/** Auth (login/register): max requests per window per IP */
export const RATE_LIMIT_AUTH_MAX = parsePositiveInt(
  process.env.RATE_LIMIT_AUTH_MAX,
  5
);

/** Auth: time window in milliseconds (default 15 minutes) */
export const RATE_LIMIT_AUTH_WINDOW_MS = parseWindowMs(
  process.env.RATE_LIMIT_AUTH_WINDOW_MS,
  15 * 60 * 1000
);
