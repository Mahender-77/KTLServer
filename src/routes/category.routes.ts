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
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { idParamSchema, parentIdParamSchemaForRoute } from "../validators/common";

const router = express.Router();

router.get("/", asyncHandler(getCategories));
router.get("/:parentId/subcategories", validate(parentIdParamSchemaForRoute), asyncHandler(getSubCategories));

router.post("/", protect, adminOnly, asyncHandler(createCategory));
router.delete("/:id", protect, adminOnly, validate(idParamSchema), asyncHandler(deleteCategory));

router.get("/flat", protect, adminOnly, asyncHandler(getFlatCategories));
router.get("/subcategories/:parentId", protect, adminOnly, validate(parentIdParamSchemaForRoute), asyncHandler(getSubCategories));
router.get("/:id", protect, adminOnly, validate(idParamSchema), asyncHandler(getCategoryById));


export default router;
