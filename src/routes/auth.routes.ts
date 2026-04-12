import express from "express";
import {
  registerUser,
  loginUser,
  getCurrentUser,
  refreshTokens,
  logoutUser,
  changePasswordUser,
  forgotPassword,
  resetPassword,
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
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.validator";
import { issueCsrfToken } from "../middlewares/csrf.middleware";

const router = express.Router();

router.get("/csrf-token", issueCsrfToken);

router.post("/register", authLimiter, validate(registerSchema), asyncHandler(registerUser));
router.post("/login", authLimiter, validate(loginSchema), asyncHandler(loginUser));
router.post("/refresh", authLimiter, validate(refreshSchema), asyncHandler(refreshTokens));
router.post("/logout", authLimiter, validate(logoutSchema), asyncHandler(logoutUser));
router.get("/me", protect, asyncHandler(getCurrentUser));
router.post(
  "/change-password",
  protect,
  validate(changePasswordSchema),
  asyncHandler(changePasswordUser)
);
router.post("/forgot-password", authLimiter, validate(forgotPasswordSchema), asyncHandler(forgotPassword));
router.post("/reset-password", authLimiter, validate(resetPasswordSchema), asyncHandler(resetPassword));

export default router;
