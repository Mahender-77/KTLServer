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

const router = express.Router();

// All cart routes are protected — user must be logged in
router.use(protect);

router.get("/", getCart); // GET    /api/cart
router.post("/add", addToCart); // POST   /api/cart/add
router.delete("/remove", removeFromCart); // DELETE /api/cart/remove
router.patch("/update", updateCartItem); // PATCH  /api/cart/update
router.delete("/clear", clearCart); // DELETE /api/cart/clear

export default router;
