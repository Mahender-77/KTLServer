import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import categoryRoutes from "./routes/category.routes";
import productRoutes from "./routes/product.routes";
import storeRoutes from "./routes/store.routes";
import cartRoutes from "./routes/Cart.routes";
import orderRoutes from "./routes/Order.routes";
import addressRoutes from "./routes/Address.routes";
import deliveryRoutes from "./routes/Delivery.routes";
import wishlistRoutes from "./routes/Wishlist.routes";
import { getOrderTracking } from "./controllers/delivery.controller";

import { connectDB } from "./config/db";

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/stores", storeRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/wishlist", wishlistRoutes);
// Public tracking endpoint (no auth required for customers to track orders)
app.get("/api/delivery/orders/:id/tracking", getOrderTracking);
app.use("/uploads", express.static("uploads"));

// Health check
app.get("/", (_req, res) => {
  res.json({ message: "🚀 Server running successfully" });
});

const PORT = process.env.PORT || 5000;

// Start server only after DB connects
const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log("====================================");
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log("====================================");
  });
};

startServer();
