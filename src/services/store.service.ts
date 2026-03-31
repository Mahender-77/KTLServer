import Store from "../models/Store";
import { paginated, PaginatedResponse } from "../utils/pagination";
import { tenantWhereClause } from "../utils/tenantScope";
import { AppError } from "../utils/AppError";
import { tenantFilterFromActor } from "../utils/tenantFilter";

export async function createStore(
  organizationId: string,
  data: {
    name: string;
    address: string;
    city: string;
    lat?: number;
    lng?: number;
    deliveryFee?: number;
  }
) {
  const { name, address, city, lat, lng, deliveryFee } = data;
  const store = await Store.create({
    organizationId,
    name,
    address,
    city,
    location: { lat, lng },
    deliveryFee: deliveryFee != null ? Number(deliveryFee) : undefined,
  });
  return store;
}

export async function getStores(params: {
  page: number;
  limit: number;
  skip: number;
  organizationId: string;
  isSuperAdmin?: boolean;
}): Promise<PaginatedResponse<any>> {
  const { page, limit, skip, organizationId, isSuperAdmin } = params;
  const filter = tenantFilterFromActor({
    organizationId,
    isSuperAdmin: isSuperAdmin === true,
  });
  const [stores, total] = await Promise.all([
    Store.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Store.countDocuments(filter),
  ]);
  return paginated(stores, total, page, limit);
}

// Public-facing: minimal store info (for apps to compute delivery fee etc.)
export async function getPublicStores(organizationId: string) {
  const filter = { ...tenantWhereClause(organizationId), isActive: true };
  return Store.find(filter)
    .select("name city deliveryFee location")
    .sort({ createdAt: -1 })
    .lean();
}

export async function updateStore(
  id: string,
  organizationId: string,
  data: {
    name?: string;
    address?: string;
    city?: string;
    lat?: number;
    lng?: number;
    deliveryFee?: number;
  }
) {
  const update: any = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.address !== undefined) update.address = data.address;
  if (data.city !== undefined) update.city = data.city;
  if (data.lat !== undefined || data.lng !== undefined) {
    update.location = {
      lat: data.lat,
      lng: data.lng,
    };
  }
  if (data.deliveryFee !== undefined) {
    update.deliveryFee = Number(data.deliveryFee);
  }
  const store = await Store.findOneAndUpdate(
    { _id: id, ...tenantWhereClause(organizationId) },
    update,
    { new: true }
  );
  if (!store) {
    throw new AppError("Store not found", 404, "STORE_NOT_FOUND");
  }
  return store;
}

export async function deleteStore(id: string, organizationId: string) {
  const result = await Store.deleteOne({ _id: id, ...tenantWhereClause(organizationId) });
  if (!result.deletedCount || result.deletedCount === 0) {
    throw new AppError("Store not found", 404, "STORE_NOT_FOUND");
  }
  return { message: "Store deleted" };
}
