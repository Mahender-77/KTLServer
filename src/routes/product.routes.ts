// routes/product.routes.ts
import express from "express";
import {
  createProduct,
  getProducts,
  deleteProduct,
  getPublicProducts,
  getProductById,          // ← add this import
} from "../controllers/product.controller";
import { protect, adminOnly } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";

const router = express.Router();

// ── Public routes ─────────────────────────────────────────────────────────────
router.get("/public", getPublicProducts);
router.get("/public/:id", getProductById);   // ← NEW: single product by id

// ── Admin routes ──────────────────────────────────────────────────────────────
router.post("/", protect, adminOnly, upload.single("image"), createProduct);
router.get("/", protect, adminOnly, getProducts);
router.delete("/:id", protect, adminOnly, deleteProduct);

export default router;