import express from "express";
import {
  registerUser,
  loginUser,
  getCurrentUser,
  refreshTokens,
  logoutUser,
} from "../controllers/auth.controller";
import { protect } from "../middlewares/auth.middleware";
import { authLimiter } from "../middlewares/rateLimit.middleware";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
} from "../validators/auth.validator";

const router = express.Router();

router.post("/register", authLimiter, validate(registerSchema), asyncHandler(registerUser));
router.post("/login", authLimiter, validate(loginSchema), asyncHandler(loginUser));
router.post("/refresh", authLimiter, validate(refreshSchema), asyncHandler(refreshTokens));
router.post("/logout", authLimiter, validate(logoutSchema), asyncHandler(logoutUser));
router.get("/me", protect, asyncHandler(getCurrentUser));

export default router;
