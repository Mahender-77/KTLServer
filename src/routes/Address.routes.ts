import express from "express";
import { protect } from "../middlewares/auth.middleware";
import {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
} from "../controllers/address.controller";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { idParamSchema } from "../validators/common";

const router = express.Router();

router.use(protect);

router.get("/", asyncHandler(getAddresses));
router.post("/", asyncHandler(createAddress));
router.put("/:id", validate(idParamSchema), asyncHandler(updateAddress));
router.delete("/:id", validate(idParamSchema), asyncHandler(deleteAddress));

export default router;

