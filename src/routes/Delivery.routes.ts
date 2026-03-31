import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { deliveryOnly } from "../middlewares/requireRole.middleware";
import { checkModule } from "../middlewares/checkModule.middleware";
import { ORG_MODULES } from "../constants/modules";
import {
  getDeliverySubOrders,
  acceptSubOrder,
  startSubOrderDelivery,
  completeSubOrderDelivery,
  updateLocation,
  getSubOrderTracking,
  getOrderTracking,
} from "../controllers/delivery.controller";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { idParamSchema } from "../validators/common";

const router = express.Router();

router.use(protect);
router.use(checkModule(ORG_MODULES.DELIVERY));

/** Tracking: ownership / admin / assigned courier enforced in services (IDOR-safe). */
router.get("/orders/:id/tracking", validate(idParamSchema), asyncHandler(getOrderTracking));
router.get("/suborders/:id/tracking", validate(idParamSchema), asyncHandler(getSubOrderTracking));

/** Courier-only: list jobs, accept, status transitions, location pings. */
router.use(deliveryOnly);

router.get("/suborders", asyncHandler(getDeliverySubOrders));
router.post("/suborders/:id/accept", validate(idParamSchema), asyncHandler(acceptSubOrder));
router.post("/suborders/:id/start-delivery", validate(idParamSchema), asyncHandler(startSubOrderDelivery));
router.post("/suborders/:id/complete", validate(idParamSchema), asyncHandler(completeSubOrderDelivery));
router.post("/location", asyncHandler(updateLocation));

export default router;

