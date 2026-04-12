import express from "express";
import { protect } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import { registerToken, unregisterToken } from "../controllers/pushToken.controller";
import { registerPushTokenSchema, unregisterPushTokenSchema } from "../validators/pushToken.validator";

const router = express.Router();

router.post("/token", protect, validate(registerPushTokenSchema), asyncHandler(registerToken));
router.delete("/token", protect, validate(unregisterPushTokenSchema), asyncHandler(unregisterToken));

export default router;
