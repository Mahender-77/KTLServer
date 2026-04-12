import mongoose, { ClientSession } from "mongoose";
import Product from "../models/Product";
import Inventory from "../models/Inventory";
import { tenantWhereClause } from "../utils/tenantScope";
import { paginated, PaginatedResponse } from "../utils/pagination";
import { AppError } from "../utils/AppError";
import { appendAuditLog, appendAuditLogSafe } from "./auditLog.service";

function sumBatchQuantities(product: { inventoryBatches?: Array<{ quantity?: number }> } | null): number {
  const batches = product?.inventoryBatches ?? [];
  return batches.reduce((s, b) => s + (Number(b.quantity) || 0), 0);
}

/**
 * Recomputes rollup `quantity` from embedded batches and upserts the Inventory row.
 */
export async function syncInventoryFromProduct(
  productId: mongoose.Types.ObjectId | string,
  organizationId: string,
  session?: ClientSession
): Promise<{ quantity: number; lowStockThreshold: number; productId: string }> {
  const pid = typeof productId === "string" ? productId : productId.toString();
  const p = await Product.findOne({ _id: pid, ...tenantWhereClause(organizationId) })
    .select("inventoryBatches")
    .session(session ?? null)
    .lean();
  if (!p) {
    throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }
  const total = sumBatchQuantities(p as { inventoryBatches?: Array<{ quantity?: number }> });
  const oid = new mongoose.Types.ObjectId(organizationId);
  const prodOid = new mongoose.Types.ObjectId(pid);

  await Inventory.findOneAndUpdate(
    { organizationId: oid, productId: prodOid },
    {
      $set: { quantity: total, lastUpdated: new Date() },
      $setOnInsert: { lowStockThreshold: 0 },
    },
    { upsert: true, session }
  );

  const inv = await Inventory.findOne({ organizationId: oid, productId: prodOid })
    .session(session ?? null)
    .lean();
  const threshold = Number(inv?.lowStockThreshold) || 0;

  return { quantity: total, lowStockThreshold: threshold, productId: pid };
}

/**
 * After stock changes, if at or below reorder threshold, append a domain audit entry (REQ-18).
 */
export async function maybeLogLowStock(params: {
  organizationId: string;
  userId?: string | null;
  productId: string;
  quantity: number;
  lowStockThreshold: number;
  session?: ClientSession;
}): Promise<void> {
  const { organizationId, userId, productId, quantity, lowStockThreshold, session } = params;
  if (lowStockThreshold <= 0) return;
  if (quantity > lowStockThreshold) return;
  await appendAuditLog(
    {
      organizationId,
      userId,
      action: "inventory.low_stock",
      metadata: {
        productId,
        quantity,
        lowStockThreshold,
      },
    },
    session
  );
}

export async function listInventory(params: {
  organizationId: string;
  page: number;
  limit: number;
  skip: number;
}): Promise<
  PaginatedResponse<{
    _id: string;
    productId: string;
    productName: string | null;
    quantity: number;
    lowStockThreshold: number;
    lastUpdated: Date;
  }>
> {
  const { organizationId, page, limit, skip } = params;
  const oid = new mongoose.Types.ObjectId(organizationId);
  const filter = { organizationId: oid };

  const [rows, total] = await Promise.all([
    Inventory.find(filter)
      .populate("productId", "name")
      .sort({ lastUpdated: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Inventory.countDocuments(filter),
  ]);

  const data = rows.map((r) => {
    const pop = r.productId as { _id?: unknown; name?: string } | null;
    return {
      _id: String(r._id),
      productId: pop?._id ? String(pop._id) : String(r.productId),
      productName: pop?.name ?? null,
      quantity: Number(r.quantity) || 0,
      lowStockThreshold: Number(r.lowStockThreshold) || 0,
      lastUpdated: r.lastUpdated,
    };
  });

  return paginated(data, total, page, limit);
}

export async function patchLowStockThreshold(
  productId: string,
  organizationId: string,
  lowStockThreshold: number,
  actorUserId?: string
): Promise<{ productId: string; lowStockThreshold: number }> {
  if (!mongoose.isValidObjectId(productId)) {
    throw new AppError("Invalid product id", 400, "INVALID_ID");
  }
  const oid = new mongoose.Types.ObjectId(organizationId);
  const pid = new mongoose.Types.ObjectId(productId);

  const product = await Product.findOne({ _id: pid, ...tenantWhereClause(organizationId) })
    .select("_id")
    .lean();
  if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");

  await syncInventoryFromProduct(pid, organizationId);

  const inv = await Inventory.findOneAndUpdate(
    { organizationId: oid, productId: pid },
    { $set: { lowStockThreshold } },
    { new: true }
  ).lean();

  await appendAuditLogSafe({
    organizationId,
    userId: actorUserId ?? null,
    action: "inventory.threshold_updated",
    metadata: { productId, lowStockThreshold: Number(inv?.lowStockThreshold) ?? lowStockThreshold },
  });

  return {
    productId,
    lowStockThreshold: Number(inv?.lowStockThreshold) ?? lowStockThreshold,
  };
}
