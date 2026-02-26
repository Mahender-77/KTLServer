import express from "express";
import { protect } from "../middlewares/auth.middleware";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from "../controllers/wishlist.controller";
import { asyncHandler } from "../utils/asyncHandler";

const router = express.Router();

router.use(protect);

router.get("/", asyncHandler(getWishlist));
router.post("/add", asyncHandler(addToWishlist));
router.delete("/remove", asyncHandler(removeFromWishlist));

export default router;

