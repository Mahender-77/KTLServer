import express from "express";
import cors from "cors";
import helmet from "helmet";
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
import { connectDB } from "./config/db";
import { corsOptions } from "./config/cors";
import { generalApiLimiter } from "./middlewares/rateLimit.middleware";
import { errorHandler } from "./middlewares/errorHandler.middleware";

dotenv.config();

// Fail fast if JWT secrets are missing (prevents weak or default signing)
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error("Fatal: JWT_SECRET must be set and at least 16 characters.");
  process.exit(1);
}
if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 16) {
  console.error("Fatal: JWT_REFRESH_SECRET must be set and at least 16 characters.");
  process.exit(1);
}

const app = express();

// Log every request so you can confirm the backend is being hit (remove in production if desired)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Security and body parsing (order preserved)
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "100kb" }));

// Rate limiting: general limit for all /api (applied first, then route-specific limiters)
app.use("/api", generalApiLimiter);

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
app.use("/uploads", express.static("uploads"));

// Health check
app.get("/", (_req, res) => {
  res.json({ message: "🚀 Server running successfully" });
});

// Centralized error handling (must be after all routes)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0"; // Listen on all interfaces so phone/other devices can reach this machine

// Start server only after DB connects
const startServer = async () => {
  await connectDB();

  app.listen(Number(PORT), HOST, () => {
    console.log("====================================");
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌐 Local:   http://localhost:${PORT}`);
    console.log(`🌐 Network: http://<YOUR_IP>:${PORT}  (use your PC's IP for admin/Expo)`);
    console.log("====================================");
  });
};

startServer();
