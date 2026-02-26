import Order from "../models/Order";
import SubOrder from "../models/SubOrder";
import { paginated, PaginatedResponse } from "../utils/pagination";
import { AppError } from "../utils/AppError";

export async function getDeliverySubOrders(
  userId: string,
  params: { page: number; limit: number; skip: number }
): Promise<PaginatedResponse<any>> {
  const { page, limit, skip } = params;
  const filter = {
    $or: [
      { deliveryBoyId: userId },
      { deliveryBoyId: null, deliveryStatus: "pending" },
    ],
  };
  const [subOrders, total] = await Promise.all([
    SubOrder.find(filter)
      .populate({
        path: "order",
        populate: { path: "user", select: "name email phone" },
        select: "user address createdAt",
      })
      .populate("category", "name")
      .populate("items.product", "name images")
      .populate("deliveryBoyId", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SubOrder.countDocuments(filter),
  ]);
  return paginated(subOrders, total, page, limit);
}

export async function acceptSubOrder(userId: string, subOrderId: string) {
  const subOrder = await SubOrder.findOneAndUpdate(
    {
      _id: subOrderId,
      deliveryBoyId: null,
      deliveryStatus: "pending",
    },
    { $set: { deliveryBoyId: userId, deliveryStatus: "accepted" } },
    { new: true, runValidators: true }
  )
    .populate({
      path: "order",
      populate: { path: "user", select: "name email phone" },
    })
    .populate("category", "name")
    .populate("items.product", "name images");

  if (!subOrder) {
    throw new AppError(
      "SubOrder not found, already accepted, or not available for acceptance",
      400,
      "SUBORDER_UNAVAILABLE"
    );
  }
  return { message: "SubOrder accepted successfully", subOrder };
}

export async function startSubOrderDelivery(userId: string, subOrderId: string) {
  const subOrder = await SubOrder.findOneAndUpdate(
    { _id: subOrderId, deliveryBoyId: userId, deliveryStatus: "accepted" },
    { $set: { deliveryStatus: "out_for_delivery" } },
    { new: true, runValidators: true }
  )
    .populate({
      path: "order",
      populate: { path: "user", select: "name email phone" },
    })
    .populate("category", "name")
    .populate("items.product", "name images");

  if (!subOrder) {
    throw new AppError(
      "SubOrder not found or not authorized to start delivery",
      403,
      "SUBORDER_UNAUTHORIZED"
    );
  }
  return { message: "Delivery started", subOrder };
}

export async function completeSubOrderDelivery(userId: string, subOrderId: string) {
  const subOrder = await SubOrder.findOneAndUpdate(
    {
      _id: subOrderId,
      deliveryBoyId: userId,
      deliveryStatus: "out_for_delivery",
    },
    { $set: { deliveryStatus: "delivered" } },
    { new: true, runValidators: true }
  )
    .populate({
      path: "order",
      populate: { path: "user", select: "name email phone" },
    })
    .populate("category", "name")
    .populate("items.product", "name images");

  if (!subOrder) {
    throw new AppError(
      "SubOrder not found or not authorized to complete delivery",
      403,
      "SUBORDER_UNAUTHORIZED"
    );
  }

  const allSubOrders = await SubOrder.find({ order: subOrder.order._id });
  const allDelivered = allSubOrders.every((so) => so.deliveryStatus === "delivered");
  if (allDelivered) {
    await Order.findByIdAndUpdate(subOrder.order._id, { $set: { orderStatus: "delivered" } });
  }

  return {
    message: "SubOrder delivered successfully",
    subOrder,
    allDelivered,
  };
}

export async function updateLocation(
  userId: string,
  data: { latitude: number; longitude: number }
) {
  const { latitude, longitude } = data;
  if (latitude == null || longitude == null) {
    throw new AppError("Latitude and longitude are required", 400, "LOCATION_REQUIRED");
  }
  await SubOrder.updateMany(
    {
      deliveryBoyId: userId,
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
  return { message: "Location updated successfully" };
}

export async function getSubOrderTracking(subOrderId: string) {
  const subOrder = await SubOrder.findById(subOrderId)
    .populate("deliveryBoyId", "name phone")
    .populate({
      path: "order",
      select: "address user",
      populate: { path: "user", select: "name phone" },
    })
    .select("deliveryBoyId deliveryStatus deliveryPersonLocation order");

  if (!subOrder) throw new AppError("SubOrder not found", 404, "SUBORDER_NOT_FOUND");

  return {
    deliveryBoy: subOrder.deliveryBoyId,
    location: subOrder.deliveryPersonLocation,
    deliveryStatus: subOrder.deliveryStatus,
    order: subOrder.order,
  };
}

export async function getOrderTracking(userId: string, orderId: string) {
  const order = await Order.findById(orderId)
    .populate("deliveryPerson", "name phone")
    .populate({
      path: "subOrders",
      populate: { path: "deliveryBoyId", select: "name phone" },
      select: "deliveryStatus deliveryBoyId deliveryPersonLocation",
    })
    .select("user deliveryPersonLocation deliveryStatus deliveryPerson subOrders");

  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");

  const orderUserId = order.user?.toString?.() ?? order.user;
  const reqUserId = userId;
  if (orderUserId !== reqUserId) {
    throw new AppError("You do not have access to this order", 403, "ORDER_ACCESS_DENIED");
  }

  return {
    deliveryPerson: order.deliveryPerson,
    location: order.deliveryPersonLocation,
    deliveryStatus: order.deliveryStatus,
    subOrders: order.subOrders,
  };
}
