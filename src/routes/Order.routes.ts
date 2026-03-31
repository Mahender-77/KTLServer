// server/routes/Order.routes.ts
import express from "express";
import { protect, adminOnly } from "../middlewares/auth.middleware";
import { checkPermission } from "../middlewares/checkPermission.middleware";
import { checkModule } from "../middlewares/checkModule.middleware";
import { ORG_MODULES } from "../constants/modules";
import {
  createOrder,
  getOrders,
  getOrderById,
  getOrdersForAdmin,
  getOrderByIdForAdmin,
} from "../controllers/order.controller";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { createOrderSchema } from "../validators/order.validator";
import { idParamSchema } from "../validators/common";

const router = express.Router();

router.use(protect);
router.use(checkModule(ORG_MODULES.ORDER));

router.post(
  "/",
  checkPermission("order.manage"),
  validate(createOrderSchema),
  asyncHandler(createOrder)
);
router.get("/", checkPermission("order.manage"), asyncHandler(getOrders));
router.get(
  "/admin/all",
  adminOnly,
  checkPermission("order.manage"),
  asyncHandler(getOrdersForAdmin)
);
router.get(
  "/admin/:id",
  adminOnly,
  checkPermission("order.manage"),
  validate(idParamSchema),
  asyncHandler(getOrderByIdForAdmin)
);
router.get(
  "/:id",
  checkPermission("order.manage"),
  validate(idParamSchema),
  asyncHandler(getOrderById)
);

export default router;

