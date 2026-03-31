import Product from "../models/Product";
import Store from "../models/Store";
import Category from "../models/Category";
import slugify from "slugify";
import mongoose from "mongoose";
import { paginated, PaginatedResponse } from "../utils/pagination";
import { AppError } from "../utils/AppError";
import { tenantWhereClause, tenantScopedIdFilter } from "../utils/tenantScope";
import { tenantFilterFromActor } from "../utils/tenantFilter";

const now = () => new Date();

// ─── _id helper ──────────────────────────────────────────────────────────────

/**
 * Safely extract a string ID from a Mongoose ObjectId (lean) or string.
 * Never use optional chaining on toString — ObjectId.toHexString() is reliable.
 */
function extractId(val: any): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val.toHexString === "function") return val.toHexString();
  if (typeof val.toString    === "function") return val.toString();
  return String(val);
}

// ─── Stock helpers ────────────────────────────────────────────────────────────

export async function getAvailableStock(
  productId: string,
  variantId: string,
  storeId: string,
  organizationId: string
): Promise<number> {
  const product = await Product.findOne({
    _id: productId,
    ...tenantWhereClause(organizationId),
  })
    .select("inventoryBatches hasExpiry")
    .lean();
  if (!product?.inventoryBatches?.length) return 0;

  const vId       = variantId.toString();
  const sId       = storeId.toString();
  const today     = now();
  const hasExpiry = (product as any).hasExpiry === true;

  return product.inventoryBatches
    .filter((b: any) => {
      if (b.store?.toString()   !== sId) return false;
      if (b.variant?.toString() !== vId) return false;
      if ((Number(b.quantity) || 0) <= 0) return false;
      if (hasExpiry) {
        if (!b.expiryDate) return false;
        if (new Date(b.expiryDate) <= today) return false;
      }
      return true;
    })
    .reduce((acc: number, b: any) => acc + (Number(b.quantity) || 0), 0);
}

export function computeAvailableQuantity(productDoc: {
  hasExpiry?: boolean;
  inventoryBatches?: Array<{ quantity: number; expiryDate?: Date | string }>;
}): number {
  const batches   = productDoc.inventoryBatches ?? [];
  const hasExpiry = productDoc.hasExpiry === true;
  const today     = now();

  return batches.reduce((sum, b) => {
    const qty = Number(b.quantity) || 0;
    if (qty <= 0) return sum;
    if (hasExpiry) {
      const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
      if (!expiry || expiry <= today) return sum;
    }
    return sum + qty;
  }, 0);
}

export function computeStockByStoreVariant(productDoc: {
  hasExpiry?: boolean;
  inventoryBatches?: Array<{
    store: any;
    variant: any;
    quantity: number;
    expiryDate?: Date | string;
  }>;
}): Array<{ store: string; variant: string; availableStock: number }> {
  const batches   = productDoc.inventoryBatches ?? [];
  const hasExpiry = productDoc.hasExpiry === true;
  if (!batches.length) return [];

  const today = now();
  const map   = new Map<string, number>();

  for (const b of batches) {
    const qty = Number(b.quantity) || 0;
    if (qty <= 0) continue;
    if (hasExpiry) {
      const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
      if (!expiry || expiry <= today) continue;
    }
    const storeStr   = b.store?.toString?.()   ?? String(b.store   ?? "");
    const variantStr = b.variant?.toString?.() ?? String(b.variant ?? "");
    const key        = `${storeStr}:${variantStr}`;
    map.set(key, (map.get(key) ?? 0) + qty);
  }

  return Array.from(map.entries()).map(([key, availableStock]) => {
    const idx = key.indexOf(":");
    const store   = idx >= 0 ? key.slice(0, idx) : key;
    const variant = idx >= 0 ? key.slice(idx + 1) : "";
    return { store, variant, availableStock };
  });
}

// ─── Image helpers ────────────────────────────────────────────────────────────

function toUrl(val: any): string | null {
  if (!val) return null;
  if (typeof val === "string" && val.trim().length > 0) return val.trim();
  if (typeof val === "object") {
    const u = val.secure_url ?? val.url ?? val.path ?? val.uri;
    return typeof u === "string" && u.trim().length > 0 ? u.trim() : null;
  }
  return null;
}

function normalizeImages(p: any): string[] {
  if (!p) return [];
  const out: string[] = [];

  if (Array.isArray(p.images) && p.images.length > 0) {
    for (const v of p.images) {
      if (!v) continue;
      const u = typeof v === "string" ? (v.trim() || null) : toUrl(v);
      if (u) out.push(u);
    }
    if (out.length > 0) return out;
  }

  // Legacy single image field
  const legacy = toUrl(p.image);
  if (legacy) return [legacy];
  return [];
}

function computeNearestExpiry(p: {
  hasExpiry?: boolean;
  inventoryBatches?: Array<{ quantity: number; expiryDate?: Date | string }>;
}): Date | null {
  const batches = p.inventoryBatches ?? [];
  if (p.hasExpiry !== true || !batches.length) return null;
  const today = now();
  const future = batches
    .filter((b) => {
      const qty = Number(b.quantity) || 0;
      if (qty <= 0) return false;
      const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
      return expiry && expiry > today;
    })
    .map((b) => new Date(b.expiryDate!));
  return future.length > 0
    ? new Date(Math.min(...future.map((d) => d.getTime())))
    : null;
}

// ─── Formatter ────────────────────────────────────────────────────────────────

function formatProductForListing(p: any) {
  const nearestExp = computeNearestExpiry(p);
  const variants   = Array.isArray(p.variants)
    ? p.variants.map((v: any) => ({
        ...v,
        _id: v._id ? extractId(v._id) : undefined,
      }))
    : [];

  return {
    _id:                 extractId(p._id),
    name:                p.name              ?? "",
    slug:                p.slug              ?? "",
    description:         p.description       ?? "",
    category:            p.category          ?? null,
    images:              normalizeImages(p),
    pricingMode:         p.pricingMode       ?? "unit",
    baseUnit:            p.baseUnit          ?? "pcs",
    pricePerUnit:        p.pricePerUnit != null ? Number(p.pricePerUnit) : 0,
    hasExpiry:           p.hasExpiry         === true,
    shelfLifeDays:       p.shelfLifeDays     ?? null,
    variants,
    availableQuantity:   computeAvailableQuantity(p),
    nearestExpiry:       nearestExp ? nearestExp.toISOString() : null,
    stockByStoreVariant: computeStockByStoreVariant(p),
    isActive:            p.isActive          ?? false,
    tags:                Array.isArray(p.tags) ? p.tags : [],
    taxRate:             p.taxRate           ?? null,
    minOrderQty:         p.minOrderQty       ?? null,
    maxOrderQty:         p.maxOrderQty       ?? null,
  };
}

// ─── createProduct ────────────────────────────────────────────────────────────

export async function createProduct(
  data: {
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
  },
  organizationId: string
) {
  const {
    name, description, category,
    pricingMode = "unit",
    baseUnit, pricePerUnit,
    hasExpiry = false,
    variants, imageUrl, shelfLifeDays,
    tags, taxRate, minOrderQty, maxOrderQty,
  } = data;

  if (!name || !category) {
    throw new AppError("Missing required fields", 400, "MISSING_FIELDS");
  }
  const categoryDoc = await Category.findOne({
    _id: category,
    ...tenantWhereClause(organizationId),
  })
    .select("_id organizationId")
    .lean();
  if (!categoryDoc) {
    throw new AppError("Invalid category", 400, "INVALID_CATEGORY");
  }
  if (data.store) {
    const storeDoc = await Store.findOne({
      _id: data.store,
      ...tenantWhereClause(organizationId),
    })
      .select("_id organizationId")
      .lean();
    if (!storeDoc) {
      throw new AppError("Invalid store", 400, "INVALID_STORE");
    }
  }
  if (baseUnit == null || pricePerUnit == null) {
    throw new AppError("baseUnit and pricePerUnit are required", 400, "MISSING_FIELDS");
  }
  if (pricingMode === "fixed") {
    if (!variants || !Array.isArray(variants) || variants.length === 0) {
      throw new AppError("At least one variant is required for fixed pricing", 400, "MISSING_FIELDS");
    }
  }
  if (minOrderQty !== undefined && maxOrderQty !== undefined && minOrderQty > maxOrderQty) {
    throw new AppError("minOrderQty cannot be greater than maxOrderQty", 400, "INVALID_ORDER_QTY");
  }

  let slug = slugify(name, { lower: true, strict: true });
  const exists = await Product.findOne({
    slug,
    ...tenantWhereClause(organizationId),
  })
    .select("_id")
    .lean();
  if (exists) slug = `${slug}-${Date.now().toString(36)}`;

  // All fields explicitly set — no relying on schema defaults
  const productData: Record<string, unknown> = {
    name,
    organizationId,
    slug,
    category,
    pricingMode,
    baseUnit,
    pricePerUnit,
    hasExpiry,
    images:           imageUrl ? [imageUrl] : [],
    variants:         Array.isArray(variants) ? variants : [],
    inventoryBatches: [],
    tags:             Array.isArray(tags) ? tags.filter(Boolean) : [],
    isActive:         true,
  };

  if (description)                        productData.description   = description;
  if (shelfLifeDays && shelfLifeDays > 0) productData.shelfLifeDays = shelfLifeDays;
  if (taxRate     !== undefined)          productData.taxRate       = taxRate;
  if (minOrderQty !== undefined)          productData.minOrderQty   = minOrderQty;
  if (maxOrderQty !== undefined)          productData.maxOrderQty   = maxOrderQty;

  const product = new Product(productData);
  await product.save();
  return product;
}

// ─── getProducts (admin) ──────────────────────────────────────────────────────

export async function getProducts(params: {
  category?: string;
  page: number;
  limit: number;
  skip: number;
  organizationId: string;
  isSuperAdmin?: boolean;
}): Promise<PaginatedResponse<any>> {
  const { category, page, limit, skip, organizationId } = params;
  const filter: Record<string, unknown> = tenantFilterFromActor({
    organizationId,
    isSuperAdmin: false,
  });
  if (category) filter.category = category;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name slug")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return paginated(products.map(formatProductForListing), total, page, limit);
}

// ─── updateProduct ────────────────────────────────────────────────────────────

export async function updateProduct(
  id: string,
  data: {
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
  },
  organizationId: string
) {
  const product = await Product.findOne({ _id: id, ...tenantWhereClause(organizationId) });
  if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");

  const {
    name, description, category, pricingMode, baseUnit, pricePerUnit,
    hasExpiry, shelfLifeDays, variants, imageUrl, tags,
    taxRate, minOrderQty, maxOrderQty, isActive,
  } = data;

  if (name != null) product.name = name;
  if (description !== undefined) product.description = description || undefined;
  if (category != null) {
    const categoryDoc = await Category.findOne({
      _id: category,
      ...tenantWhereClause(organizationId),
    })
      .select("_id")
      .lean();
    if (!categoryDoc) {
      throw new AppError("Invalid category", 400, "INVALID_CATEGORY");
    }
    product.category = category as any;
  }
  if (pricingMode != null) product.pricingMode = pricingMode;
  if (baseUnit != null) product.baseUnit = baseUnit;
  if (pricePerUnit != null) product.pricePerUnit = pricePerUnit;
  if (hasExpiry !== undefined) product.hasExpiry = hasExpiry;
  if (shelfLifeDays !== undefined) product.shelfLifeDays = shelfLifeDays && shelfLifeDays > 0 ? shelfLifeDays : undefined;
  if (taxRate !== undefined) product.taxRate = taxRate ?? undefined;
  if (minOrderQty !== undefined) product.minOrderQty = minOrderQty ?? undefined;
  if (maxOrderQty !== undefined) product.maxOrderQty = maxOrderQty ?? undefined;
  if (isActive !== undefined) product.isActive = isActive;

  if (Array.isArray(tags)) product.tags = tags.filter(Boolean);
  if (Array.isArray(variants)) product.variants = variants;

  if (imageUrl != null) {
    if (imageUrl) {
      const current = (product.images ?? []) as string[];
      product.images = current.length ? [imageUrl, ...current.filter((u) => u !== imageUrl)].slice(0, 5) : [imageUrl];
    }
  }

  if (name != null && name.trim()) {
    let slug = slugify(name, { lower: true, strict: true });
    const exists = await Product.findOne({
      slug,
      _id: { $ne: id },
      ...tenantWhereClause(organizationId),
    })
      .select("_id")
      .lean();
    if (exists) slug = `${slug}-${Date.now().toString(36)}`;
    product.slug = slug;
  }

  if (minOrderQty !== undefined && maxOrderQty !== undefined && minOrderQty != null && maxOrderQty != null && minOrderQty > maxOrderQty) {
    throw new AppError("minOrderQty cannot be greater than maxOrderQty", 400, "INVALID_ORDER_QTY");
  }
  if (pricingMode === "fixed" && Array.isArray(variants) && variants.length === 0) {
    throw new AppError("At least one variant is required for fixed pricing", 400, "MISSING_FIELDS");
  }

  await product.save();
  const updated = await Product.findOne({ _id: id, ...tenantWhereClause(organizationId) })
    .populate("category", "name slug")
    .lean();
  if (!updated) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  return formatProductForListing(updated);
}

// ─── deleteProduct ────────────────────────────────────────────────────────────

export async function deleteProduct(id: string, organizationId: string) {
  const product = await Product.findOne({ _id: id, ...tenantWhereClause(organizationId) })
    .select("_id")
    .lean();
  if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  await Product.deleteOne({ _id: id, ...tenantWhereClause(organizationId) });
  return { message: "Product deleted" };
}

// ─── getPublicProducts ────────────────────────────────────────────────────────

export async function getPublicProducts(params: {
  category?: string;
  page: number;
  limit: number;
  skip: number;
  organizationId: string;
}): Promise<PaginatedResponse<any>> {
  const { category, page, limit, skip, organizationId } = params;

  const filter: Record<string, unknown> = {
    isActive: true,
    "inventoryBatches.quantity": { $gt: 0 },
  };
  Object.assign(filter, tenantWhereClause(organizationId));
  if (category) filter.category = category;

  const [rawProducts, total] = await Promise.all([
    Product.find(filter)
      .populate("category", "name slug")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  // Post-filter: for hasExpiry products ensure non-expired stock still exists
  const products = rawProducts.filter((p: any) => {
    if (p.hasExpiry !== true) return true;
    return computeAvailableQuantity(p) > 0;
  });
  return paginated(products.map(formatProductForListing), total, page, limit);
}

// ─── getProductById (public) ──────────────────────────────────────────────────

export async function getProductById(id: string, organizationId: string) {
  const product = await Product.findOne({ _id: id, ...tenantWhereClause(organizationId) })
    .populate("category", "name slug")
    .lean();

  if (!product || !(product as any).isActive) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }
  return formatProductForListing(product);
}

// ─── getProductByIdForAdmin ───────────────────────────────────────────────────

export async function getProductByIdForAdmin(
  id: string,
  organizationId: string
) {
  const product = await Product.findOne(tenantScopedIdFilter(organizationId, id))
    .populate("category", "name slug")
    .populate({ path: "inventoryBatches.store", select: "name" })
    .lean();

  if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  return product;
}

// ─── addBatch ─────────────────────────────────────────────────────────────────

export type AddBatchInput = {
  store: string;
  variant?: string;
  quantity: number;
  manufacturingDate?: Date;
  expiryDate?: Date;
  batchNumber: string;
  costPrice?: number;
};

export async function addBatch(productId: string, data: AddBatchInput, organizationId: string) {
  const product = await Product.findOne({ _id: productId, ...tenantWhereClause(organizationId) })
    .select("pricingMode hasExpiry inventoryBatches baseUnit")
    .lean();
  if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");

  const store = await Store.findOne({ _id: data.store, ...tenantWhereClause(organizationId) })
    .select("_id")
    .lean();
  if (!store) throw new AppError("Store not found", 404, "STORE_NOT_FOUND");

  const pricingMode = (product as any).pricingMode ?? "unit";
  const hasExpiry   = (product as any).hasExpiry === true;
  const storeId     = new mongoose.Types.ObjectId(data.store);

  if (data.quantity == null || data.quantity <= 0) {
    throw new AppError("quantity is required and must be greater than 0", 400, "INVALID_QUANTITY");
  }
  if (pricingMode === "fixed" && !data.variant) {
    throw new AppError("variant is required for fixed-pricing products", 400, "MISSING_VARIANT");
  }

  const variantId = data.variant ? new mongoose.Types.ObjectId(data.variant) : undefined;

  if (hasExpiry) {
    if (data.manufacturingDate == null || data.expiryDate == null) {
      throw new AppError(
        "manufacturingDate and expiryDate are required when product has expiry",
        400,
        "MISSING_DATES"
      );
    }
    if (new Date(data.expiryDate) <= new Date(data.manufacturingDate)) {
      throw new AppError("expiryDate must be after manufacturingDate", 400, "INVALID_EXPIRY");
    }
  }

  const batchNumber = data.batchNumber?.trim?.() ?? "";
  if (!batchNumber) {
    throw new AppError("batchNumber is required", 400, "MISSING_BATCH_NUMBER");
  }

  const batches = ((product as any).inventoryBatches ?? []) as Array<{
    store: unknown; variant?: unknown; batchNumber: string;
  }>;
  const duplicate = batches.some(
    (b) =>
      b.store?.toString() === storeId.toString() &&
      (variantId
        ? b.variant?.toString() === variantId.toString()
        : !b.variant) &&
      b.batchNumber === batchNumber
  );
  if (duplicate) {
    throw new AppError("Batch number already exists for this store", 400, "BATCH_NUMBER_DUPLICATE");
  }

  const newBatch: Record<string, unknown> = {
    store:       storeId,
    quantity:    data.quantity,
    batchNumber,
    ...(variantId              && { variant:           variantId }),
    ...(data.manufacturingDate && { manufacturingDate: data.manufacturingDate }),
    ...(data.expiryDate        && { expiryDate:        data.expiryDate }),
    ...(data.costPrice != null && { costPrice:         data.costPrice }),
  };

  await Product.findOneAndUpdate(
    { _id: productId, ...tenantWhereClause(organizationId) },
    {
      $push: { inventoryBatches: newBatch },
    }
  );

  const updated = await Product.findOne({ _id: productId, ...tenantWhereClause(organizationId) })
    .select("name _id inventoryBatches")
    .lean();

  return { message: "Batch added successfully", product: updated };
}

// ─── getExpiringBatches ───────────────────────────────────────────────────────

const MAX_EXPIRING_DAYS = 365;

export type ExpiringBatchRow = {
  productId: string;
  productName: string;
  variantId: string;
  storeId: string;
  batches: Array<{
    batchId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
  }>;
  totalQuantity: number;
};

export async function getExpiringBatches(params: {
  days: number;
  page: number;
  limit: number;
  skip: number;
  organizationId: string;
}): Promise<PaginatedResponse<ExpiringBatchRow>> {
  const { days, page, limit, skip, organizationId } = params;
  const start   = now();
  const endDate = new Date(
    start.getTime() +
      Math.min(Math.max(days, 1), MAX_EXPIRING_DAYS) * 24 * 60 * 60 * 1000
  );

  const pipeline: mongoose.PipelineStage[] = [
    {
      $match: {
        ...tenantWhereClause(organizationId),
        "inventoryBatches.0": { $exists: true },
        "inventoryBatches.expiryDate": { $gte: start, $lte: endDate },
      },
    },
    { $unwind: { path: "$inventoryBatches", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "inventoryBatches.expiryDate": { $gte: start, $lte: endDate },
        "inventoryBatches.quantity":   { $gt: 0 },
      },
    },
    {
      $group: {
        _id: {
          product: "$_id",
          variant: "$inventoryBatches.variant",
          store:   "$inventoryBatches.store",
        },
        productName:   { $first: "$name" },
        batches: {
          $push: {
            batchId:     "$inventoryBatches._id",
            batchNumber: "$inventoryBatches.batchNumber",
            expiryDate:  "$inventoryBatches.expiryDate",
            quantity:    "$inventoryBatches.quantity",
          },
        },
        totalQuantity: { $sum: "$inventoryBatches.quantity" },
      },
    },
    { $sort: { productName: 1, totalQuantity: -1 } },
    {
      $facet: {
        total: [{ $count: "count" }],
        data:  [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const result  = await Product.aggregate(pipeline);
  const total   = result[0]?.total?.[0]?.count ?? 0;
  const rawData = result[0]?.data ?? [];

  const data: ExpiringBatchRow[] = rawData.map((row: any) => ({
    productId:     extractId(row._id.product),
    productName:   row.productName ?? "",
    variantId:     row._id.variant?.toString() ?? "",
    storeId:       row._id.store?.toString()   ?? "",
    batches: (row.batches ?? []).map((b: any) => ({
      batchId:     extractId(b.batchId),
      batchNumber: b.batchNumber ?? "",
      expiryDate:  b.expiryDate ? new Date(b.expiryDate).toISOString() : "",
      quantity:    Number(b.quantity) || 0,
    })),
    totalQuantity: Number(row.totalQuantity) || 0,
  }));

  return paginated(data, total, page, limit);
}

// ─── Deal of the Day helpers ───────────────────────────────────────────────────

const DEAL_EXPIRING_DAYS = 2;
export const DEAL_DISCOUNT_PERCENT = 5;

/** Check if product has inventory expiring within DEAL_EXPIRING_DAYS days (for 5% deal discount) */
export function qualifiesForDealOfTheDay(productDoc: {
  hasExpiry?: boolean;
  inventoryBatches?: Array<{ quantity?: number; expiryDate?: Date | string }>;
}): boolean {
  const batches = productDoc.inventoryBatches ?? [];
  if (productDoc.hasExpiry !== true || !batches.length) return false;
  const start = now();
  const endDate = new Date(
    start.getTime() + DEAL_EXPIRING_DAYS * 24 * 60 * 60 * 1000
  );
  return batches.some((b) => {
    const qty = Number(b.quantity) || 0;
    if (qty <= 0) return false;
    const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
    return expiry && expiry >= start && expiry <= endDate;
  });
}

/** Products with inventory expiring within DEAL_EXPIRING_DAYS days — for Deal of the Day */
export async function getDealOfTheDay(params: { limit?: number; organizationId: string }) {
  const limit = Math.min(Math.max(params?.limit ?? 20, 1), 50);
  const start = now();
  const endDate = new Date(
    start.getTime() + DEAL_EXPIRING_DAYS * 24 * 60 * 60 * 1000
  );

  const filter: Record<string, unknown> = {
    isActive: true,
    hasExpiry: true,
    "inventoryBatches.0": { $exists: true },
    "inventoryBatches.expiryDate": { $gte: start, $lte: endDate },
    "inventoryBatches.quantity": { $gt: 0 },
  };
  Object.assign(filter, tenantWhereClause(params.organizationId));

  const products = await Product.find(filter)
    .populate("category", "name slug")
    .sort({ "inventoryBatches.expiryDate": 1 })
    .limit(limit * 2) // fetch extra, then filter
    .lean();

  // Post-filter: only include products that have at least one batch expiring within window
  // and have available stock after computeAvailableQuantity
  const filtered = products.filter((p: any) => {
    const hasExpiringBatch = (p.inventoryBatches ?? []).some((b: any) => {
      const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
      return expiry && expiry >= start && expiry <= endDate && (Number(b.quantity) || 0) > 0;
    });
    if (!hasExpiringBatch) return false;
    return computeAvailableQuantity(p) > 0;
  });

  const formatted = filtered.slice(0, limit).map((p: any) => ({
    ...formatProductForListing(p),
    dealDiscountPercent: DEAL_DISCOUNT_PERCENT,
  }));

  return { data: formatted };
}