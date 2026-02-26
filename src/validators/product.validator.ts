import { z } from "zod";
import { objectIdString } from "./common";

// ─── Reusable primitives ──────────────────────────────────────────────────────

const variantType = z.enum(["weight", "pieces", "box"]);
const variantUnit = z.enum(["g", "kg", "ml", "l", "pcs", "box"]);
const baseUnitEnum = z.enum(["kg", "g", "ml", "l", "pcs"]);
const pricingModeEnum = z.enum(["fixed", "custom-weight", "unit"]);

/** Coerces a multipart string → number, returns undefined for empty / null */
const coerceNumber = (min?: number, max?: number) =>
  z.preprocess(
    (v) => (v === "" || v == null ? undefined : Number(v)),
    z
      .number()
      .min(min ?? -Infinity)
      .max(max ?? Infinity)
      .optional()
  );

// ─── Variant ─────────────────────────────────────────────────────────────────

const variantSchema = z.object({
  type: variantType,
  value: z.number().positive("Variant value must be positive"),
  unit: variantUnit,
  price: z.number().min(0, "Price must be non-negative"),
  offerPrice: z.number().min(0).optional(),
  sku: z.string().max(50).trim().optional(),
});

// ─── Create Product ───────────────────────────────────────────────────────────

export const createProductSchema = z
  .object({
    body: z.object({
      // ── Required ──
      name: z
        .string()
        .min(1, "Name is required")
        .max(200, "Name too long")
        .trim(),
      category: objectIdString,
      pricingMode: pricingModeEnum,
      baseUnit: baseUnitEnum,
      pricePerUnit: z.preprocess(
        (v) => (v === "" || v == null ? undefined : Number(v)),
        z.number().min(0, "pricePerUnit must be >= 0")
      ),
      hasExpiry: z
        .preprocess((v) => v === true || v === "true", z.boolean())
        .default(false),

      // ── Optional core ──
      description: z.string().max(5000).trim().optional(),

      // variants: either already-parsed array or JSON string from multipart
      variants: z
        .union([z.string(), z.array(variantSchema)])
        .optional(),

      shelfLifeDays: z.preprocess(
        (v) => (v === "" || v == null ? undefined : Number(v)),
        z.number().int().min(1).max(3650).optional()
      ),

      // ── New fields ──
      /** Array of searchable labels, sent as JSON string from multipart */
      tags: z
        .union([z.string(), z.array(z.string().max(50).trim())])
        .optional(),

      /** GST / VAT percentage, 0–100 */
      taxRate: coerceNumber(0, 100),

      /** Minimum order quantity in baseUnit */
      minOrderQty: coerceNumber(0),

      /** Maximum order quantity in baseUnit */
      maxOrderQty: coerceNumber(0),
    }),
  })
  .superRefine((data, ctx) => {
    const body = data.body;

    // Fixed pricing → at least one variant required
    if (body.pricingMode === "fixed") {
      const hasVariants =
        body.variants !== undefined &&
        body.variants !== null &&
        (typeof body.variants === "string"
          ? body.variants.trim().length > 0
          : (body.variants as any[]).length >= 1);

      if (!hasVariants) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one variant is required for fixed pricing",
          path: ["body", "variants"],
        });
      }
    }

    // minOrderQty <= maxOrderQty
    const min = body.minOrderQty as number | undefined;
    const max = body.maxOrderQty as number | undefined;
    if (min !== undefined && max !== undefined && min > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minOrderQty cannot be greater than maxOrderQty",
        path: ["body", "minOrderQty"],
      });
    }
  });

// ─── Add Batch ────────────────────────────────────────────────────────────────

const addBatchBodySchema = z
  .object({
    store: objectIdString,
    variant: objectIdString.optional(),
    /** Quantity in product.baseUnit. Must be > 0. */
    quantity: z.number().positive("Quantity must be greater than 0"),
    manufacturingDate: z.coerce.date().optional(),
    expiryDate: z.coerce.date().optional(),
    batchNumber: z
      .string()
      .min(1, "Batch number is required")
      .max(100, "Batch number too long")
      .trim(),
    costPrice: z.number().min(0, "Cost price must be non-negative").optional(),
  })
  .refine(
    (data) =>
      !data.expiryDate ||
      !data.manufacturingDate ||
      data.expiryDate > data.manufacturingDate,
    {
      message: "expiryDate must be after manufacturingDate",
      path: ["expiryDate"],
    }
  );

/** POST /api/products/:id/add-batch */
export const addBatchSchema = z.object({
  params: z.object({ id: objectIdString }),
  body: addBatchBodySchema,
});

// ─── Update Product (partial) ─────────────────────────────────────────────────

export const updateProductSchema = z.object({
  params: z.object({ id: objectIdString }),
  body: z
    .object({
      name: z.string().min(1).max(200).trim().optional(),
      description: z.string().max(5000).trim().optional(),
      category: objectIdString.optional(),
      pricingMode: pricingModeEnum.optional(),
      baseUnit: baseUnitEnum.optional(),
      pricePerUnit: coerceNumber(0),
      hasExpiry: z
        .preprocess((v) => v === true || v === "true", z.boolean())
        .optional(),
      shelfLifeDays: z.preprocess(
        (v) => (v === "" || v == null ? undefined : Number(v)),
        z.number().int().min(1).max(3650).optional()
      ),
      tags: z
        .union([z.string(), z.array(z.string().max(50).trim())])
        .optional(),
      taxRate: coerceNumber(0, 100),
      minOrderQty: coerceNumber(0),
      maxOrderQty: coerceNumber(0),
      isActive: z
        .preprocess((v) => v === true || v === "true", z.boolean())
        .optional(),
    })
    .superRefine((body, ctx) => {
      const min = body.minOrderQty as number | undefined;
      const max = body.maxOrderQty as number | undefined;
      if (min !== undefined && max !== undefined && min > max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "minOrderQty cannot be greater than maxOrderQty",
          path: ["minOrderQty"],
        });
      }
    }),
});