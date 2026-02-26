import Order from "../models/Order";
import Cart from "../models/Cart";
import Product from "../models/Product";
import SubOrder from "../models/SubOrder";
import mongoose, { ClientSession } from "mongoose";
import { paginated, PaginatedResponse } from "../utils/pagination";
import { AppError } from "../utils/AppError";

type BatchDoc = {
  _id: mongoose.Types.ObjectId;
  store: mongoose.Types.ObjectId;
  variant?: mongoose.Types.ObjectId;
  quantity: number;
  expiryDate?: Date;
  createdAt?: Date;
};

/**
 * Deducts orderQuantity from product stock for the given store.
 * 1. Load product.
 * 2. Fetch batches for store.
 * 3. Filter: quantity > 0; if hasExpiry then expiryDate > now.
 * 4. Sort: hasExpiry ? expiryDate asc (FIFO) : createdAt asc.
 * 5. Deduct from batch.quantity (supports fractional for custom-weight).
 * 6. Throws INSUFFICIENT_STOCK or CONCURRENT_STOCK_UPDATE.
 */
export async function processOrderStock(
  productId: string,
  storeId: string,
  orderQuantity: number,
  options?: { session?: ClientSession; productName?: string }
): Promise<void> {
  if (orderQuantity <= 0) return;

  // 1. Load product
  const product = await Product.findById(productId)
    .select("name hasExpiry inventoryBatches")
    .session(options?.session ?? null)
    .lean();

  if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");

  const pid = new mongoose.Types.ObjectId(productId);
  const sid = storeId.toString();
  const now = new Date();
  const hasExpiry = product.hasExpiry === true;
  const productName = options?.productName ?? product.name ?? "Product";
  const allBatches = (product.inventoryBatches ?? []) as unknown as BatchDoc[];

  // 2. Fetch batches for store
  // 3. Filter: quantity > 0; if hasExpiry then expiryDate > now
  const validBatches = allBatches.filter((b) => {
    if (b.store?.toString() !== sid) return false;
    const qty = Number(b.quantity) || 0;
    if (qty <= 0) return false;
    if (hasExpiry) {
      const expiry = b.expiryDate ? new Date(b.expiryDate) : null;
      if (!expiry || expiry <= now) return false;
    }
    return true;
  });

  // 4. Sort: hasExpiry ? expiryDate asc (FIFO) : createdAt asc
  if (hasExpiry) {
    validBatches.sort((a, b) => {
      const aExp = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
      const bExp = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
      return aExp - bExp;
    });
  } else {
    validBatches.sort((a, b) => {
      const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return aT - bT;
    });
  }

  const totalAvailable = validBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
  if (totalAvailable < orderQuantity) {
    throw new AppError(
      `${productName} does not have enough stock (requested: ${orderQuantity}, available: ${totalAvailable}).`,
      400,
      "INSUFFICIENT_STOCK"
    );
  }

  // 5. Deduct orderQuantity from batch.quantity (supports fractional)
  let remaining = orderQuantity;
  for (const batch of validBatches) {
    if (remaining <= 0) break;
    const batchQty = Number(batch.quantity) || 0;
    if (batchQty <= 0) continue;
    const take = Math.min(batchQty, remaining);
    const updated = await Product.findOneAndUpdate(
      {
        _id: pid,
        "inventoryBatches._id": batch._id,
        "inventoryBatches.quantity": { $gte: take },
      },
      { $inc: { "inventoryBatches.$.quantity": -take } },
      { new: false, session: options?.session ?? undefined }
    );
    if (!updated) {
      throw new AppError(
        "Stock was modified by another request. Please try again.",
        409,
        "CONCURRENT_STOCK_UPDATE"
      );
    }
    remaining -= take;
  }
}

export async function createOrder(
  userId: string,
  data: {
    items: Array<{ product: string; variant: string; quantity: number; price: number }>;
    totalAmount: number;
    address: {
      name: string;
      phone: string;
      address: string;
      city: string;
      pincode: string;
      landmark?: string;
    };
    paymentMethod: string;
  }
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { items, totalAmount, address, paymentMethod } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
      await session.abortTransaction();
      throw new AppError("Cart is empty", 400, "CART_EMPTY");
    }
    if (
      !address ||
      !address.name ||
      !address.phone ||
      !address.address ||
      !address.city ||
      !address.pincode
    ) {
      await session.abortTransaction();
      throw new AppError("Complete address is required", 400, "ADDRESS_REQUIRED");
    }
    if (!totalAmount || totalAmount <= 0) {
      await session.abortTransaction();
      throw new AppError("Invalid total amount", 400, "INVALID_TOTAL");
    }

    const productIds = items.map((item: any) => new mongoose.Types.ObjectId(item.product));
    const products = await Product.find({ _id: { $in: productIds } })
      .populate("category", "name")
      .select("name category inventoryBatches")
      .session(session);

    if (products.length !== items.length) {
      await session.abortTransaction();
      throw new AppError("Some products not found", 400, "PRODUCTS_NOT_FOUND");
    }

    const productVariantQty = new Map<
      string,
      { productId: mongoose.Types.ObjectId; variantId: mongoose.Types.ObjectId; quantity: number }
    >();
    for (const item of items) {
      const key = `${item.product}:${item.variant}`;
      const existing = productVariantQty.get(key);
      const qty = Number(item.quantity) || 0;
      if (qty <= 0) {
        await session.abortTransaction();
        throw new AppError("Invalid item quantity", 400, "INVALID_QUANTITY");
      }
      if (existing) {
        existing.quantity += qty;
      } else {
        productVariantQty.set(key, {
          productId: new mongoose.Types.ObjectId(item.product),
          variantId: new mongoose.Types.ObjectId(item.variant),
          quantity: qty,
        });
      }
    }

    const productIdToName = new Map(products.map((p: any) => [p._id.toString(), p.name]));
    const productById = new Map(products.map((p: any) => [p._id.toString(), p]));
    const now = new Date();

    type BatchAllocation = { productId: mongoose.Types.ObjectId; batchId: mongoose.Types.ObjectId; store: mongoose.Types.ObjectId; deduct: number };
    const allocationsToApply: BatchAllocation[] = [];
    const batchesUsedByKey = new Map<
      string,
      Array<{ store: mongoose.Types.ObjectId; quantityDeducted: number; batchId: mongoose.Types.ObjectId }>
    >();

    for (const [key, { productId, variantId, quantity }] of productVariantQty) {
      const product = productById.get(productId.toString());
      if (!product) {
        await session.abortTransaction();
        throw new AppError("Product not found", 400, "PRODUCTS_NOT_FOUND");
      }

      const batches = (product.inventoryBatches ?? []) as Array<{
        _id: mongoose.Types.ObjectId;
        store: mongoose.Types.ObjectId;
        variant: mongoose.Types.ObjectId;
        quantity: number;
        expiryDate: Date;
      }>;
      const validBatches = batches
        .filter(
          (b) =>
            b.variant?.toString() === variantId.toString() &&
            (Number(b.quantity) || 0) > 0 &&
            (b.expiryDate ? new Date(b.expiryDate) > now : false)
        )
        .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

      const totalAvailable = validBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
      if (totalAvailable < quantity) {
        await session.abortTransaction();
        const name = productIdToName.get(productId.toString()) || "Product";
        throw new AppError(
          `${name} does not have enough stock for the requested quantity (${quantity}). Please reduce quantity or remove the item.`,
          400,
          "INSUFFICIENT_STOCK"
        );
      }

      let remaining = quantity;
      const used: Array<{ store: mongoose.Types.ObjectId; quantityDeducted: number; batchId: mongoose.Types.ObjectId }> = [];
      for (const batch of validBatches) {
        if (remaining <= 0) break;
        const take = Math.min(Number(batch.quantity) || 0, remaining);
        if (take <= 0) continue;
        allocationsToApply.push({
          productId,
          batchId: batch._id,
          store: batch.store,
          deduct: take,
        });
        used.push({ store: batch.store, quantityDeducted: take, batchId: batch._id });
        remaining -= take;
      }
      batchesUsedByKey.set(key, used);
    }

    for (const { productId, batchId, deduct } of allocationsToApply) {
      const updated = await Product.findOneAndUpdate(
        {
          _id: productId,
          "inventoryBatches._id": batchId,
          "inventoryBatches.quantity": { $gte: deduct },
        },
        { $inc: { "inventoryBatches.$.quantity": -deduct } },
        { session, new: false }
      );
      if (!updated) {
        await session.abortTransaction();
        throw new AppError(
          "Stock was modified by another request. Please try again.",
          409,
          "CONCURRENT_STOCK_UPDATE"
        );
      }
    }

    const productCategoryMap = new Map();
    products.forEach((product: any) => {
      productCategoryMap.set(product._id.toString(), {
        categoryId: product.category._id,
        categoryName: product.category.name,
      });
    });

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
      if (!categoryInfo) throw new Error(`Category not found for product ${productId}`);
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

    const order = new Order({
      user: userId,
      items: items.map((item: any) => {
        const key = `${item.product}:${item.variant}`;
        const batchesUsed = batchesUsedByKey.get(key) ?? [];
        return {
          product: item.product,
          variant: item.variant,
          quantity: item.quantity,
          price: item.price,
          batchesUsed: batchesUsed.map((u) => ({
            store: u.store,
            quantityDeducted: u.quantityDeducted,
            batchId: u.batchId,
          })),
        };
      }),
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

    const subOrderIds: mongoose.Types.ObjectId[] = [];
    for (const [, group] of categoryGroups) {
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
    order.subOrders = subOrderIds;
    await order.save({ session });

    const cart = await Cart.findOne({ user: userId }).session(session);
    if (cart) {
      cart.items.splice(0, cart.items.length);
      await cart.save({ session });
    }

    await session.commitTransaction();

    return {
      message: "Order placed successfully",
      order: {
        _id: order._id,
        totalAmount: order.totalAmount,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        subOrdersCount: subOrderIds.length,
        createdAt: order.createdAt,
      },
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}

export async function getOrders(
  userId: string,
  params: { page: number; limit: number; skip: number }
): Promise<PaginatedResponse<any>> {
  const { page, limit, skip } = params;
  const filter = { user: userId };
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("items.product", "name images")
      .populate({
        path: "subOrders",
        populate: [
          { path: "category", select: "name" },
          { path: "deliveryBoyId", select: "name phone" },
        ],
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);
  return paginated(orders, total, page, limit);
}

export async function getOrderById(userId: string, orderId: string) {
  const order = await Order.findOne({ _id: orderId, user: userId })
    .populate("items.product", "name images")
    .populate({
      path: "subOrders",
      populate: [
        { path: "category", select: "name" },
        { path: "deliveryBoyId", select: "name phone" },
      ],
    });
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  return order;
}
