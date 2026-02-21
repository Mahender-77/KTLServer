// server/controllers/order.controller.ts
import { Request, Response } from "express";
import Order from "../models/Order";
import Cart from "../models/Cart";
import Product from "../models/Product";
import SubOrder from "../models/SubOrder";
import Category from "../models/Category";
import mongoose from "mongoose";

interface AuthRequest extends Request {
  user?: any;
}

// ── POST /api/orders ───────────────────────────────────────────────────────────
export const createOrder = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items, totalAmount, address, paymentMethod } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Cart is empty" });
    }

    if (!address || !address.name || !address.phone || !address.address || !address.city || !address.pincode) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Complete address is required" });
    }

    if (!totalAmount || totalAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Invalid total amount" });
    }

    // Fetch all products with their categories to group items
    const productIds = items.map((item: any) => new mongoose.Types.ObjectId(item.product));
    const products = await Product.find({ _id: { $in: productIds } })
      .populate("category", "name")
      .session(session);

    if (products.length !== items.length) {
      await session.abortTransaction();
      return res.status(400).json({ message: "Some products not found" });
    }

    // Create a map of productId -> category for quick lookup
    const productCategoryMap = new Map();
    products.forEach((product: any) => {
      productCategoryMap.set(product._id.toString(), {
        categoryId: product.category._id,
        categoryName: product.category.name,
      });
    });

    // Group items by category
    type CategoryGroup = {
      categoryId: mongoose.Types.ObjectId;
      categoryName: string;
      items: Array<{
        product: mongoose.Types.ObjectId;
        variant: mongoose.Types.ObjectId;
        quantity: number;
        price: number;
      }>;
    };

    const categoryGroups = new Map<string, CategoryGroup>();

    items.forEach((item: any) => {
      const productId = item.product.toString();
      const categoryInfo = productCategoryMap.get(productId);

      if (!categoryInfo) {
        throw new Error(`Category not found for product ${productId}`);
      }

      const categoryKey = categoryInfo.categoryId.toString();

      if (!categoryGroups.has(categoryKey)) {
        categoryGroups.set(categoryKey, {
          categoryId: categoryInfo.categoryId,
          categoryName: categoryInfo.categoryName,
          items: [],
        });
      }

      categoryGroups.get(categoryKey)!.items.push({
        product: item.product,
        variant: item.variant,
        quantity: item.quantity,
        price: item.price,
      });
    });

    // Create main order
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
      subOrders: [],
    });

    await order.save({ session });

    // Create SubOrders for each category
    const subOrderIds: mongoose.Types.ObjectId[] = [];

    for (const [categoryId, group] of categoryGroups) {
      // Calculate total amount for this category
      const categoryTotal = group.items.reduce(
        (sum: number, item: any) => sum + item.price * item.quantity,
        0
      );

      const subOrder = new SubOrder({
        order: order._id,
        category: group.categoryId,
        categoryName: group.categoryName,
        items: group.items,
        totalAmount: categoryTotal,
        deliveryStatus: "pending",
        deliveryBoyId: null,
      });

      await subOrder.save({ session });
      subOrderIds.push(subOrder._id);
    }

    // Update order with SubOrder references
    order.subOrders = subOrderIds;
    await order.save({ session });

    // Clear cart after successful order
    const cart = await Cart.findOne({ user: req.user._id }).session(session);
    if (cart) {
      cart.items.splice(0, cart.items.length);
      await cart.save({ session });
    }

    await session.commitTransaction();

    res.status(201).json({
      message: "Order placed successfully",
      order: {
        _id: order._id,
        totalAmount: order.totalAmount,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        subOrdersCount: subOrderIds.length,
        createdAt: order.createdAt,
      },
    });
  } catch (err) {
    await session.abortTransaction();
    console.error("Create order error:", err);
    res.status(500).json({ message: "Failed to create order" });
  } finally {
    session.endSession();
  }
};

// ── GET /api/orders ────────────────────────────────────────────────────────────
export const getOrders = async (req: AuthRequest, res: Response) => {
  try {
    const orders = await Order.find({ user: req.user._id })
      .populate("items.product", "name images")
      .populate({
        path: "subOrders",
        populate: [
          {
            path: "category",
            select: "name",
          },
          {
            path: "deliveryBoyId",
            select: "name phone",
          },
        ],
      })
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
    })
      .populate("items.product", "name images")
      .populate({
        path: "subOrders",
        populate: [
          {
            path: "category",
            select: "name",
          },
          {
            path: "deliveryBoyId",
            select: "name phone",
          },
        ],
      });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (err) {
    console.error("Get order error:", err);
    res.status(500).json({ message: "Failed to fetch order" });
  }
};

