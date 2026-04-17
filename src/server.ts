import { logger } from './utils/logger.js';
import { assertJwtSecrets, getPort } from "./config/env.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import authRoutes from "./routes/auth.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import productRoutes from "./routes/product.routes.js";
import storeRoutes from "./routes/store.routes.js";
import cartRoutes from "./routes/Cart.routes.js";
import orderRoutes from "./routes/Order.routes.js";
import addressRoutes from "./routes/Address.routes.js";
import deliveryRoutes from "./routes/Delivery.routes.js";
import wishlistRoutes from "./routes/Wishlist.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import superAdminRoutes from "./routes/superAdmin.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import domainAuditRoutes from "./routes/domainAudit.routes.js";
import pushTokenRoutes from "./routes/pushToken.routes.js";

import { connectDB } from "./config/db.js";
import { corsOptions } from "./config/cors.js";
import mongoSanitize from "express-mongo-sanitize";
import { generalApiLimiter } from "./middlewares/rateLimit.middleware.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";
import { startSubscriptionExpiryScheduler } from "./schedulers/subscriptionExpiry.scheduler.js";
import cookieParser from "cookie-parser";
import { csrfProtection } from "./middlewares/csrf.middleware.js";

assertJwtSecrets();

const app = express();

// Logging middleware
app.use((req, _res, next) => {
  logger.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Security middlewares
app.use(helmet());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));

// Mongo sanitize (safe version)
app.use((req, _res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body as any);
  if (req.params) mongoSanitize.sanitize(req.params as any);
  if (req.headers) mongoSanitize.sanitize(req.headers as any);
  if (req.query) mongoSanitize.sanitize(req.query as any);
  next();
});

// CSRF
app.use(csrfProtection);

// Rate limiting
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
app.use("/api/admin", adminRoutes);
app.use("/api/super-admin", superAdminRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/audit-entries", domainAuditRoutes);
app.use("/api/push", pushTokenRoutes);

// Static uploads
app.use("/uploads", express.static("uploads"));

// Health check
app.get("/", (_req, res) => {
  res.json({ message: "🚀 Server running successfully" });
});

// Error handler
app.use(errorHandler);

// PORT (Render provides this)
const PORT = getPort();

// Start server
const startServer = async () => {
  try {
    await connectDB();
    startSubscriptionExpiryScheduler();

    app.listen(PORT, () => {
      logger.log("====================================");
      logger.log(`🚀 Server running on port ${PORT}`);
      logger.log("====================================");
    });
  } catch (error) {
    logger.error("❌ Server failed to start", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
};

startServer();