// server/routes/Order.routes.ts
import express from "express";
import { protect, adminOnly } from "../middlewares/auth.middleware";
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

router.post("/", validate(createOrderSchema), asyncHandler(createOrder));
router.get("/", asyncHandler(getOrders));
router.get("/admin/all", adminOnly, asyncHandler(getOrdersForAdmin));
router.get("/admin/:id", adminOnly, validate(idParamSchema), asyncHandler(getOrderByIdForAdmin));
router.get("/:id", validate(idParamSchema), asyncHandler(getOrderById));

export default router;

