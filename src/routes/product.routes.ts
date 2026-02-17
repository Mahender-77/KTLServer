import express from "express";
import {
  createProduct,
  getProducts,
  deleteProduct,
  getPublicProducts,
} from "../controllers/product.controller";
import { protect, adminOnly } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";
import { getSubCategories } from "../controllers/category.controller";

const router = express.Router();

// Add logging middleware
router.post(
  "/",

  protect,

  adminOnly,

  upload.single("image"),

  createProduct,
);
// Public subcategory route

router.get("/public", getPublicProducts);
router.get("/", protect, adminOnly, getProducts);
router.delete("/:id", protect, adminOnly, deleteProduct);

export default router;
