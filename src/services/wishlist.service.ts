import mongoose from "mongoose";
import Wishlist from "../models/Wishlist";
import { AppError } from "../utils/AppError";

export async function getWishlist(userId: string) {
  const wishlist = await Wishlist.findOne({ user: userId }).populate({
    path: "products",
    select: "name description images variants category isActive",
    populate: { path: "category", select: "name" },
  });
  if (!wishlist) return { products: [], totalItems: 0 };
  const activeProducts = wishlist.products.filter((p: any) => p && p.isActive !== false);
  return { products: activeProducts, totalItems: activeProducts.length };
}

export async function addToWishlist(userId: string, productId: string) {
  if (!productId) throw new AppError("productId is required", 400, "PRODUCT_ID_REQUIRED");
  let wishlist = await Wishlist.findOne({ user: userId });
  const productObjectId = new mongoose.Types.ObjectId(productId);
  if (!wishlist) {
    wishlist = new Wishlist({ user: userId, products: [productObjectId] });
  } else {
    if (wishlist.products.some((id) => id.toString() === productId)) {
      throw new AppError("Product already in wishlist", 400, "ALREADY_IN_WISHLIST");
    }
    wishlist.products.push(productObjectId);
  }
  await wishlist.save();
  return { message: "Added to wishlist", totalItems: wishlist.products.length };
}

export async function removeFromWishlist(userId: string, productId: string) {
  if (!productId) throw new AppError("productId is required", 400, "PRODUCT_ID_REQUIRED");
  const wishlist = await Wishlist.findOne({ user: userId });
  if (!wishlist) throw new AppError("Wishlist not found", 404, "WISHLIST_NOT_FOUND");
  wishlist.products = wishlist.products.filter((id) => id.toString() !== productId);
  await wishlist.save();
  return { message: "Removed from wishlist", totalItems: wishlist.products.length };
}
