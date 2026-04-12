// server/routes/Order.routes.ts
import express from "express";
import { protect, adminOnly } from "../middlewares/auth.middleware";
import { deliveryOnly } from "../middlewares/requireRole.middleware";
import { checkPermission } from "../middlewares/checkPermission.middleware";
import { checkModule } from "../middlewares/checkModule.middleware";
import { ORG_MODULES } from "../constants/modules";
import {
  createOrder,
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
} from "../controllers/order.controller";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { createOrderSchema, updateOrderStatusSchema } from "../validators/order.validator";
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
  "/admin/:id/tracking",
  adminOnly,
  checkPermission("order.manage"),
  validate(idParamSchema),
  asyncHandler(getOrderTrackingForAdmin)
);
router.get(
  "/admin/:id",
  adminOnly,
  checkPermission("order.manage"),
  validate(idParamSchema),
  asyncHandler(getOrderByIdForAdmin)
);
router.patch(
  "/:id/status",
  adminOnly,
  checkPermission("order.manage"),
  validate(idParamSchema),
  validate(updateOrderStatusSchema),
  asyncHandler(updateOrderStatus)
);
router.get("/available", deliveryOnly, asyncHandler(getAvailableOrders));
router.get("/my-deliveries", deliveryOnly, asyncHandler(getMyDeliveries));
router.post("/:id/accept", deliveryOnly, validate(idParamSchema), asyncHandler(acceptOrderForDelivery));
router.post("/:id/reject", deliveryOnly, validate(idParamSchema), asyncHandler(rejectOrderForDelivery));
router.post("/:id/pickup", deliveryOnly, validate(idParamSchema), asyncHandler(markOrderPickedUp));
router.post("/:id/send-otp", deliveryOnly, validate(idParamSchema), asyncHandler(sendDeliveryOtp));
router.post("/:id/confirm-delivery", deliveryOnly, validate(idParamSchema), asyncHandler(confirmOrderDelivery));
router.get(
  "/:id",
  checkPermission("order.manage"),
  validate(idParamSchema),
  asyncHandler(getOrderById)
);

export default router;

