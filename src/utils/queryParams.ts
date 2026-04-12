import type { Request } from "express";

/**
 * Express 5 / qs may surface duplicate keys as `string[]`. Normalize to a single string.
 */
export function firstQueryString(req: Request, key: string): string {
  const v = req.query[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0];
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  return "";
}
