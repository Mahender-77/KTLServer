import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCachedProductFieldConfig,
  getProductFieldConfigCacheTtlMs,
  invalidateProductFieldConfigCache,
} from "./productFieldConfigCache";
import { DEFAULT_PRODUCT_FIELD_CONFIG, type ProductFieldConfig } from "../constants/productFields";

describe("productFieldConfigCache", () => {
  const orgId = "507f1f77bcf86cd799439011";

  beforeEach(() => {
    invalidateProductFieldConfigCache();
    delete process.env.PRODUCT_FIELD_CONFIG_CACHE_TTL_MS;
  });

  it("returns default TTL when env unset", () => {
    expect(getProductFieldConfigCacheTtlMs()).toBe(60_000);
  });

  it("respects PRODUCT_FIELD_CONFIG_CACHE_TTL_MS=0 (bypass cache)", async () => {
    process.env.PRODUCT_FIELD_CONFIG_CACHE_TTL_MS = "0";
    let loads = 0;
    const loader = async (): Promise<ProductFieldConfig> => {
      loads++;
      return { ...DEFAULT_PRODUCT_FIELD_CONFIG };
    };
    await getCachedProductFieldConfig(orgId, loader);
    await getCachedProductFieldConfig(orgId, loader);
    expect(loads).toBe(2);
  });

  it("caches loader result until TTL expires", async () => {
    process.env.PRODUCT_FIELD_CONFIG_CACHE_TTL_MS = "40";
    let loads = 0;
    const loader = async (): Promise<ProductFieldConfig> => {
      loads++;
      return { ...DEFAULT_PRODUCT_FIELD_CONFIG };
    };
    await getCachedProductFieldConfig(orgId, loader);
    await getCachedProductFieldConfig(orgId, loader);
    expect(loads).toBe(1);
    await new Promise((r) => setTimeout(r, 80));
    await getCachedProductFieldConfig(orgId, loader);
    expect(loads).toBe(2);
  });

  it("dedupes concurrent in-flight loads for the same org", async () => {
    let loads = 0;
    const loader = async (): Promise<ProductFieldConfig> => {
      loads++;
      await new Promise((r) => setTimeout(r, 25));
      return { ...DEFAULT_PRODUCT_FIELD_CONFIG };
    };
    const [a, b] = await Promise.all([
      getCachedProductFieldConfig(orgId, loader),
      getCachedProductFieldConfig(orgId, loader),
    ]);
    expect(loads).toBe(1);
    expect(a).toEqual(b);
  });

  it("invalidate clears cache so the next read reloads", async () => {
    let loads = 0;
    const loader = vi.fn(async (): Promise<ProductFieldConfig> => {
      loads++;
      return { ...DEFAULT_PRODUCT_FIELD_CONFIG };
    });
    await getCachedProductFieldConfig(orgId, loader);
    await getCachedProductFieldConfig(orgId, loader);
    expect(loads).toBe(1);
    invalidateProductFieldConfigCache(orgId);
    await getCachedProductFieldConfig(orgId, loader);
    expect(loads).toBe(2);
  });
});
