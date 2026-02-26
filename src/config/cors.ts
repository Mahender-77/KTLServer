/**
 * CORS configuration: allow only known origins from environment.
 * Set CORS_ORIGINS to a comma-separated list, e.g.:
 *   CORS_ORIGINS=https://app.example.com,https://admin.example.com
 * For local dev: CORS_ORIGINS=http://localhost:3000,http://localhost:8081
 * If unset or empty, no origins are allowed (browser requests from other origins will be rejected).
 */
const originsStr = process.env.CORS_ORIGINS ?? "";
export const allowedOrigins = originsStr
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const corsOptions: { origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void } = {
  origin(origin, callback) {
    // Allow requests with no Origin (e.g. same-origin, Postman, mobile apps)
    if (origin === undefined) {
      return callback(null, true);
    }
    if (allowedOrigins.length === 0) {
      return callback(null, false);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(null, false);
  },
};
