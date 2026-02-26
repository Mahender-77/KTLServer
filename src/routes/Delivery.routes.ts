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
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { idParamSchema } from "../validators/common";

const router = express.Router();

router.use(protect);

router.get("/suborders", asyncHandler(getDeliverySubOrders));
router.post("/suborders/:id/accept", validate(idParamSchema), asyncHandler(acceptSubOrder));
router.post("/suborders/:id/start-delivery", validate(idParamSchema), asyncHandler(startSubOrderDelivery));
router.post("/suborders/:id/complete", validate(idParamSchema), asyncHandler(completeSubOrderDelivery));
router.get("/suborders/:id/tracking", validate(idParamSchema), asyncHandler(getSubOrderTracking));
router.post("/location", asyncHandler(updateLocation));
router.get("/orders/:id/tracking", validate(idParamSchema), asyncHandler(getOrderTracking));

export default router;

