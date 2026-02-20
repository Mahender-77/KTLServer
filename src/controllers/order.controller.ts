// server/controllers/order.controller.ts
import { Request, Response } from "express";
import Order from "../models/Order";
import Cart from "../models/Cart";

interface AuthRequest extends Request {
  user?: any;
}

// ── POST /api/orders ───────────────────────────────────────────────────────────
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    const { items, totalAmount, address, paymentMethod } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    if (!address || !address.name || !address.phone || !address.address || !address.city || !address.pincode) {
      return res.status(400).json({ message: "Complete address is required" });
    }

    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ message: "Invalid total amount" });
    }

    // Create order
    const order = new Order({
      user: req.user._id,
      items: items.map((item: any) => ({
        product: item.product,
        variant: item.variant,
        quantity: item.quantity,
        price: item.price,
      })),
      totalAmount,
      address: {
        name: address.name,
        phone: address.phone,
        address: address.address,
        city: address.city,
        pincode: address.pincode,
        landmark: address.landmark || "",
      },
      paymentStatus: paymentMethod === "online" ? "paid" : "pending",
      orderStatus: "placed",
    });

    await order.save();

    // Clear cart after successful order
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return; // Early return if cart doesn't exist
    
    cart.items.splice(0, cart.items.length); // Clear without reassigning to preserve DocumentArray type
    await cart.save();

    res.status(201).json({
      message: "Order placed successfully",
      order: {
        _id: order._id,
        totalAmount: order.totalAmount,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        createdAt: order.createdAt,
      },
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Failed to create order" });
  }
};

// ── GET /api/orders ────────────────────────────────────────────────────────────
export const getOrders = async (req: AuthRequest, res: Response) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate("items.product", "name images")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error("Get orders error:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ── GET /api/orders/:id ───────────────────────────────────────────────────────
export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate("items.product", "name images");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (err) {
    console.error("Get order error:", err);
    res.status(500).json({ message: "Failed to fetch order" });
  }
};

