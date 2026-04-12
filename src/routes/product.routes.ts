// routes/product.routes.ts
import express from "express";
import {
  createProduct,
  updateProduct,
  getProducts,
  getProductByIdForAdmin,
  deleteProduct,
  getPublicProducts,
  getProductById,
  addBatch,
  getExpiringBatches,
  getDealOfTheDay,
} from "../controllers/product.controller";
import { protect, adminOnly } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { createProductSchema, addBatchSchema } from "../validators/product.validator";
import { idParamSchema } from "../validators/common";
import { checkPermission } from "../middlewares/checkPermission.middleware";
import { checkModule } from "../middlewares/checkModule.middleware";
import { ORG_MODULES } from "../constants/modules";

const router = express.Router();

router.get("/public", asyncHandler(getPublicProducts));
router.get("/deal-of-the-day", asyncHandler(getDealOfTheDay));
router.get("/public/:id", validate(idParamSchema), asyncHandler(getProductById));

router.post(
  "/",
  protect,
  checkModule(ORG_MODULES.PRODUCT),
  checkPermission("product.create"),
  upload.single("image"),
  validate(createProductSchema),
  asyncHandler(createProduct)
);
router.patch(
  "/:id",
  protect,
  checkModule(ORG_MODULES.PRODUCT),
  adminOnly,
  upload.single("image"),
  asyncHandler(updateProduct)
);
router.get("/", protect, checkModule(ORG_MODULES.PRODUCT), adminOnly, asyncHandler(getProducts));
router.get(
  "/expiring",
  protect,
  checkModule(ORG_MODULES.PRODUCT),
  adminOnly,
  asyncHandler(getExpiringBatches)
);
router.get(
  "/:id",
  protect,
  checkModule(ORG_MODULES.PRODUCT),
  adminOnly,
  validate(idParamSchema),
  asyncHandler(getProductByIdForAdmin)
);
router.delete(
  "/:id",
  protect,
  checkModule(ORG_MODULES.PRODUCT),
  adminOnly,
  validate(idParamSchema),
  asyncHandler(deleteProduct)
);
router.post(
  "/:id/add-batch",
  protect,
  checkModule(ORG_MODULES.PRODUCT),
  adminOnly,
  validate(addBatchSchema),
  asyncHandler(addBatch)
);

export default router;