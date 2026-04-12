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
import { protect } from "../middlewares/auth.middleware";
import { checkModule } from "../middlewares/checkModule.middleware";
import { checkPermission } from "../middlewares/checkPermission.middleware";
import { ORG_MODULES } from "../constants/modules";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { idParamSchema, parentIdParamSchemaForRoute } from "../validators/common";

const router = express.Router();

router.get("/", asyncHandler(getCategories));
router.get(
  "/:parentId/subcategories",
  validate(parentIdParamSchemaForRoute),
  asyncHandler(getSubCategories)
);

router.post(
  "/",
  protect,
  checkModule(ORG_MODULES.CATEGORY),
  checkPermission("category.manage"),
  asyncHandler(createCategory)
);
router.patch(
  "/:id",
  protect,
  checkModule(ORG_MODULES.CATEGORY),
  checkPermission("category.manage"),
  validate(idParamSchema),
  asyncHandler(updateCategory)
);
router.delete(
  "/:id",
  protect,
  checkModule(ORG_MODULES.CATEGORY),
  checkPermission("category.manage"),
  validate(idParamSchema),
  asyncHandler(deleteCategory)
);

router.get(
  "/flat",
  protect,
  checkModule(ORG_MODULES.CATEGORY),
  checkPermission("category.manage"),
  asyncHandler(getFlatCategories)
);
router.get(
  "/subcategories/:parentId",
  protect,
  checkModule(ORG_MODULES.CATEGORY),
  checkPermission("category.manage"),
  validate(parentIdParamSchemaForRoute),
  asyncHandler(getSubCategories)
);
router.get(
  "/:id",
  protect,
  checkModule(ORG_MODULES.CATEGORY),
  checkPermission("category.manage"),
  validate(idParamSchema),
  asyncHandler(getCategoryById)
);

export default router;
