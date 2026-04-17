import type { ProductFieldConfig } from "../constants/productFields.js";

const DEFAULT_TTL_MS = 60_000;

const cache = new Map<string, { value: ProductFieldConfig; expiresAt: number }>();
const inFlight = new Map<string, Promise<ProductFieldConfig>>();

/** Override via env (ms). Set to `0` to disable caching (always load from DB). */
export function getProductFieldConfigCacheTtlMs(): number {
  const raw = process.env.PRODUCT_FIELD_CONFIG_CACHE_TTL_MS;
  if (raw == null || raw === "") return DEFAULT_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_TTL_MS;
}

/**
 * Per-organization TTL cache with in-flight deduplication (parallel requests share one DB read).
 */
export async function getCachedProductFieldConfig(
  organizationId: string,
  loader: () => Promise<ProductFieldConfig>
): Promise<ProductFieldConfig> {
  const ttl = getProductFieldConfigCacheTtlMs();
  if (ttl === 0) return loader();

  const now = Date.now();
  const hit = cache.get(organizationId);
  if (hit && hit.expiresAt > now) return hit.value;

  let p = inFlight.get(organizationId);
  if (!p) {
    p = loader()
      .then((value) => {
        cache.set(organizationId, { value, expiresAt: Date.now() + ttl });
        return value;
      })
      .finally(() => {
        inFlight.delete(organizationId);
      });
    inFlight.set(organizationId, p);
  }
  return p;
}

/** Call when `productFieldConfig` changes for an org (e.g. super-admin PATCH). Omit id to clear all. */
export function invalidateProductFieldConfigCache(organizationId?: string): void {
  if (organizationId) {
    cache.delete(organizationId);
    inFlight.delete(organizationId);
    return;
  }
  cache.clear();
  inFlight.clear();
}
