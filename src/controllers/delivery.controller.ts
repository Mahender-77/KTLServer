import { Request, Response } from "express";
import Order from "../models/Order";
import User from "../models/User";

interface AuthRequest extends Request {
  user?: any;
}

// ── GET /api/delivery/orders ────────────────────────────────────────────────────
export const getDeliveryOrders = async (req: AuthRequest, res: Response) => {
  try {
    // Get orders assigned to this delivery person or available for assignment
    const orders = await Order.find({
      $or: [
        { deliveryPerson: req.user._id },
        { deliveryPerson: null, orderStatus: "placed" },
      ],
    })
      .populate("user", "name email phone")
      .populate("items.product", "name images")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    console.error("Get delivery orders error:", err);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ── POST /api/delivery/orders/:id/accept ────────────────────────────────────────
export const acceptOrder = async (req: AuthRequest, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.deliveryPerson && order.deliveryPerson.toString() !== req.user._id.toString()) {
      return res.status(400).json({ message: "Order already assigned to another delivery person" });
    }

    order.deliveryPerson = req.user._id;
    order.deliveryStatus = "accepted";
    order.orderStatus = "shipped";
    await order.save();

    res.json({ message: "Order accepted successfully", order });
  } catch (err) {
    console.error("Accept order error:", err);
    res.status(500).json({ message: "Failed to accept order" });
  }
};

// ── POST /api/delivery/orders/:id/start-delivery ────────────────────────────────
export const startDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.deliveryPerson?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to deliver this order" });
    }

    order.deliveryStatus = "in-transit";
    await order.save();

    res.json({ message: "Delivery started", order });
  } catch (err) {
    console.error("Start delivery error:", err);
    res.status(500).json({ message: "Failed to start delivery" });
  }
};

// ── POST /api/delivery/orders/:id/complete ───────────────────────────────────────
export const completeDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.deliveryPerson?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to deliver this order" });
    }

    order.deliveryStatus = "delivered";
    order.orderStatus = "delivered";
    await order.save();

    res.json({ message: "Order delivered successfully", order });
  } catch (err) {
    console.error("Complete delivery error:", err);
    res.status(500).json({ message: "Failed to complete delivery" });
  }
};

// ── POST /api/delivery/location ───────────────────────────────────────────────────
export const updateLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ message: "Latitude and longitude are required" });
    }

    // Update location for all in-transit orders assigned to this delivery person
    await Order.updateMany(
      {
        deliveryPerson: req.user._id,
        deliveryStatus: "in-transit",
      },
      {
        $set: {
          "deliveryPersonLocation.latitude": latitude,
          "deliveryPersonLocation.longitude": longitude,
          "deliveryPersonLocation.lastUpdated": new Date(),
        },
      }
    );

    res.json({ message: "Location updated successfully" });
  } catch (err) {
    console.error("Update location error:", err);
    res.status(500).json({ message: "Failed to update location" });
  }
};

// ── GET /api/delivery/orders/:id/tracking ────────────────────────────────────────
export const getOrderTracking = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("deliveryPerson", "name phone")
      .select("deliveryPersonLocation deliveryStatus deliveryPerson");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({
      deliveryPerson: order.deliveryPerson,
      location: order.deliveryPersonLocation,
      deliveryStatus: order.deliveryStatus,
    });
  } catch (err) {
    console.error("Get tracking error:", err);
    res.status(500).json({ message: "Failed to fetch tracking info" });
  }
};

