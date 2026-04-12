import mongoose, { Schema, Document } from "mongoose";

/**
 * Denormalized stock rollup per product (sum of all batch quantities in base units).
 * @see REQ-17 — kept in sync from `Product.inventoryBatches` on order placement and add-batch.
 */
export interface IInventory extends Document {
  organizationId: mongoose.Types.ObjectId;
  productId: mongoose.Types.ObjectId;
  quantity: number;
  lowStockThreshold: number;
  lastUpdated: Date;
}

const inventorySchema = new Schema<IInventory>(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    lowStockThreshold: { type: Number, min: 0, default: 0 },
    lastUpdated: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false }
);

inventorySchema.index({ organizationId: 1, productId: 1 }, { unique: true });
inventorySchema.index({ organizationId: 1, quantity: 1 });

export default mongoose.model<IInventory>("Inventory", inventorySchema);
