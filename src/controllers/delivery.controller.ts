import { Request, Response } from "express";
import Order from "../models/Order";
import SubOrder from "../models/SubOrder";
import User from "../models/User";

interface AuthRequest extends Request {
  user?: any;
}

// ── GET /api/delivery/suborders ─────────────────────────────────────────────────
export const getDeliverySubOrders = async (req: AuthRequest, res: Response) => {
  try {
    // Get SubOrders assigned to this delivery person or available for assignment
    const subOrders = await SubOrder.find({
      $or: [
        { deliveryBoyId: req.user._id },
        { deliveryBoyId: null, deliveryStatus: "pending" },
      ],
    })
      .populate({
        path: "order",
        populate: {
          path: "user",
          select: "name email phone",
        },
        select: "user address createdAt",
      })
      .populate("category", "name")
      .populate("items.product", "name images")
      .populate("deliveryBoyId", "name phone")
      .sort({ createdAt: -1 });

    res.json(subOrders);
  } catch (err) {
    console.error("Get delivery suborders error:", err);
    res.status(500).json({ message: "Failed to fetch suborders" });
  }
};

// ── POST /api/delivery/suborders/:id/accept ─────────────────────────────────────
export const acceptSubOrder = async (req: AuthRequest, res: Response) => {
  try {
    const subOrderId = req.params.id;

    // Atomic update: Only accept if deliveryBoyId is null and status is pending
    // This prevents race conditions where multiple delivery boys try to accept the same SubOrder
    const subOrder = await SubOrder.findOneAndUpdate(
      {
        _id: subOrderId,
        deliveryBoyId: null,
        deliveryStatus: "pending",
      },
      {
        $set: {
          deliveryBoyId: req.user._id,
          deliveryStatus: "accepted",
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate({
        path: "order",
        populate: {
          path: "user",
          select: "name email phone",
        },
      })
      .populate("category", "name")
      .populate("items.product", "name images");

    if (!subOrder) {
      return res.status(400).json({
        message: "SubOrder not found, already accepted, or not available for acceptance",
      });
    }

    res.json({
      message: "SubOrder accepted successfully",
      subOrder,
    });
  } catch (err) {
    console.error("Accept suborder error:", err);
    res.status(500).json({ message: "Failed to accept suborder" });
  }
};

// ── POST /api/delivery/suborders/:id/start-delivery ─────────────────────────────
export const startSubOrderDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const subOrderId = req.params.id;

    const subOrder = await SubOrder.findOneAndUpdate(
      {
        _id: subOrderId,
        deliveryBoyId: req.user._id,
        deliveryStatus: "accepted",
      },
      {
        $set: {
          deliveryStatus: "out_for_delivery",
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate({
        path: "order",
        populate: {
          path: "user",
          select: "name email phone",
        },
      })
      .populate("category", "name")
      .populate("items.product", "name images");

    if (!subOrder) {
      return res.status(403).json({
        message: "SubOrder not found or not authorized to start delivery",
      });
    }

    res.json({ message: "Delivery started", subOrder });
  } catch (err) {
    console.error("Start delivery error:", err);
    res.status(500).json({ message: "Failed to start delivery" });
  }
};

// ── POST /api/delivery/suborders/:id/complete ────────────────────────────────────
export const completeSubOrderDelivery = async (req: AuthRequest, res: Response) => {
  try {
    const subOrderId = req.params.id;

    const subOrder = await SubOrder.findOneAndUpdate(
      {
        _id: subOrderId,
        deliveryBoyId: req.user._id,
        deliveryStatus: "out_for_delivery",
      },
      {
        $set: {
          deliveryStatus: "delivered",
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate({
        path: "order",
        populate: {
          path: "user",
          select: "name email phone",
        },
      })
      .populate("category", "name")
      .populate("items.product", "name images");

    if (!subOrder) {
      return res.status(403).json({
        message: "SubOrder not found or not authorized to complete delivery",
      });
    }

    // Check if all SubOrders in the main order are delivered
    const allSubOrders = await SubOrder.find({
      order: subOrder.order._id,
    });

    const allDelivered = allSubOrders.every(
      (so) => so.deliveryStatus === "delivered"
    );

    // Update main order status if all SubOrders are delivered
    if (allDelivered) {
      await Order.findByIdAndUpdate(subOrder.order._id, {
        $set: {
          orderStatus: "delivered",
        },
      });
    }

    res.json({
      message: "SubOrder delivered successfully",
      subOrder,
      allDelivered,
    });
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

    // Update location for all active SubOrders assigned to this delivery person
    // Active means: accepted, out_for_delivery (but not delivered)
    await SubOrder.updateMany(
      {
        deliveryBoyId: req.user._id,
        deliveryStatus: { $in: ["accepted", "out_for_delivery"] },
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

// ── GET /api/delivery/suborders/:id/tracking ─────────────────────────────────────
export const getSubOrderTracking = async (req: Request, res: Response) => {
  try {
    const subOrder = await SubOrder.findById(req.params.id)
      .populate("deliveryBoyId", "name phone")
      .populate({
        path: "order",
        select: "address user",
        populate: {
          path: "user",
          select: "name phone",
        },
      })
      .select("deliveryBoyId deliveryStatus deliveryPersonLocation order");

    if (!subOrder) {
      return res.status(404).json({ message: "SubOrder not found" });
    }

    res.json({
      deliveryBoy: subOrder.deliveryBoyId,
      location: subOrder.deliveryPersonLocation,
      deliveryStatus: subOrder.deliveryStatus,
      order: subOrder.order,
    });
  } catch (err) {
    console.error("Get tracking error:", err);
    res.status(500).json({ message: "Failed to fetch tracking info" });
  }
};

// ── GET /api/delivery/orders/:id/tracking ────────────────────────────────────────
// Legacy endpoint for backward compatibility
export const getOrderTracking = async (req: Request, res: Response) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("deliveryPerson", "name phone")
      .populate({
        path: "subOrders",
        populate: {
          path: "deliveryBoyId",
          select: "name phone",
        },
        select: "deliveryStatus deliveryBoyId deliveryPersonLocation",
      })
      .select("deliveryPersonLocation deliveryStatus deliveryPerson subOrders");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({
      deliveryPerson: order.deliveryPerson,
      location: order.deliveryPersonLocation,
      deliveryStatus: order.deliveryStatus,
      subOrders: order.subOrders,
    });
  } catch (err) {
    console.error("Get tracking error:", err);
    res.status(500).json({ message: "Failed to fetch tracking info" });
  }
};

