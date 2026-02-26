import mongoose from "mongoose";

const storeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    address: String,
    city: String,
    location: {
      lat: Number,
      lng: Number,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

storeSchema.index({ createdAt: -1 });

export default mongoose.model("Store", storeSchema);
