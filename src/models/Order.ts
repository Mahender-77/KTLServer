import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  },
  variant: {
    type: mongoose.Schema.Types.ObjectId,
  },
  quantity: Number,
  price: Number,
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    items: [orderItemSchema],

    totalAmount: Number,

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    orderStatus: {
      type: String,
      enum: ["placed", "shipped", "delivered", "cancelled"],
      default: "placed",
    },

    deliveryPerson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    deliveryStatus: {
      type: String,
      enum: ["assigned", "accepted", "in-transit", "delivered"],
      default: null,
    },

    deliveryPersonLocation: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      lastUpdated: { type: Date, default: null },
    },

    address: {
      type: Object,
    },

    // Reference to SubOrders (category-wise split)
    subOrders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SubOrder",
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
