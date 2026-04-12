import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { checkPermission } from "../middlewares/checkPermission.middleware";
import { checkModule } from "../middlewares/checkModule.middleware";
import { ORG_MODULES } from "../constants/modules";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { listInventory, patchInventoryThreshold } from "../controllers/inventory.controller";
import { patchInventoryThresholdSchema } from "../validators/inventory.validator";

const router = express.Router();

router.use(protect);
router.use(checkModule(ORG_MODULES.INVENTORY));

router.get("/", checkPermission("inventory.view"), asyncHandler(listInventory));
router.patch(
  "/products/:productId/threshold",
  checkPermission("inventory.update"),
  validate(patchInventoryThresholdSchema),
  asyncHandler(patchInventoryThreshold)
);

export default router;
