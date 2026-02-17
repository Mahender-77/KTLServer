import mongoose, { Schema, Document } from "mongoose";

export interface IVariant {
  _id?: mongoose.Types.ObjectId;
  type: "weight" | "pieces" | "box";
  value: number;
  unit: "g" | "kg" | "ml" | "l" | "pcs" | "box";
  price: number;
  offerPrice?: number;
  sku?: string;
}

export interface IInventory {
  store: mongoose.Types.ObjectId;
  variant: mongoose.Types.ObjectId;
  quantity: number;
}

export interface IProduct extends Document {
  name: string;
  slug: string;
  description?: string;
  category: mongoose.Types.ObjectId;
  images: string[];
  variants: IVariant[];
  inventory: IInventory[];
  isActive: boolean;
}

const variantSchema = new Schema<IVariant>({
  type: {
    type: String,
    enum: ["weight", "pieces", "box"],
    required: true,
  },
  value: { type: Number, required: true },
  unit: {
    type: String,
    enum: ["g", "kg", "ml", "l", "pcs", "box"],
    required: true,
  },
  price: { type: Number, required: true },
  offerPrice: Number,
  sku: String,
});

const inventorySchema = new Schema<IInventory>({
  store: {
    type: Schema.Types.ObjectId,
    ref: "Store",
    required: true,
  },
  variant: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  quantity: {
    type: Number,
    default: 0,
  },
});

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true },
    slug: { type: String, unique: true },
    description: String,
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    images: [String],
    variants: [variantSchema],
    inventory: [inventorySchema],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model<IProduct>("Product", productSchema);
