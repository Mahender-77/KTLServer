// server/routes/Order.routes.ts
import express from "express";
import { protect } from "../middlewares/auth.middleware";
import {
  createOrder,
  getOrders,
  getOrderById,
} from "../controllers/order.controller";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { createOrderSchema } from "../validators/order.validator";
import { idParamSchema } from "../validators/common";

const router = express.Router();

router.use(protect);

router.post("/", validate(createOrderSchema), asyncHandler(createOrder));
router.get("/", asyncHandler(getOrders));
router.get("/:id", validate(idParamSchema), asyncHandler(getOrderById));

export default router;

