import express from "express";
import { protect, adminOnly } from "../middlewares/auth.middleware";
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

router.post("/", protect, adminOnly, asyncHandler(createStore));
router.get("/", protect, adminOnly, asyncHandler(getStores));
router.get("/public", asyncHandler(getPublicStores));
router.patch("/:id", protect, adminOnly, validate(idParamSchema), asyncHandler(updateStore));
router.delete("/:id", protect, adminOnly, validate(idParamSchema), asyncHandler(deleteStore));

export default router;
