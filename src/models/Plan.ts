import mongoose, { Schema, Document } from "mongoose";
import { ORG_MODULE_KEYS } from "../constants/modules";

export interface IPlan extends Document {
  name: string;
  price: number;
  modules: string[];
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const planSchema = new Schema<IPlan>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    price: { type: Number, required: true, min: 0 },
    modules: {
      type: [String],
      enum: ORG_MODULE_KEYS,
      default: [],
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

planSchema.index({ isActive: 1, name: 1 });

export default mongoose.model<IPlan>("Plan", planSchema);

