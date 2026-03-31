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
import { connectDB } from "./config/db";
import { corsOptions } from "./config/cors";
import { generalApiLimiter } from "./middlewares/rateLimit.middleware";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import { startSubscriptionExpiryScheduler } from "./schedulers/subscriptionExpiry.scheduler";

assertJwtSecrets();

const app = express();

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "100kb" }));

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
    console.log("====================================");
    console.log(`🚀 Server listening on ${HOST}:${PORT}`);
    console.log("====================================");
  });
};

startServer();
