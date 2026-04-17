import { logger } from './utils/logger.js';
import { assertJwtSecrets, getPort, getListenHost } from "./config/env.js";
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

app.use((req, _res, next) => {
  logger.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use(helmet());
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));
// Prevent NoSQL Injection.
// express-mongo-sanitize assigns to req.query/req.body internally, which breaks under Express 5
// where some request properties (like req.query) may be getter-only.
//
// We sanitize in-place without reassigning the property references.
app.use((req, _res, next) => {
  // Only run when the respective object exists.
  if (req.body) mongoSanitize.sanitize(req.body as any);
  if (req.params) mongoSanitize.sanitize(req.params as any);
  if (req.headers) mongoSanitize.sanitize(req.headers as any);
  if (req.query) mongoSanitize.sanitize(req.query as any);
  next();
});

app.use(csrfProtection);

app.use("/api", generalApiLimiter);

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
app.use("/uploads", express.static("uploads"));

app.get("/", (_req, res) => {
  res.json({ message: "🚀 Server running successfully" });
});

app.use(errorHandler);

const PORT = getPort();
const HOST = getListenHost();

const startServer = async () => {
  await connectDB();
  startSubscriptionExpiryScheduler();

  app.listen(Number(PORT), HOST, () => {
    logger.log("====================================");
    logger.log(`🚀 Server listening on ${HOST}:${PORT}`);
    logger.log("====================================");
  });
};

startServer();
