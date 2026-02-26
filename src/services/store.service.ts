import Store from "../models/Store";
import { paginated, PaginatedResponse } from "../utils/pagination";

export async function createStore(data: {
  name: string;
  address: string;
  city: string;
  lat?: number;
  lng?: number;
}) {
  const { name, address, city, lat, lng } = data;
  const store = await Store.create({
    name,
    address,
    city,
    location: { lat, lng },
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

export async function deleteStore(id: string) {
  await Store.findByIdAndDelete(id);
  return { message: "Store deleted" };
}
