import mongoose, { Schema, Document } from "mongoose";

// ─── Sub-document Interfaces ─────────────────────────────────────────────────

export interface IVariant {
  _id?: mongoose.Types.ObjectId;
  type: "weight" | "pieces" | "box";
  value: number;
  unit: "g" | "kg" | "ml" | "l" | "pcs" | "box";
  price: number;
  offerPrice?: number;
  sku?: string;
}

export interface IInventoryBatch {
  _id?: mongoose.Types.ObjectId;
  store: mongoose.Types.ObjectId;
  /**
   * Required when product pricingMode === "fixed".
   * Points to the Variant._id this batch stock belongs to.
   */
  variant?: mongoose.Types.ObjectId;
  /**
   * Quantity always stored in product.baseUnit.
   * e.g. if baseUnit = "kg", quantity = 25.5 means 25.5 kg.
   */
  quantity: number;
  /** Required when product.hasExpiry === true. */
  manufacturingDate?: Date;
  /** Required when product.hasExpiry === true. */
  expiryDate?: Date;
  batchNumber: string;
  /** Purchase / landed cost per baseUnit. Used for margin analytics. */
  costPrice?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ─── Enums ────────────────────────────────────────────────────────────────────

export type PricingMode = "fixed" | "custom-weight" | "unit";
export type BaseUnit = "kg" | "g" | "ml" | "l" | "pcs";

// ─── Product Interface ────────────────────────────────────────────────────────

export interface IProduct extends Document {
  name: string;
  slug: string;
  description?: string;
  category: mongoose.Types.ObjectId;
  images: string[];

  // ── Pricing ──
  pricingMode: PricingMode;
  baseUnit: BaseUnit;
  pricePerUnit: number;

  // ── Expiry ──
  hasExpiry: boolean;
  /**
   * Hint for batch entry UI: typical shelf life in days.
   * Does NOT auto-set expiry. Min 1, Max 3650 (10 years).
   */
  shelfLifeDays?: number;

  // ── Variants (fixed pricing only) ──
  variants?: IVariant[];

  // ── Inventory ──
  inventoryBatches: IInventoryBatch[];

  // ── Discovery & Search ──
  /** Flexible labels e.g. ["organic", "imported", "seasonal"] */
  tags?: string[];

  // ── Order Constraints ──
  /** Minimum quantity a customer can order (in baseUnit). e.g. 0.25 for 250g minimum */
  minOrderQty?: number;
  /** Maximum quantity a customer can order per transaction (in baseUnit). */
  maxOrderQty?: number;

  // ── Tax ──
  /** GST / VAT percentage applied at checkout. e.g. 18 = 18% */
  taxRate?: number;

  isActive: boolean;
}

// ─── Sub-document Schemas ────────────────────────────────────────────────────

const variantSchema = new Schema<IVariant>({
  type: {
    type: String,
    enum: ["weight", "pieces", "box"],
    required: true,
  },
  value: { type: Number, required: true, min: 0 },
  unit: {
    type: String,
    enum: ["g", "kg", "ml", "l", "pcs", "box"],
    required: true,
  },
  price: { type: Number, required: true, min: 0 },
  offerPrice: { type: Number, min: 0, default: undefined },
  sku: { type: String, trim: true, default: undefined },
});

const inventoryBatchSchema = new Schema<IInventoryBatch>(
  {
    store: {
      type: Schema.Types.ObjectId,
      ref: "Store",
      required: true,
    },
    variant: {
      type: Schema.Types.ObjectId,
      required: function (this: mongoose.Types.Subdocument) {
        return (this.parent() as IProduct).pricingMode === "fixed";
      },
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    manufacturingDate: {
      type: Date,
      required: function (this: mongoose.Types.Subdocument) {
        return (this.parent() as IProduct).hasExpiry === true;
      },
    },
    expiryDate: {
      type: Date,
      required: function (this: mongoose.Types.Subdocument) {
        return (this.parent() as IProduct).hasExpiry === true;
      },
    },
    batchNumber: {
      type: String,
      required: true,
      trim: true,
    },
    costPrice: {
      type: Number,
      min: 0,
      default: undefined,
    },
  },
  { timestamps: true }
);

// ─── Product Schema ───────────────────────────────────────────────────────────

const productSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: undefined,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    images: {
      type: [String],
      default: [],
    },

    // ── Pricing ──
    pricingMode: {
      type: String,
      enum: ["fixed", "custom-weight", "unit"],
      required: true,
      default: "unit",
    },
    baseUnit: {
      type: String,
      enum: ["kg", "g", "ml", "l", "pcs"],
      required: true,
    },
    pricePerUnit: {
      type: Number,
      required: true,
      min: 0,
    },

    // ── Expiry ──
    hasExpiry: {
      type: Boolean,
      default: false,
    },
    shelfLifeDays: {
      type: Number,
      min: 1,
      max: 3650,
      default: undefined,
    },

    // ── Variants (fixed pricing only) ──
    variants: {
      type: [variantSchema],
      default: [],
      required: function (this: IProduct) {
        return this.pricingMode === "fixed";
      },
    },

    // ── Inventory ──
    inventoryBatches: {
      type: [inventoryBatchSchema],
      default: [],
    },

    // ── Discovery & Search ──
    tags: {
      type: [String],
      default: [],
    },

    // ── Order Constraints ──
    minOrderQty: {
      type: Number,
      min: 0,
      default: undefined,
    },
    maxOrderQty: {
      type: Number,
      min: 0,
      default: undefined,
    },

    // ── Tax ──
    taxRate: {
      type: Number,
      min: 0,
      max: 100,
      default: undefined,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ─── Validation: minOrderQty <= maxOrderQty ───────────────────────────────────

productSchema.pre("save", async function () {
  if (
    this.minOrderQty !== undefined &&
    this.maxOrderQty !== undefined &&
    this.minOrderQty > this.maxOrderQty
  ) {
    throw new Error("minOrderQty cannot be greater than maxOrderQty");
  }
});

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Product list: filter by active + category
productSchema.index({ isActive: 1, category: 1 });

// Product list: active only (no category filter)
productSchema.index({ isActive: 1 });

// Tag-based search / filtering
productSchema.index({ tags: 1 });

// FEFO / expiry alert queries
productSchema.index({ "inventoryBatches.expiryDate": 1 });

// Batch lookup by store (all pricing modes)
productSchema.index({ "inventoryBatches.store": 1 });

// Batch lookup by store + variant (fixed pricing mode)
productSchema.index({
  "inventoryBatches.store": 1,
  "inventoryBatches.variant": 1,
});

// Unique batch number per (store, variant) within a product
// variant is null/undefined for non-fixed pricing modes
productSchema.index(
  {
    "inventoryBatches.store": 1,
    "inventoryBatches.variant": 1,
    "inventoryBatches.batchNumber": 1,
  },
  { unique: true }
);

export default mongoose.model<IProduct>("Product", productSchema);