import Organization from "../models/Organization";
import {
  DEFAULT_PRODUCT_FIELD_CONFIG,
  PRODUCT_FIELD_KEYS,
  type ProductFieldConfig,
} from "../constants/productFields";
import { getCachedProductFieldConfig } from "./productFieldConfigCache";

export { invalidateProductFieldConfigCache } from "./productFieldConfigCache";

async function fetchProductFieldConfigFromDb(
  organizationId: string
): Promise<ProductFieldConfig> {
  const org = await Organization.findById(organizationId).select("productFieldConfig").lean();
  const raw = org?.productFieldConfig as Partial<Record<string, boolean>> | undefined;
  const out: ProductFieldConfig = { ...DEFAULT_PRODUCT_FIELD_CONFIG };
  for (const k of PRODUCT_FIELD_KEYS) {
    if (typeof raw?.[k] === "boolean") {
      out[k] = raw[k] as boolean;
    }
  }
  return out;
}

/**
 * Tenant-specific product field toggles (super-admin / org settings).
 * Cached per org with TTL (see `PRODUCT_FIELD_CONFIG_CACHE_TTL_MS`).
 */
export async function getProductFieldConfigForOrganization(
  organizationId: string
): Promise<ProductFieldConfig> {
  return getCachedProductFieldConfig(organizationId, () =>
    fetchProductFieldConfigFromDb(organizationId)
  );
}

type CreateProductInput = {
  name: string;
  description?: string;
  category: string;
  store?: string;
  pricingMode?: "fixed" | "custom-weight" | "unit";
  baseUnit: "kg" | "g" | "ml" | "l" | "pcs";
  pricePerUnit: number;
  hasExpiry?: boolean;
  variants?: any[];
  imageUrl?: string | null;
  shelfLifeDays?: number | null;
  tags?: string[];
  taxRate?: number;
  minOrderQty?: number;
  maxOrderQty?: number;
};

/** Enforce org rules on create — never trust the client alone. */
export function applyCreateProductFieldConfig(
  data: CreateProductInput,
  cfg: ProductFieldConfig
): CreateProductInput {
  let pricingMode = data.pricingMode ?? "unit";
  if (!cfg.pricingMode) pricingMode = "unit";
  if (!cfg.variants && pricingMode === "fixed") pricingMode = "unit";

  const rawName = typeof data.name === "string" ? data.name.trim() : "";
  const name = cfg.name ? rawName : rawName || "Product";

  return {
    ...data,
    name,
    description: cfg.description ? data.description : undefined,
    pricingMode,
    pricePerUnit: cfg.pricePerUnit ? data.pricePerUnit : 0,
    variants: cfg.variants && pricingMode === "fixed" ? (Array.isArray(data.variants) ? data.variants : []) : [],
    tags: cfg.tags && Array.isArray(data.tags) ? data.tags : [],
    taxRate: cfg.taxRate ? data.taxRate : undefined,
    minOrderQty: cfg.minOrderQty ? data.minOrderQty : undefined,
    maxOrderQty: cfg.maxOrderQty ? data.maxOrderQty : undefined,
  };
}

type UpdateProductInput = {
  name?: string;
  description?: string;
  category?: string;
  pricingMode?: "fixed" | "custom-weight" | "unit";
  baseUnit?: "kg" | "g" | "ml" | "l" | "pcs";
  pricePerUnit?: number;
  hasExpiry?: boolean;
  shelfLifeDays?: number | null;
  variants?: any[];
  imageUrl?: string | null;
  tags?: string[];
  taxRate?: number | null;
  minOrderQty?: number | null;
  maxOrderQty?: number | null;
  isActive?: boolean;
};

/** Drop updates to fields the tenant has disabled (keeps existing DB values). */
export function applyUpdateProductFieldConfig(
  data: UpdateProductInput,
  cfg: ProductFieldConfig
): UpdateProductInput {
  const out: UpdateProductInput = { ...data };

  if (!cfg.name) delete out.name;
  if (!cfg.description) delete out.description;
  if (!cfg.pricePerUnit) delete out.pricePerUnit;
  if (!cfg.pricingMode) {
    delete out.pricingMode;
    delete out.variants;
  }
  if (!cfg.variants) {
    delete out.variants;
    if (out.pricingMode === "fixed") delete out.pricingMode;
  }
  if (!cfg.tags) delete out.tags;
  if (!cfg.taxRate) delete out.taxRate;
  if (!cfg.minOrderQty) delete out.minOrderQty;
  if (!cfg.maxOrderQty) delete out.maxOrderQty;

  return out;
}
