import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { createAdminSchema, createUserSchema } from "../validators/admin.validator";
import { createAdmin, createUser } from "../controllers/admin.controller";
import { checkPermission } from "../middlewares/checkPermission.middleware";

const router = express.Router();

router.post(
  "/create-admin",
  protect,
  checkPermission("user.create"),
  validate(createAdminSchema),
  asyncHandler(createAdmin)
);

router.post(
  "/create-user",
  protect,
  checkPermission("user.create"),
  validate(createUserSchema),
  asyncHandler(createUser)
);

export default router;
