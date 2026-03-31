import Cart from "../models/Cart";
import Product from "../models/Product";
import { AppError } from "../utils/AppError";
import { qualifiesForDealOfTheDay, DEAL_DISCOUNT_PERCENT } from "./product.service";
import { tenantWhereClause } from "../utils/tenantScope";

async function formatCartItems(cartItems: any[], organizationId: string) {
  const formattedItems = await Promise.all(
    cartItems.map(async (item) => {
      try {
        let product = item.product;
        const select =
          "name images variants pricingMode pricePerUnit baseUnit hasExpiry inventoryBatches organizationId";
        if (typeof product === "string") {
          product = await Product.findOne({
            _id: product,
            ...tenantWhereClause(organizationId),
          })
            .select(select)
            .lean();
        } else if (product) {
          product = await Product.findOne({
            _id: product._id,
            ...tenantWhereClause(organizationId),
          })
            .select(select)
            .lean();
        }
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

export async function getCart(userId: string, organizationId: string) {
  const cart = await Cart.findOne({
    user: userId,
    ...tenantWhereClause(organizationId),
  }).populate("items.product", "name images variants");
  if (!cart) return { items: [], totalItems: 0 };
  const formattedItems = await formatCartItems(cart.items, organizationId);
  const totalItems = formattedItems.reduce((sum: number, item: any) => sum + item.quantity, 0);
  return { items: formattedItems, totalItems };
}

export async function addToCart(
  userId: string,
  organizationId: string,
  data: { productId: string; variantId: string; quantity?: number }
) {
  const { productId, variantId, quantity = 1 } = data;
  const productOk = await Product.exists({
    _id: data.productId,
    ...tenantWhereClause(organizationId),
  });
  if (!productOk) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

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
  await cart.populate("items.product", "name images variants");
  const formattedItems = await formatCartItems(cart.items, organizationId);
  const totalItems = formattedItems.reduce((sum: number, item: any) => sum + item.quantity, 0);
  return { message: "Added to cart", totalItems, items: formattedItems };
}

export async function removeFromCart(
  userId: string,
  organizationId: string,
  data: { productId: string; variantId: string }
) {
  const { productId, variantId } = data;
  const cart = await Cart.findOne({
    user: userId,
    ...tenantWhereClause(organizationId),
  });
  if (!cart) throw new AppError("Cart not found", 404, "CART_NOT_FOUND");

  const removeIdx = cart.items.findIndex(
    (item) =>
      item.product.toString() === productId && item.variant.toString() === variantId
  );
  if (removeIdx !== -1) cart.items.splice(removeIdx, 1);
  await cart.save();
  await cart.populate("items.product", "name images variants");
  const formattedItems = await formatCartItems(cart.items, organizationId);
  const totalItems = formattedItems.reduce((sum: number, item: any) => sum + item.quantity, 0);
  return { message: "Item removed", totalItems, items: formattedItems };
}

export async function updateCartItem(
  userId: string,
  organizationId: string,
  data: { productId: string; variantId: string; quantity: number }
) {
  const { productId, variantId, quantity } = data;
  const cart = await Cart.findOne({
    user: userId,
    ...tenantWhereClause(organizationId),
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
  await cart.populate("items.product", "name images variants");
  const formattedItems = await formatCartItems(cart.items, organizationId);
  const totalItems = formattedItems.reduce((sum: number, item: any) => sum + item.quantity, 0);
  return { message: "Cart updated", totalItems, items: formattedItems };
}

export async function clearCart(userId: string, organizationId: string) {
  const cart = await Cart.findOne({
    user: userId,
    ...tenantWhereClause(organizationId),
  });
  if (!cart) throw new AppError("Cart not found", 404, "CART_NOT_FOUND");
  cart.items.splice(0, cart.items.length);
  await cart.save();
  return { message: "Cart cleared", totalItems: 0, items: [] };
}
