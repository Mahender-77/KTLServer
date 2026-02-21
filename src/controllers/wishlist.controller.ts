// server/controllers/wishlist.controller.ts
import { Request, Response } from "express";
import Wishlist from "../models/Wishlist";

interface AuthRequest extends Request {
  user?: any;
}

// ── GET /api/wishlist ───────────────────────────────────────────────────────────
export const getWishlist = async (req: AuthRequest, res: Response) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id }).populate({
      path: "products",
      select: "name description images variants category isActive",
      populate: {
        path: "category",
        select: "name",
      },
    });

    if (!wishlist) {
      return res.json({ products: [], totalItems: 0 });
    }

    // Filter out inactive products
    const activeProducts = wishlist.products.filter(
      (p: any) => p && p.isActive !== false
    );

    res.json({
      products: activeProducts,
      totalItems: activeProducts.length,
    });
  } catch (err) {
    console.error("getWishlist error:", err);
    res.status(500).json({ message: "Failed to fetch wishlist" });
  }
};

// ── POST /api/wishlist/add ───────────────────────────────────────────────────────
export const addToWishlist = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }

    let wishlist = await Wishlist.findOne({ user: req.user._id });

    if (!wishlist) {
      wishlist = new Wishlist({
        user: req.user._id,
        products: [productId],
      });
    } else {
      // Check if product already exists
      if (wishlist.products.includes(productId)) {
        return res.status(400).json({ message: "Product already in wishlist" });
      }
      wishlist.products.push(productId);
    }

    await wishlist.save();

    res.json({
      message: "Added to wishlist",
      totalItems: wishlist.products.length,
    });
  } catch (err) {
    console.error("addToWishlist error:", err);
    res.status(500).json({ message: "Failed to add to wishlist" });
  }
};

// ── DELETE /api/wishlist/remove ─────────────────────────────────────────────────
export const removeFromWishlist = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "productId is required" });
    }

    const wishlist = await Wishlist.findOne({ user: req.user._id });

    if (!wishlist) {
      return res.status(404).json({ message: "Wishlist not found" });
    }

    wishlist.products = wishlist.products.filter(
      (id) => id.toString() !== productId
    );

    await wishlist.save();

    res.json({
      message: "Removed from wishlist",
      totalItems: wishlist.products.length,
    });
  } catch (err) {
    console.error("removeFromWishlist error:", err);
    res.status(500).json({ message: "Failed to remove from wishlist" });
  }
};

