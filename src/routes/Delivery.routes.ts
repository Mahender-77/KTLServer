import express from "express";
import { protect } from "../middlewares/auth.middleware";
import {
  getDeliverySubOrders,
  acceptSubOrder,
  startSubOrderDelivery,
  completeSubOrderDelivery,
  updateLocation,
  getSubOrderTracking,
  getOrderTracking,
} from "../controllers/delivery.controller";

const router = express.Router();

// Protected routes - require authentication
router.use(protect);

// SubOrder routes (new category-based delivery system)
router.get("/suborders", getDeliverySubOrders); // GET    /api/delivery/suborders
router.post("/suborders/:id/accept", acceptSubOrder); // POST   /api/delivery/suborders/:id/accept
router.post("/suborders/:id/start-delivery", startSubOrderDelivery); // POST   /api/delivery/suborders/:id/start-delivery
router.post("/suborders/:id/complete", completeSubOrderDelivery); // POST   /api/delivery/suborders/:id/complete
router.get("/suborders/:id/tracking", getSubOrderTracking); // GET    /api/delivery/suborders/:id/tracking

// Location update
router.post("/location", updateLocation); // POST   /api/delivery/location

// Legacy order tracking (for backward compatibility)
router.get("/orders/:id/tracking", getOrderTracking); // GET    /api/delivery/orders/:id/tracking

export default router;

