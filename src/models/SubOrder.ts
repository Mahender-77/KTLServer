import mongoose, { Schema, Document } from "mongoose";

export interface ISubOrderItem {
  product: mongoose.Types.ObjectId;
  variant: mongoose.Types.ObjectId;
  quantity: number;
  price: number;
}

export interface ISubOrder extends Document {
  order: mongoose.Types.ObjectId;
  category: mongoose.Types.ObjectId;
  categoryName: string;
  items: ISubOrderItem[];
  totalAmount: number;
  deliveryStatus: "pending" | "accepted" | "out_for_delivery" | "delivered";
  deliveryBoyId: mongoose.Types.ObjectId | null;
  deliveryPersonLocation?: {
    latitude: number | null;
    longitude: number | null;
    lastUpdated: Date | null;
  };
  createdAt: Date;
  updatedAt: Date;
}

const subOrderItemSchema = new Schema<ISubOrderItem>({
  product: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  variant: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
});

const subOrderSchema = new Schema<ISubOrder>(
  {
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    categoryName: {
      type: String,
      required: true,
    },
    items: [subOrderItemSchema],
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveryStatus: {
      type: String,
      enum: ["pending", "accepted", "out_for_delivery", "delivered"],
      default: "pending",
      index: true,
    },
    deliveryBoyId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    deliveryPersonLocation: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      lastUpdated: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// Compound index for efficient queries
subOrderSchema.index({ order: 1, category: 1 });
subOrderSchema.index({ deliveryStatus: 1, deliveryBoyId: 1 });

export default mongoose.model<ISubOrder>("SubOrder", subOrderSchema);

