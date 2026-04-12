import { logger } from './utils/logger';
import { assertJwtSecrets, getPort, getListenHost } from "./config/env";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes";
import categoryRoutes from "./routes/category.routes";
import productRoutes from "./routes/product.routes";
import storeRoutes from "./routes/store.routes";
import cartRoutes from "./routes/Cart.routes";
import orderRoutes from "./routes/Order.routes";
import addressRoutes from "./routes/Address.routes";
import deliveryRoutes from "./routes/Delivery.routes";
import wishlistRoutes from "./routes/Wishlist.routes";
import adminRoutes from "./routes/admin.routes";
import superAdminRoutes from "./routes/superAdmin.routes";
import auditRoutes from "./routes/audit.routes";
import inventoryRoutes from "./routes/inventory.routes";
import domainAuditRoutes from "./routes/domainAudit.routes";
import pushTokenRoutes from "./routes/pushToken.routes";
import { connectDB } from "./config/db";
import { corsOptions } from "./config/cors";
import mongoSanitize from "express-mongo-sanitize";
import { generalApiLimiter } from "./middlewares/rateLimit.middleware";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import { startSubscriptionExpiryScheduler } from "./schedulers/subscriptionExpiry.scheduler";
import cookieParser from "cookie-parser";
import { csrfProtection } from "./middlewares/csrf.middleware";

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
