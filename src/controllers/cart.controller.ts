// server/controllers/cart.controller.ts
import { Request, Response } from "express";
import Cart from "../models/Cart";
import Product from "../models/Product";

interface AuthRequest extends Request {
  user?: any;
}

// ── Helper: Format cart items with product and variant details ────────────────
async function formatCartItems(cartItems: any[]) {
  const formattedItems = await Promise.all(
    cartItems.map(async (item) => {
      try {
        // Populate product if not already populated
        let product = item.product;
        if (typeof product === "string") {
          product = await Product.findById(product).select("name images variants");
        } else if (product && (!product.variants || product.variants.length === 0)) {
          // If product is populated but variants are missing, fetch again
          product = await Product.findById(product._id).select("name images variants");
        }

        if (!product) {
          console.warn(`Product not found for cart item: ${item._id}`);
          return null;
        }

        // Find the variant from product.variants array
        const variant = product.variants?.find(
          (v: any) => v._id?.toString() === item.variant.toString()
        );

        if (!variant) {
          console.warn(`Variant not found for cart item: ${item._id}, variantId: ${item.variant}`);
          return null;
        }

        return {
          _id: item._id,
          product: {
            _id: product._id.toString(),
            name: product.name,
            images: product.images || [],
          },
          variant: item.variant.toString(),
          quantity: item.quantity,
          price: variant.price || 0,
          offerPrice: variant.offerPrice,
        };
      } catch (error) {
        console.error(`Error formatting cart item ${item._id}:`, error);
        return null;
      }
    })
  );

  return formattedItems.filter((item) => item !== null);
}

// ── GET /api/cart ─────────────────────────────────────────────────────────────
export const getCart = async (req: AuthRequest, res: Response) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "items.product",
      "name images variants"
    );

    if (!cart) return res.json({ items: [], totalItems: 0 });

    const formattedItems = await formatCartItems(cart.items);
    const totalItems = formattedItems.reduce((sum, item) => sum + item.quantity, 0);
    
    res.json({ items: formattedItems, totalItems });
  } catch (err) {
    console.error("getCart error:", err);
    res.status(500).json({ message: "Failed to fetch cart" });
  }
};

// ── POST /api/cart/add ────────────────────────────────────────────────────────
export const addToCart = async (req: AuthRequest, res: Response) => {
  console.log("addToCart called with:", req.body);
  try {
    const { productId, variantId, quantity = 1 } = req.body;

    if (!productId || !variantId) {
      return res.status(400).json({ message: "productId and variantId are required" });
    }

    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      // First time — create a new cart for this user
      cart = new Cart({
        user: req.user._id,
        items: [{ product: productId, variant: variantId, quantity }],
      });
    } else {
      const existingIdx = cart.items.findIndex(
        (item) =>
          item.product.toString() === productId &&
          item.variant.toString() === variantId
      );

      if (existingIdx >= 0) {
        // Same product + variant → increment quantity
        cart.items[existingIdx].quantity += quantity;
      } else {
        // New item → push to cart
        cart.items.push({ product: productId, variant: variantId, quantity });
      }
    }

    await cart.save();
    await cart.populate("items.product", "name images variants");

    const formattedItems = await formatCartItems(cart.items);
    const totalItems = formattedItems.reduce((sum, item) => sum + item.quantity, 0);
    
    res.json({ message: "Added to cart", totalItems, items: formattedItems });
  } catch (err) {
    console.error("addToCart error:", err);
    res.status(500).json({ message: "Failed to add to cart" });
  }
};

// ── DELETE /api/cart/remove ───────────────────────────────────────────────────
export const removeFromCart = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, variantId } = req.body;

    if (!productId || !variantId) {
      return res.status(400).json({ message: "productId and variantId are required" });
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    // Use splice instead of reassigning to keep Mongoose DocumentArray type
    const removeIdx = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId &&
        item.variant.toString() === variantId
    );
    if (removeIdx !== -1) cart.items.splice(removeIdx, 1);

    await cart.save();
    await cart.populate("items.product", "name images variants");

    const formattedItems = await formatCartItems(cart.items);
    const totalItems = formattedItems.reduce((sum, item) => sum + item.quantity, 0);
    
    res.json({ message: "Item removed", totalItems, items: formattedItems });
  } catch (err) {
    console.error("removeFromCart error:", err);
    res.status(500).json({ message: "Failed to remove from cart" });
  }
};

// ── PATCH /api/cart/update ────────────────────────────────────────────────────
export const updateCartItem = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, variantId, quantity } = req.body;

    if (!productId || !variantId || quantity == null) {
      return res.status(400).json({ message: "productId, variantId and quantity are required" });
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    const itemIdx = cart.items.findIndex(
      (item) =>
        item.product.toString() === productId &&
        item.variant.toString() === variantId
    );

    if (itemIdx === -1) return res.status(404).json({ message: "Item not found in cart" });

    if (quantity <= 0) {
      // Remove item if quantity drops to 0
      cart.items.splice(itemIdx, 1);
    } else {
      cart.items[itemIdx].quantity = quantity;
    }

    await cart.save();
    await cart.populate("items.product", "name images variants");

    const formattedItems = await formatCartItems(cart.items);
    const totalItems = formattedItems.reduce((sum, item) => sum + item.quantity, 0);
    
    res.json({ message: "Cart updated", totalItems, items: formattedItems });
  } catch (err) {
    console.error("updateCartItem error:", err);
    res.status(500).json({ message: "Failed to update cart" });
  }
};

// ── DELETE /api/cart/clear ────────────────────────────────────────────────────
export const clearCart = async (req: AuthRequest, res: Response) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: "Cart not found" });

    cart.items.splice(0, cart.items.length); // empty without reassigning
    await cart.save();

    res.json({ message: "Cart cleared", totalItems: 0, items: [] });
  } catch (err) {
    console.error("clearCart error:", err);
    res.status(500).json({ message: "Failed to clear cart" });
  }
};