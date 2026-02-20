// server/routes/Order.routes.ts
import express from "express";
import { protect } from "../middlewares/auth.middleware";
import {
  createOrder,
  getOrders,
  getOrderById,
} from "../controllers/order.controller";

const router = express.Router();

// All order routes are protected — user must be logged in
router.use(protect);

router.post("/", createOrder); // POST   /api/orders
router.get("/", getOrders); // GET    /api/orders
router.get("/:id", getOrderById); // GET    /api/orders/:id

export default router;

