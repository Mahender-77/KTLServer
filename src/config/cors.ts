import { getCorsOrigins } from "./env";

/**
 * CORS: allowed browser origins from `CORS_ORIGINS` (comma-separated).
 * See `env.ts` for development defaults when unset.
 */
export const allowedOrigins = getCorsOrigins();

export const corsOptions: {
  origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => void;
} = {
  origin(origin, callback) {
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
