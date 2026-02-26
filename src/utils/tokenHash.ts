import crypto from "crypto";

const HASH_ALGORITHM = "sha256";
const ENCODING = "hex" as const;

/**
 * Hash a refresh token for storage. Never store raw tokens in DB.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash(HASH_ALGORITHM).update(token).digest(ENCODING);
}
