import Order from "../models/Order";
import Cart from "../models/Cart";
import Product from "../models/Product";
import SubOrder from "../models/SubOrder";
import mongoose, { ClientSession } from "mongoose";
import { paginated, PaginatedResponse } from "../utils/pagination";
import { AppError } from "../utils/AppError";
import { ROLES } from "../constants/roles";
import type { RequestActor } from "../types/access";
import { qualifiesForDealOfTheDay, DEAL_DISCOUNT_PERCENT } from "./product.service";
import { andWithTenant, tenantWhereClause, tenantScopedIdFilter } from "../utils/tenantScope";
import { tenantFilterFromActor } from "../utils/tenantFilter";

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
  organizationId: string,
  options?: { session?: ClientSession; productName?: string }
): Promise<void> {
  if (orderQuantity <= 0) return;

  // 1. Load product
  const product = await Product.findOne({
    _id: productId,
    ...tenantWhereClause(organizationId),
  })
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
        ...tenantWhereClause(organizationId),
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
  actor: RequestActor,
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
    const userId = actor.userId;
    const organizationId = actor.organizationId;
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
    const products = await Product.find({
      _id: { $in: productIds },
      ...tenantWhereClause(organizationId),
    })
      .populate("category", "name")
      .select("name category inventoryBatches variants pricingMode pricePerUnit hasExpiry organizationId")
      .session(session)
      .lean();

    if (products.length !== items.length) {
      await session.abortTransaction();
      throw new AppError("Some products not found", 400, "PRODUCTS_NOT_FOUND");
    }

    const productById = new Map(products.map((p: any) => [p._id.toString(), p]));

    // Recompute prices server-side (honors Deal of the Day 5% discount)
    const itemPrices = new Map<string, number>();
    for (const item of items) {
      const product = productById.get(item.product.toString());
      if (!product) continue;
      const variant = (product.variants ?? []).find(
        (v: any) => v._id?.toString() === item.variant.toString()
      );
      // Use original price when offer price is missing or zero
      let price = variant
        ? ((variant.offerPrice != null && variant.offerPrice > 0) ? variant.offerPrice : (variant.price ?? 0))
        : (Number(product.pricePerUnit) || 0);
      if (qualifiesForDealOfTheDay(product)) {
        price = price * (1 - DEAL_DISCOUNT_PERCENT / 100);
      }
      itemPrices.set(`${item.product}:${item.variant}`, price);
    }

    // Replace client prices with server-computed prices
    const itemsWithServerPrice = items.map((item: any) => ({
      ...item,
      price: itemPrices.get(`${item.product}:${item.variant}`) ?? item.price,
    }));

    const serverSubtotal = itemsWithServerPrice.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0
    );
    const deliveryFee = serverSubtotal > 500 ? 0 : 40;
    const serverTotalAmount = serverSubtotal + deliveryFee;

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
    const now = new Date();

    type BatchAllocation = { productId: mongoose.Types.ObjectId; batchId: mongoose.Types.ObjectId; store: mongoose.Types.ObjectId; deduct: number };
    const allocationsToApply: BatchAllocation[] = [];
    const batchesUsedByKey = new Map<
      string,
      Array<{ store: mongoose.Types.ObjectId; quantityDeducted: number; batchId: mongoose.Types.ObjectId }>
    >();

    for (const [key, { productId, variantId, quantity }] of productVariantQty) {
      const product = productById.get(productId.toString()) as any;
      if (!product) {
        await session.abortTransaction();
        throw new AppError("Product not found", 400, "PRODUCTS_NOT_FOUND");
      }

      const pricingMode = product.pricingMode ?? "unit";
      const hasExpiry = product.hasExpiry === true;
      const isFixedPricing = pricingMode === "fixed";

      const batches = (product.inventoryBatches ?? []) as Array<{
        _id: mongoose.Types.ObjectId;
        store: mongoose.Types.ObjectId;
        variant?: mongoose.Types.ObjectId;
        quantity: number;
        expiryDate?: Date;
        createdAt?: Date;
      }>;

      const validBatches = batches
        .filter((b) => {
          const qty = Number(b.quantity) || 0;
          if (qty <= 0) return false;
          // Expiry: include batch if no expiry OR expiry is in future
          if (hasExpiry && b.expiryDate) {
            if (new Date(b.expiryDate) <= now) return false;
          }
          // Variant: for fixed pricing, batch must match variant; for unit/custom-weight, variantId is productId, batches may not have variant
          if (isFixedPricing) {
            if (b.variant?.toString() !== variantId.toString()) return false;
          } else {
            if (b.variant != null && b.variant.toString() !== variantId.toString()) return false;
          }
          return true;
        })
        .sort((a, b) => {
          if (hasExpiry && a.expiryDate && b.expiryDate) {
            return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
          }
          const aT = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const bT = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return aT - bT;
        });

      const totalAvailable = validBatches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
      if (validBatches.length > 0 && totalAvailable < quantity) {
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
          ...tenantWhereClause(organizationId),
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

    itemsWithServerPrice.forEach((item: any) => {
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
      organizationId,
      user: userId,
      items: itemsWithServerPrice.map((item: any) => {
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
      totalAmount: serverTotalAmount,
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
        organizationId,
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

    const cart = await Cart.findOne({
      user: userId,
      ...tenantWhereClause(organizationId),
    }).session(session);
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
  actor: RequestActor,
  params: { page: number; limit: number; skip: number }
): Promise<PaginatedResponse<any>> {
  const { page, limit, skip } = params;
  const base = tenantFilterFromActor({
    organizationId: actor.organizationId,
    isSuperAdmin: false,
  });
  const filter =
    actor.role === ROLES.ADMIN ? base : { ...base, user: actor.userId };
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

async function loadOrderDetailById(orderId: string, organizationId: string) {
  return Order.findOne({
    ...tenantScopedIdFilter(organizationId, orderId),
  })
    .populate("items.product", "name images")
    .populate({
      path: "subOrders",
      populate: [
        { path: "category", select: "name" },
        { path: "deliveryBoyId", select: "name phone" },
      ],
    });
}

/**
 * Single order for non-admin routes: owner, admin (full), or delivery (assigned to a suborder).
 */
export async function getOrderById(actor: RequestActor, orderId: string) {
  const stub = await Order.findOne(tenantScopedIdFilter(actor.organizationId, orderId))
    .select("_id user organizationId")
    .lean();
  if (!stub) {
    throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  if (actor.role === ROLES.ADMIN) {
    const order = await loadOrderDetailById(orderId, actor.organizationId);
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    return order;
  }

  const ownerId = stub.user?.toString?.() ?? String(stub.user);
  if (ownerId === actor.userId) {
    const order = await loadOrderDetailById(orderId, actor.organizationId);
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    return order;
  }

  if (actor.role === ROLES.DELIVERY) {
    const assigned = await SubOrder.exists(
      andWithTenant(actor.organizationId, {
        order: orderId,
        deliveryBoyId: actor.userId,
      })
    );
    if (!assigned) {
      throw new AppError("You do not have access to this order", 403, "ORDER_ACCESS_DENIED");
    }
    const order = await loadOrderDetailById(orderId, actor.organizationId);
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    return order;
  }

  throw new AppError("You do not have access to this order", 403, "ORDER_ACCESS_DENIED");
}

/** Admin: get all orders with user + delivery info */
export async function getOrdersForAdmin(params: {
  page: number;
  limit: number;
  skip: number;
  status?: string;
  paymentStatus?: string;
  organizationId: string;
  isSuperAdmin?: boolean;
}): Promise<PaginatedResponse<any>> {
  const { page, limit, skip, status, paymentStatus, organizationId } = params;
  const filter: Record<string, unknown> = tenantFilterFromActor({
    organizationId,
    isSuperAdmin: false,
  });
  if (status && status !== "all") filter.orderStatus = status;
  if (paymentStatus && paymentStatus !== "all") filter.paymentStatus = paymentStatus;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("user", "name email phone")
      .populate("deliveryPerson", "name email phone")
      .populate("items.product", "name images")
      .populate({
        path: "subOrders",
        populate: [
          { path: "category", select: "name" },
          { path: "deliveryBoyId", select: "name email phone" },
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

/** Admin: get single order by ID with full details */
export async function getOrderByIdForAdmin(
  orderId: string,
  organizationId: string
) {
  const order = await Order.findOne({ _id: orderId, ...tenantWhereClause(organizationId) })
    .populate("user", "name email phone")
    .populate("deliveryPerson", "name email phone")
    .populate("items.product", "name images variants")
    .populate({
      path: "subOrders",
      populate: [
        { path: "category", select: "name" },
        { path: "deliveryBoyId", select: "name email phone" },
      ],
    })
    .lean();
  if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  return order;
}
