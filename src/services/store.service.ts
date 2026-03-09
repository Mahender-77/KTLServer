import Store from "../models/Store";
import { paginated, PaginatedResponse } from "../utils/pagination";

export async function createStore(data: {
  name: string;
  address: string;
  city: string;
  lat?: number;
  lng?: number;
  deliveryFee?: number;
}) {
  const { name, address, city, lat, lng, deliveryFee } = data;
  const store = await Store.create({
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
}): Promise<PaginatedResponse<any>> {
  const { page, limit, skip } = params;
  const [stores, total] = await Promise.all([
    Store.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Store.countDocuments(),
  ]);
  return paginated(stores, total, page, limit);
}

// Public-facing: minimal store info (for apps to compute delivery fee etc.)
export async function getPublicStores() {
  return Store.find({ isActive: true })
    .select("name city deliveryFee location")
    .sort({ createdAt: -1 })
    .lean();
}

export async function updateStore(
  id: string,
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
  const store = await Store.findByIdAndUpdate(id, update, { new: true });
  return store;
}

export async function deleteStore(id: string) {
  await Store.findByIdAndDelete(id);
  return { message: "Store deleted" };
}
