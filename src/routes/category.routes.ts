import express from "express";
import {
 createCategory,
  getCategories,
  getFlatCategories,
  getSubCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../controllers/category.controller";
import { protect, adminOnly } from "../middlewares/auth.middleware";

const router = express.Router();

// ✅ PUBLIC ROUTE
router.get("/", getCategories);
router.get("/:parentId/subcategories", getSubCategories);

// 🔒 ADMIN ROUTES
router.post("/", protect, adminOnly, createCategory);
// router.put("/:id", protect, adminOnly, updateCategory);
router.delete("/:id", protect, adminOnly, deleteCategory);

// Additional routes
router.get("/flat", protect, adminOnly, getFlatCategories);
router.get("/subcategories/:parentId", protect, adminOnly, getSubCategories);
router.get("/:id", protect, adminOnly, getCategoryById);


export default router;
