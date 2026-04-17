import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import { AppError } from "../utils/AppError.js";
import { qualifiesForDealOfTheDay, DEAL_DISCOUNT_PERCENT } from "./product.service.js";
import { tenantWhereClause } from "../utils/tenantScope.js";

const PRODUCT_SELECT_CART =
  "name images variants pricingMode pricePerUnit baseUnit hasExpiry inventoryBatches organizationId isActive";

/** Load product for cart display — marketplace lists products from any org; do not scope by JWT org. */
async function loadProductForCartItem(productRef: unknown) {
  const id =
    typeof productRef === "string"
      ? productRef
      : productRef && typeof productRef === "object" && "_id" in (productRef as object)
        ? String((productRef as { _id: unknown })._id)
        : null;
  if (!id) return null;
  return Product.findOne({
    _id: id,
    isActive: { $ne: false },
  })
    .select(PRODUCT_SELECT_CART)
    .lean();
}

async function formatCartItems(cartItems: any[]) {
  const formattedItems = await Promise.all(
    cartItems.map(async (item) => {
      try {
        const product = await loadProductForCartItem(item.product);
        if (!product) return null;

        const variantIdStr = item.variant != null ? String(item.variant) : "";
        const variant = (product.variants || []).find(
          (v: any) => (v._id != null ? String(v._id) : "") === variantIdStr
        );

        const variantPrice = variant != null ? Number(variant.price) : NaN;
        const variantOfferPrice =
          variant != null && variant.offerPrice != null ? Number(variant.offerPrice) : NaN;
        const hasValidOffer =
          !Number.isNaN(variantOfferPrice) && variantOfferPrice > 0 && variantOfferPrice < variantPrice;

        let price = variant
          ? hasValidOffer
            ? variantOfferPrice
            : Number.isNaN(variantPrice)
              ? 0
              : variantPrice
          : Number(product.pricePerUnit) || 0;

        if (price <= 0 && variant && variantPrice > 0) {
          price = variantPrice;
        }

        const isDeal = qualifiesForDealOfTheDay(product);
        if (isDeal) {
          price = price * (1 - DEAL_DISCOUNT_PERCENT / 100);
        }

        const originalPrice = variant != null && !Number.isNaN(variantPrice) ? variantPrice : undefined;

        return {
          _id: item._id,
          product: {
            _id: product._id.toString(),
            name: product.name,
            images: product.images || [],
          },
          variant: item.variant.toString(),
          quantity: item.quantity,
          price,
          originalPrice,
          offerPrice: variant?.offerPrice != null ? Number(variant.offerPrice) : undefined,
          ...(isDeal && { dealDiscountPercent: DEAL_DISCOUNT_PERCENT }),
        };
      } catch {
        return null;
      }
    })
  );
  return formattedItems.filter((item) => item !== null);
}

/** Merge line items from every org-scoped cart (marketplace: user may shop multiple sellers). */
async function mergedCartPayload(userId: string) {
  const carts = await Cart.find({ user: userId }).populate("items.product", "name images variants");
  const allItems = carts.flatMap((c) => c.items);
  if (allItems.length === 0) return { items: [], totalItems: 0 };
  const formattedItems = await formatCartItems(allItems);
  const totalItems = formattedItems.reduce((sum: number, item: any) => sum + item.quantity, 0);
  return { items: formattedItems, totalItems };
}

export async function getCart(userId: string, _organizationId: string) {
  return mergedCartPayload(userId);
}

export async function addToCart(
  userId: string,
  _jwtOrganizationId: string,
  data: { productId: string; variantId: string; quantity?: number }
) {
  const { productId, variantId, quantity = 1 } = data;

  const product = await Product.findOne({
    _id: productId,
    isActive: { $ne: false },
  })
    .select(PRODUCT_SELECT_CART)
    .lean();

  if (!product) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  if (product.pricingMode === "fixed") {
    const ok = (product.variants || []).some((v: { _id?: unknown }) => String(v._id) === String(variantId));
    if (!ok) {
      throw new AppError("Invalid variant for this product", 400, "INVALID_VARIANT");
    }
  }

  const organizationId = String(product.organizationId);

  let cart = await Cart.findOne({
    user: userId,
    ...tenantWhereClause(organizationId),
  });
  if (!cart) {
    cart = new Cart({
      organizationId,
      user: userId,
      items: [{ product: productId, variant: variantId, quantity }],
    });
  } else {
    const existingIdx = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId && item.variant.toString() === variantId
    );
    if (existingIdx >= 0) {
      cart.items[existingIdx].quantity += quantity;
    } else {
      cart.items.push({ product: productId, variant: variantId, quantity });
    }
  }
  await cart.save();

  const { items, totalItems } = await mergedCartPayload(userId);
  return { message: "Added to cart", totalItems, items };
}

export async function removeFromCart(
  userId: string,
  _organizationId: string,
  data: { productId: string; variantId: string }
) {
  const { productId, variantId } = data;
  const cart = await Cart.findOne({
    user: userId,
    items: { $elemMatch: { product: productId, variant: variantId } },
  });
  if (!cart) throw new AppError("Cart not found", 404, "CART_NOT_FOUND");

  const removeIdx = cart.items.findIndex(
    (item) =>
      item.product.toString() === productId && item.variant.toString() === variantId
  );
  if (removeIdx !== -1) cart.items.splice(removeIdx, 1);
  await cart.save();

  const { items, totalItems } = await mergedCartPayload(userId);
  return { message: "Item removed", totalItems, items };
}

export async function updateCartItem(
  userId: string,
  _organizationId: string,
  data: { productId: string; variantId: string; quantity: number }
) {
  const { productId, variantId, quantity } = data;
  const cart = await Cart.findOne({
    user: userId,
    items: { $elemMatch: { product: productId, variant: variantId } },
  });
  if (!cart) throw new AppError("Cart not found", 404, "CART_NOT_FOUND");

  const itemIdx = cart.items.findIndex(
    (item) =>
      item.product.toString() === productId && item.variant.toString() === variantId
  );
  if (itemIdx === -1) throw new AppError("Item not found in cart", 404, "CART_ITEM_NOT_FOUND");

  if (quantity <= 0) {
    cart.items.splice(itemIdx, 1);
  } else {
    cart.items[itemIdx].quantity = quantity;
  }
  await cart.save();

  const { items, totalItems } = await mergedCartPayload(userId);
  return { message: "Cart updated", totalItems, items };
}

export async function clearCart(userId: string, _organizationId: string) {
  const result = await Cart.updateMany({ user: userId }, { $set: { items: [] } });
  if (result.matchedCount === 0) {
    return { message: "Cart cleared", totalItems: 0, items: [] };
  }
  return { message: "Cart cleared", totalItems: 0, items: [] };
}
