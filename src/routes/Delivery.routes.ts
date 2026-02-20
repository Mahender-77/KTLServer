import express from "express";
import { protect } from "../middlewares/auth.middleware";
import {
  getDeliveryOrders,
  acceptOrder,
  startDelivery,
  completeDelivery,
  updateLocation,
  getOrderTracking,
} from "../controllers/delivery.controller";

const router = express.Router();

// Protected routes - require authentication
router.use(protect);

router.get("/orders", getDeliveryOrders); // GET    /api/delivery/orders
router.post("/orders/:id/accept", acceptOrder); // POST   /api/delivery/orders/:id/accept
router.post("/orders/:id/start-delivery", startDelivery); // POST   /api/delivery/orders/:id/start-delivery
router.post("/orders/:id/complete", completeDelivery); // POST   /api/delivery/orders/:id/complete
router.post("/location", updateLocation); // POST   /api/delivery/location

export default router;

