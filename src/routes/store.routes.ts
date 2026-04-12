import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { checkModule } from "../middlewares/checkModule.middleware";
import { checkPermission } from "../middlewares/checkPermission.middleware";
import { ORG_MODULES } from "../constants/modules";
import {
  createStore,
  getStores,
  getPublicStores,
  updateStore,
  deleteStore,
} from "../controllers/store.controller";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { idParamSchema } from "../validators/common";

const router = express.Router();

router.post(
  "/",
  protect,
  checkModule(ORG_MODULES.STORE),
  checkPermission("store.manage"),
  asyncHandler(createStore)
);
router.get(
  "/",
  protect,
  checkModule(ORG_MODULES.STORE),
  checkPermission("store.manage"),
  asyncHandler(getStores)
);
router.get("/public", asyncHandler(getPublicStores));
router.patch(
  "/:id",
  protect,
  checkModule(ORG_MODULES.STORE),
  checkPermission("store.manage"),
  validate(idParamSchema),
  asyncHandler(updateStore)
);
router.delete(
  "/:id",
  protect,
  checkModule(ORG_MODULES.STORE),
  checkPermission("store.manage"),
  validate(idParamSchema),
  asyncHandler(deleteStore)
);

export default router;
