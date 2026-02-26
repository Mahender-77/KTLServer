// server/routes/cart.routes.ts
import express from "express";
import { protect } from "../middlewares/auth.middleware";
import {
  addToCart,
  clearCart,
  getCart,
  removeFromCart,
  updateCartItem,
} from "../controllers/cart.controller";
import { validate } from "../middlewares/validate.middleware";
import { asyncHandler } from "../utils/asyncHandler";
import {
  addToCartSchema,
  removeFromCartSchema,
  updateCartItemSchema,
} from "../validators/cart.validator";

const router = express.Router();

router.use(protect);

router.get("/", asyncHandler(getCart));
router.post("/add", validate(addToCartSchema), asyncHandler(addToCart));
router.delete("/remove", validate(removeFromCartSchema), asyncHandler(removeFromCart));
router.patch("/update", validate(updateCartItemSchema), asyncHandler(updateCartItem));
router.delete("/clear", asyncHandler(clearCart));

export default router;
