// server/routes/Wishlist.routes.ts
import express from "express";
import { protect } from "../middlewares/auth.middleware";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from "../controllers/wishlist.controller";

const router = express.Router();

// All wishlist routes are protected — user must be logged in
router.use(protect);

router.get("/", getWishlist); // GET    /api/wishlist
router.post("/add", addToWishlist); // POST   /api/wishlist/add
router.delete("/remove", removeFromWishlist); // DELETE /api/wishlist/remove

export default router;

