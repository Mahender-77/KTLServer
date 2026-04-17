import mongoose from "mongoose";
import Wishlist from "../models/Wishlist.js";
import Product from "../models/Product.js";
import { AppError } from "../utils/AppError.js";
import { tenantWhereClause } from "../utils/tenantScope.js";

export async function getWishlist(userId: string, organizationId: string) {
  const wishlist = await Wishlist.findOne({
    user: userId,
    ...tenantWhereClause(organizationId),
  }).populate({
    path: "products",
    select: "name description images variants category isActive organizationId",
    populate: { path: "category", select: "name" },
  });
  if (!wishlist) return { products: [], totalItems: 0 };
  const activeProducts = wishlist.products.filter((p: any) => p && p.isActive !== false);
  return { products: activeProducts, totalItems: activeProducts.length };
}

export async function addToWishlist(userId: string, organizationId: string, productId: string) {
  if (!productId) throw new AppError("productId is required", 400, "PRODUCT_ID_REQUIRED");
  const productOk = await Product.exists({
    _id: productId,
    ...tenantWhereClause(organizationId),
  });
  if (!productOk) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  let wishlist = await Wishlist.findOne({
    user: userId,
    ...tenantWhereClause(organizationId),
  });
  const productObjectId = new mongoose.Types.ObjectId(productId);
  if (!wishlist) {
    wishlist = new Wishlist({ organizationId, user: userId, products: [productObjectId] });
  } else {
    if (wishlist.products.some((id) => id.toString() === productId)) {
      throw new AppError("Product already in wishlist", 400, "ALREADY_IN_WISHLIST");
    }
    wishlist.products.push(productObjectId);
  }
  await wishlist.save();
  return { message: "Added to wishlist", totalItems: wishlist.products.length };
}

export async function removeFromWishlist(userId: string, organizationId: string, productId: string) {
  if (!productId) throw new AppError("productId is required", 400, "PRODUCT_ID_REQUIRED");
  const wishlist = await Wishlist.findOne({
    user: userId,
    ...tenantWhereClause(organizationId),
  });
  if (!wishlist) throw new AppError("Wishlist not found", 404, "WISHLIST_NOT_FOUND");
  wishlist.products = wishlist.products.filter((id) => id.toString() !== productId);
  await wishlist.save();
  return { message: "Removed from wishlist", totalItems: wishlist.products.length };
}
