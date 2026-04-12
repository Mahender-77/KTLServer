import { logger } from '../utils/logger';
import { Request, Response } from "express";
import { getPaginationParams, paginated } from "../utils/pagination";
import * as productService from "../services/product.service";
import { AppError } from "../utils/AppError";
import type { AuthRequest } from "../middlewares/auth.middleware";
import { requestActor } from "../utils/requestActor";
import { resolvePublicCatalogScope, resolvePublicOrganizationId } from "../utils/tenantScope";
import { appendAuditLogSafe } from "../services/auditLog.service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Safely extract a single string from req.params (guards against array params) */
const paramId = (id: string | string[] | undefined): string =>
  (Array.isArray(id) ? id[0] : id) ?? "";

/** Coerce multipart string → number; returns undefined for empty / non-finite values */
const coerceNumber = (raw: unknown): number | undefined => {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

/** Coerce multipart string / boolean → boolean */
const coerceBool = (raw: unknown): boolean =>
  raw === true || raw === "true";

/**
 * Parse a JSON string or return the value as-is.
 * Throws a typed AppError on malformed JSON.
 */
function parseJsonField<T>(raw: unknown, fieldName: string): T | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw !== "string") return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new AppError(
      `Invalid ${fieldName} format — expected JSON`,
      400,
      "INVALID_JSON"
    );
  }
}

const DEFAULT_EXPIRING_DAYS = 7;
const MAX_EXPIRING_DAYS = 365;

function parseDays(query: string | undefined): number {
  if (!query) return DEFAULT_EXPIRING_DAYS;
  const n = parseInt(query, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_EXPIRING_DAYS;
  return Math.min(n, MAX_EXPIRING_DAYS);
}

// ─── Controllers ──────────────────────────────────────────────────────────────

export const createProduct = async (req: AuthRequest, res: Response) => {
  if (!req.body) throw new AppError("Invalid request body", 400, "INVALID_BODY");
  const orgId = req.user?.organizationId?.toString?.();
  if (!orgId && !req.user?.isSuperAdmin) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  if (!orgId) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  req.body.organizationId = orgId;

  const pricingMode = (
    ["fixed", "custom-weight", "unit"] as const
  ).includes(req.body.pricingMode)
    ? (req.body.pricingMode as "fixed" | "custom-weight" | "unit")
    : "unit";

  // variants — JSON string from multipart or already-parsed array
  const variants =
    parseJsonField<any[]>(req.body.variants, "variants") ??
    (pricingMode === "fixed" ? undefined : []);

  // tags — JSON string e.g. '["organic","seasonal"]' or plain array
  const tags = parseJsonField<string[]>(req.body.tags, "tags") ?? [];

  // multer-storage-cloudinary v4: URL is in .path; Cloudinary response may have .secure_url or .url
  const file = req.file as { path?: string; url?: string; secure_url?: string } | undefined;
  const imageUrl = file ? (file.path ?? file.secure_url ?? file.url ?? null) : null;

  const rawShelf = coerceNumber(req.body.shelfLifeDays);
  const shelfLifeDays =
    rawShelf !== undefined && rawShelf > 0 ? rawShelf : undefined;

  const pricePerUnit = coerceNumber(req.body.pricePerUnit);
  const taxRate      = coerceNumber(req.body.taxRate);
  const minOrderQty  = coerceNumber(req.body.minOrderQty);
  const maxOrderQty  = coerceNumber(req.body.maxOrderQty);
  const hasExpiry    = coerceBool(req.body.hasExpiry);
  const baseUnit     = req.body.baseUnit as "kg" | "g" | "ml" | "l" | "pcs";

  const product = await productService.createProduct(
    {
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
      store: req.body.store,
      pricingMode,
      baseUnit,
      pricePerUnit: pricePerUnit!,
      hasExpiry,
      variants,
      imageUrl,
      shelfLifeDays,
      tags,
      taxRate,
      minOrderQty,
      maxOrderQty,
    },
    orgId
  );

  await appendAuditLogSafe({
    organizationId: orgId,
    userId: req.user!._id.toString(),
    action: "product.created",
    metadata: { productId: String(product._id), name: product.name },
  });

  res.status(201).json(product);
};

export const getProducts = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const { page, limit, skip } = getPaginationParams(req);
  const category = req.query.category as string | undefined;
  const result = await productService.getProducts({
    category,
    page,
    limit,
    skip,
    organizationId: actor.organizationId,
  });
  res.json(result);
};

export const getPublicProducts = async (req: Request, res: Response) => {
  // Debug: if you don't see this in your backend terminal, the request is NOT reaching this server
  logger.log("[getPublicProducts] Request received — backend is being hit");
  const { page, limit, skip } = getPaginationParams(req);
  const category = req.query.category as string | undefined;
  const scope = await resolvePublicCatalogScope(req);
  const result =
    scope.mode === "single"
      ? await productService.getPublicProducts({
          category,
          page,
          limit,
          skip,
          organizationId: scope.organizationId,
        })
      : scope.organizationIds.length === 0
        ? paginated([], 0, page, limit)
        : await productService.getPublicProducts({
            category,
            page,
            limit,
            skip,
            organizationIds: scope.organizationIds,
          });
  // Ensure every product has _id and images (never omitted by JSON serialization)
  const normalizedData = (result.data || []).map((p: any) => ({
    _id:              p._id ?? p.id ?? "",
    name:             p.name ?? "",
    slug:             p.slug ?? "",
    description:      p.description ?? "",
    category:         p.category ?? null,
    images:           Array.isArray(p.images) ? p.images : [],
    pricingMode:      p.pricingMode ?? "unit",
    baseUnit:         p.baseUnit ?? "pcs",
    pricePerUnit:     p.pricePerUnit != null ? Number(p.pricePerUnit) : 0,
    hasExpiry:        p.hasExpiry === true,
    shelfLifeDays:    p.shelfLifeDays ?? null,
    variants:         Array.isArray(p.variants) ? p.variants : [],
    availableQuantity: p.availableQuantity ?? 0,
    nearestExpiry:    p.nearestExpiry ?? null,
    stockByStoreVariant: p.stockByStoreVariant ?? [],
    isActive:         p.isActive ?? true,
    tags:             Array.isArray(p.tags) ? p.tags : [],
    taxRate:          p.taxRate ?? null,
    minOrderQty:      p.minOrderQty ?? null,
    maxOrderQty:      p.maxOrderQty ?? null,
  }));
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-KTL-Backend", "true");
  res.json({
    data: normalizedData,
    total: result.total,
    page: result.page,
    totalPages: result.totalPages,
    __source: "ktl-backend", // If you don't see this in curl response, a DIFFERENT server is responding
  });
};

export const getProductById = async (req: Request, res: Response) => {
  const id = paramId(req.params.id);
  const scope = await resolvePublicCatalogScope(req);
  if (scope.mode === "marketplace" && scope.organizationIds.length === 0) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }
  const product =
    scope.mode === "single"
      ? await productService.getProductById(id, scope.organizationId)
      : await productService.getProductByIdMarketplace(id, scope.organizationIds);
  res.status(200).json(product);
};

export const getProductByIdForAdmin = async (req: AuthRequest, res: Response) => {
  const actor = requestActor(req);
  const id = paramId(req.params.id);
  const product = await productService.getProductByIdForAdmin(id, actor.organizationId);
  res.status(200).json(product);
};

export const deleteProduct = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const id = paramId(req.params.id);
  const result = await productService.deleteProduct(id, organizationId);
  await appendAuditLogSafe({
    organizationId,
    userId: req.user!._id.toString(),
    action: "product.deleted",
    metadata: { productId: id },
  });
  res.json(result);
};

export const updateProduct = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const id = paramId(req.params.id);
  if (!id) throw new AppError("Product ID is required", 400, "INVALID_ID");

  const body = req.body ?? {};
  const pricingMode = (
    ["fixed", "custom-weight", "unit"] as const
  ).includes(body.pricingMode)
    ? (body.pricingMode as "fixed" | "custom-weight" | "unit")
    : undefined;

  const variants = parseJsonField<any[]>(body.variants, "variants");
  const tags = parseJsonField<string[]>(body.tags, "tags");

  const file = req.file as { path?: string; url?: string; secure_url?: string } | undefined;
  const imageUrl = file ? (file.path ?? file.secure_url ?? file.url ?? null) : null;

  const updateData: Parameters<typeof productService.updateProduct>[1] = {};

  if (body.name != null) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.category != null) updateData.category = body.category;
  if (pricingMode != null) updateData.pricingMode = pricingMode;
  if (body.baseUnit != null) updateData.baseUnit = body.baseUnit as any;
  if (body.pricePerUnit != null) updateData.pricePerUnit = coerceNumber(body.pricePerUnit);
  if (body.hasExpiry !== undefined) updateData.hasExpiry = coerceBool(body.hasExpiry);
  const rawShelf = coerceNumber(body.shelfLifeDays);
  if (rawShelf !== undefined) updateData.shelfLifeDays = rawShelf && rawShelf > 0 ? rawShelf : null;
  if (tags !== undefined) updateData.tags = tags ?? [];
  if (variants !== undefined) updateData.variants = variants;
  if (imageUrl != null) updateData.imageUrl = imageUrl;
  if (body.taxRate !== undefined) updateData.taxRate = coerceNumber(body.taxRate) ?? null;
  if (body.minOrderQty !== undefined) updateData.minOrderQty = coerceNumber(body.minOrderQty) ?? null;
  if (body.maxOrderQty !== undefined) updateData.maxOrderQty = coerceNumber(body.maxOrderQty) ?? null;
  if (body.isActive !== undefined) updateData.isActive = coerceBool(body.isActive);

  const product = await productService.updateProduct(id, updateData, organizationId);
  await appendAuditLogSafe({
    organizationId,
    userId: req.user!._id.toString(),
    action: "product.updated",
    metadata: { productId: id },
  });
  res.status(200).json(product);
};

export const addBatch = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const id = paramId(req.params.id);
  const result = await productService.addBatch(id, req.body, organizationId);
  await appendAuditLogSafe({
    organizationId,
    userId: req.user!._id.toString(),
    action: "inventory.batch_added",
    metadata: { productId: id },
  });
  res.status(201).json(result);
};

export const getExpiringBatches = async (req: AuthRequest, res: Response) => {
  const { organizationId } = requestActor(req);
  const days = parseDays(req.query.days as string | undefined);
  const { page, limit, skip } = getPaginationParams(req);
  const result = await productService.getExpiringBatches({
    days,
    page,
    limit,
    skip,
    organizationId,
  });
  res.json(result);
};

export const getDealOfTheDay = async (req: Request, res: Response) => {
  const limit = Math.min(parseInt(String(req.query.limit || 20), 10) || 20, 50);
  const organizationId = await resolvePublicOrganizationId(req);
  if (!organizationId) {
    return res.json({ data: [] });
  }
  const result = await productService.getDealOfTheDay({ limit, organizationId });
  res.json(result);
};