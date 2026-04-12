import mongoose from "mongoose";

const storeSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    address: String,
    city: String,
    location: {
      lat: Number,
      lng: Number,
    },
    // Delivery fee in ₹ for orders fulfilled from this store
    deliveryFee: { type: Number, min: 0, default: 40 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

storeSchema.index({ organizationId: 1, createdAt: -1 });

export default mongoose.model("Store", storeSchema);
