// server/routes/Order.routes.ts
import express from "express";
import { protect, adminOnly } from "../middlewares/auth.middleware.js";
import { deliveryOnly } from "../middlewares/requireRole.middleware.js";
import { checkPermission } from "../middlewares/checkPermission.middleware.js";
import { checkModule } from "../middlewares/checkModule.middleware.js";
import { ORG_MODULES } from "../constants/modules.js";
import {
  createOrder,
  getMyOrders,
  getOrders,
  getOrderById,
  getOrdersForAdmin,
  getOrderByIdForAdmin,
  getOrderTrackingForAdmin,
  updateOrderStatus,
  getAvailableOrders,
  acceptOrderForDelivery,
  rejectOrderForDelivery,
  getMyDeliveries,
  markOrderPickedUp,
  sendDeliveryOtp,
  confirmOrderDelivery,
} from "../controllers/order.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createOrderSchema, updateOrderStatusSchema } from "../validators/order.validator.js";
import { idParamSchema } from "../validators/common.js";

const router = express.Router();

router.use(protect);

router.post(
  "/",
  validate(createOrderSchema),
  asyncHandler(createOrder)
);
router.get("/my", asyncHandler(getMyOrders));
router.get("/", checkModule(ORG_MODULES.ORDER), checkPermission("order.manage"), asyncHandler(getOrders));
router.get(
  "/admin/all",
  adminOnly,
  checkModule(ORG_MODULES.ORDER),
  checkPermission("order.manage"),
  asyncHandler(getOrdersForAdmin)
);
router.get(
  "/admin/:id/tracking",
  adminOnly,
  checkModule(ORG_MODULES.ORDER),
  checkPermission("order.manage"),
  validate(idParamSchema),
  asyncHandler(getOrderTrackingForAdmin)
);
router.get(
  "/admin/:id",
  adminOnly,
  checkModule(ORG_MODULES.ORDER),
  checkPermission("order.manage"),
  validate(idParamSchema),
  asyncHandler(getOrderByIdForAdmin)
);
router.patch(
  "/:id/status",
  adminOnly,
  checkModule(ORG_MODULES.ORDER),
  checkPermission("order.manage"),
  validate(idParamSchema),
  validate(updateOrderStatusSchema),
  asyncHandler(updateOrderStatus)
);
router.get("/available", checkModule(ORG_MODULES.DELIVERY), deliveryOnly, asyncHandler(getAvailableOrders));
router.get("/my-deliveries", checkModule(ORG_MODULES.DELIVERY), deliveryOnly, asyncHandler(getMyDeliveries));
router.post("/:id/accept", checkModule(ORG_MODULES.DELIVERY), deliveryOnly, validate(idParamSchema), asyncHandler(acceptOrderForDelivery));
router.post("/:id/reject", checkModule(ORG_MODULES.DELIVERY), deliveryOnly, validate(idParamSchema), asyncHandler(rejectOrderForDelivery));
router.post("/:id/pickup", checkModule(ORG_MODULES.DELIVERY), deliveryOnly, validate(idParamSchema), asyncHandler(markOrderPickedUp));
router.post("/:id/send-otp", checkModule(ORG_MODULES.DELIVERY), deliveryOnly, validate(idParamSchema), asyncHandler(sendDeliveryOtp));
router.post("/:id/confirm-delivery", checkModule(ORG_MODULES.DELIVERY), deliveryOnly, validate(idParamSchema), asyncHandler(confirmOrderDelivery));
router.get(
  "/:id",
  checkModule(ORG_MODULES.ORDER),
  checkPermission("order.manage"),
  validate(idParamSchema),
  asyncHandler(getOrderById)
);

export default router;

