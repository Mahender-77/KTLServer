import Order from "../models/Order.js";
import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import SubOrder from "../models/SubOrder.js";
import mongoose, { ClientSession } from "mongoose";
import { paginated, PaginatedResponse } from "../utils/pagination.js";
import { AppError } from "../utils/AppError.js";
import { ROLES } from "../constants/roles.js";
import type { RequestActor } from "../types/access.js";
import { qualifiesForDealOfTheDay, DEAL_DISCOUNT_PERCENT } from "./product.service.js";
import { andWithTenant, tenantWhereClause, tenantScopedIdFilter } from "../utils/tenantScope.js";
import { tenantFilterFromActor } from "../utils/tenantFilter.js";
import { syncInventoryFromProduct, maybeLogLowStock } from "./inventory.service.js";
import { appendAuditLog } from "./auditLog.service.js";
import { logger } from "../utils/logger.js";

type BatchDoc = {
  _id: mongoose.Types.ObjectId;
  store: mongoose.Types.ObjectId;
  variant?: mongoose.Types.ObjectId;
  quantity: number;
  expiryDate?: Date;
  createdAt?: Date;
};

export async function processOrderStock(
  productId: string,
  storeId: string,
  orderQuantity: number,
  organizationId: string,
  options?: { session?: ClientSession; productName?: string }
): Promise<void> {
  if (orderQuantity <= 0) return;

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
      { returnDocument: "before", session: options?.session ?? undefined }
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
    const buyerOrganizationId = actor.organizationId;
    const { items, totalAmount, address, paymentMethod } = data;

    if (!items || !Array.isArray(items) || items.length === 0) {
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
      throw new AppError("Complete address is required", 400, "ADDRESS_REQUIRED");
    }
    if (!totalAmount || totalAmount <= 0) {
      throw new AppError("Invalid total amount", 400, "INVALID_TOTAL");
    }

    const productIds = items.map((item: any) => new mongoose.Types.ObjectId(item.product));
    const products = await Product.find({
      _id: { $in: productIds },
      isActive: { $ne: false },
    })
      .populate("category", "name")
      .select("name category inventoryBatches variants pricingMode pricePerUnit hasExpiry organizationId")
      .session(session)
      .lean();

    const distinctProductIds = new Set(items.map((item: any) => String(item.product)));
    if (products.length !== distinctProductIds.size) {
      throw new AppError("Some products not found", 400, "PRODUCTS_NOT_FOUND");
    }

    const productById = new Map(products.map((p: any) => [p._id.toString(), p]));
    const sellerOrgByProductId = new Map<string, string>();
    for (const p of products as any[]) {
      const sid = p.organizationId != null ? String(p.organizationId) : "";
      if (!sid) {
        throw new AppError("Some products not found", 400, "PRODUCTS_NOT_FOUND");
      }
      sellerOrgByProductId.set(p._id.toString(), sid);
    }

    const uniqueSellerOrgIds = [
      ...new Set(items.map((item: any) => sellerOrgByProductId.get(String(item.product))).filter(Boolean)),
    ] as string[];
    if (uniqueSellerOrgIds.length !== 1) {
      throw new AppError(
        "Cart contains products from multiple organizations. Please order from one store at a time.",
        400,
        "MULTI_ORG_CART_NOT_ALLOWED"
      );
    }

    // ✅ CRITICAL: always use the SELLER's org (from the product),
    // never the buyer's org. This ensures admin queries match correctly.
    const sellerOrganizationId = uniqueSellerOrgIds[0];

    logger.info("[order/create] tenant routing", {
      buyerUserId: userId,
      buyerOrganizationId,
      sellerOrganizationId,
      itemsCount: items.length,
    });

    const itemPrices = new Map<string, number>();
    for (const item of items) {
      const product = productById.get(item.product.toString());
      if (!product) continue;
      const variant = (product.variants ?? []).find(
        (v: any) => v._id?.toString() === item.variant.toString()
      );
      let price = variant
        ? ((variant.offerPrice != null && variant.offerPrice > 0) ? variant.offerPrice : (variant.price ?? 0))
        : (Number(product.pricePerUnit) || 0);
      if (qualifiesForDealOfTheDay(product)) {
        price = price * (1 - DEAL_DISCOUNT_PERCENT / 100);
      }
      itemPrices.set(`${item.product}:${item.variant}`, price);
    }

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

    type BatchAllocation = {
      productId: mongoose.Types.ObjectId;
      batchId: mongoose.Types.ObjectId;
      store: mongoose.Types.ObjectId;
      deduct: number;
    };
    const allocationsToApply: BatchAllocation[] = [];
    const batchesUsedByKey = new Map<
      string,
      Array<{ store: mongoose.Types.ObjectId; quantityDeducted: number; batchId: mongoose.Types.ObjectId }>
    >();

    for (const [key, { productId, variantId, quantity }] of productVariantQty) {
      const product = productById.get(productId.toString()) as any;
      if (!product) {
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
          if (hasExpiry && b.expiryDate) {
            if (new Date(b.expiryDate) <= now) return false;
          }
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
        const name = productIdToName.get(productId.toString()) || "Product";
        throw new AppError(
          `${name} does not have enough stock for the requested quantity (${quantity}). Please reduce quantity or remove the item.`,
          400,
          "INSUFFICIENT_STOCK"
        );
      }

      let remaining = quantity;
      const used: Array<{
        store: mongoose.Types.ObjectId;
        quantityDeducted: number;
        batchId: mongoose.Types.ObjectId;
      }> = [];
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
      const sellerOrgId = sellerOrgByProductId.get(productId.toString());
      if (!sellerOrgId) {
        throw new AppError("Some products not found", 400, "PRODUCTS_NOT_FOUND");
      }
      const updated = await Product.findOneAndUpdate(
        {
          _id: productId,
          ...tenantWhereClause(sellerOrgId),
          "inventoryBatches._id": batchId,
          "inventoryBatches.quantity": { $gte: deduct },
        },
        { $inc: { "inventoryBatches.$.quantity": -deduct } },
        { session, returnDocument: "before" }
      );
      if (!updated) {
        throw new AppError(
          "Stock was modified by another request. Please try again.",
          409,
          "CONCURRENT_STOCK_UPDATE"
        );
      }
    }

    const uniqueProductIds = [...new Set(items.map((it: { product: unknown }) => String(it.product)))];
    for (const pidStr of uniqueProductIds) {
      const sellerOrgId = sellerOrgByProductId.get(pidStr);
      if (!sellerOrgId) {
        throw new AppError("Some products not found", 400, "PRODUCTS_NOT_FOUND");
      }
      const synced = await syncInventoryFromProduct(pidStr, sellerOrgId, session);
      await maybeLogLowStock({
        organizationId: sellerOrgId,
        userId,
        productId: synced.productId,
        quantity: synced.quantity,
        lowStockThreshold: synced.lowStockThreshold,
        session,
      });
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

    // ✅ Save order with SELLER's org — this is what the admin queries against
    const order = new Order({
      organizationId: new mongoose.Types.ObjectId(sellerOrganizationId),
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
        organizationId: new mongoose.Types.ObjectId(sellerOrganizationId),
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

    await Cart.updateMany({ user: userId }, { $set: { items: [] } }).session(session);

    await appendAuditLog(
      {
        organizationId: sellerOrganizationId,
        userId,
        action: "order.placed",
        metadata: {
          orderId: order._id.toString(),
          totalAmount: serverTotalAmount,
          itemCount: items.length,
        },
      },
      session
    );

    await session.commitTransaction();

    return {
      message: "Order placed successfully",
      order: {
        _id: order._id,
        organizationId: String(order.organizationId),
        totalAmount: order.totalAmount,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        subOrdersCount: subOrderIds.length,
        createdAt: order.createdAt,
      },
    };
  } catch (err) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
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
  // Buyer orders are created under seller org for admin tenancy. For customer
  // "my orders", always filter by owner userId regardless of organizationId.
  const filter = actor.role === ROLES.ADMIN ? base : { user: actor.userId };
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

export async function getMyOrders(
  actor: RequestActor,
  params: { page: number; limit: number; skip: number }
): Promise<PaginatedResponse<any>> {
  const { page, limit, skip } = params;
  const filter = { user: actor.userId };
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

  // ✅ Cast to ObjectId — string vs ObjectId mismatch returns 0 results
  const filter: Record<string, unknown> = {};
  if (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) {
    filter.organizationId = new mongoose.Types.ObjectId(organizationId);
  }

  if (status && status !== "all") filter.orderStatus = status;
  if (paymentStatus && paymentStatus !== "all") filter.paymentStatus = paymentStatus;

  logger.info("[orders/admin] db filter", {
    organizationId,
    status: status ?? "all",
    paymentStatus: paymentStatus ?? "all",
    page,
    limit,
    skip,
    filter,
  });

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("user", "name email phone")
      .populate("deliveryPerson", "name email phone")
      .populate("deliveryBoy", "name email phone")
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

  logger.info("[orders/admin] db result", {
    organizationId,
    matched: total,
    returned: orders.length,
    firstOrderId: orders[0]?._id ? String(orders[0]._id) : null,
  });

  return paginated(orders, total, page, limit);
}

/** Admin: get single order by ID with full details */
export async function getOrderByIdForAdmin(
  orderId: string,
  organizationId: string
) {
  const order = await Order.findOne({
    _id: orderId,
    ...tenantWhereClause(organizationId),
  })
    .populate("user", "name email phone")
    .populate("deliveryPerson", "name email phone")
    .populate("deliveryBoy", "name email phone")
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

export async function updateOrderStatusForAdmin(
  orderId: string,
  status: "confirmed" | "out_for_delivery" | "delivered" | "cancelled",
  organizationId: string
) {
  const dbOrderStatus: "placed" | "shipped" | "delivered" | "cancelled" =
    status === "out_for_delivery"
      ? "shipped"
      : status === "confirmed"
        ? "placed"
        : status;

  const updatedOrder = await Order.findOneAndUpdate(
    { _id: orderId, ...tenantWhereClause(organizationId) },
    { $set: { orderStatus: dbOrderStatus } },
    { returnDocument: "after" }
  )
    .select("_id user deliveryBoy orderStatus totalAmount")
    .lean();

  if (!updatedOrder) {
    throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const buyerId = updatedOrder.user?.toString?.() ?? String(updatedOrder.user ?? "");
  if (!buyerId) {
    throw new AppError("Order buyer not found", 400, "ORDER_BUYER_NOT_FOUND");
  }

  return {
    orderId: updatedOrder._id.toString(),
    buyerId,
    order: updatedOrder,
  };
}