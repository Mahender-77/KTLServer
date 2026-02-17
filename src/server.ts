import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.routes";
import categoryRoutes from "./routes/category.routes";
import productRoutes from "./routes/product.routes";
import storeRoutes from "./routes/store.routes";

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
