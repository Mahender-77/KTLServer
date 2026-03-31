import Address from "../models/Address";
import { AppError } from "../utils/AppError";
import { ROLES } from "../constants/roles";
import type { RequestActor } from "../types/access";
import { assertOwnerOrAdmin } from "./resourceAccess";
import { tenantWhereClause, tenantScopedIdFilter } from "../utils/tenantScope";

export async function getAddresses(actor: RequestActor) {
  const base = tenantWhereClause(actor.organizationId);
  const filter =
    actor.role === ROLES.ADMIN ? base : { ...base, user: actor.userId };
  return Address.find(filter).sort({ isDefault: -1, createdAt: -1 });
}

export async function createAddress(actor: RequestActor, data: any) {
  const { name, phone, address, city, pincode, landmark, isDefault } = data;
  if (!name || !phone || !address || !city || !pincode) {
    throw new AppError("All required fields must be provided", 400, "ADDRESS_FIELDS_REQUIRED");
  }
  if (isDefault) {
    await Address.updateMany(
      { user: actor.userId, ...tenantWhereClause(actor.organizationId) },
      { $set: { isDefault: false } }
    );
  }
  const newAddress = new Address({
    organizationId: actor.organizationId,
    user: actor.userId,
    name,
    phone,
    address,
    city,
    pincode,
    landmark: landmark || "",
    isDefault: isDefault || false,
  });
  await newAddress.save();
  return newAddress;
}

export async function updateAddress(actor: RequestActor, addressId: string, data: any) {
  const addressDoc = await Address.findOne(
    tenantScopedIdFilter(actor.organizationId, addressId)
  );
  if (!addressDoc) throw new AppError("Address not found", 404, "ADDRESS_NOT_FOUND");
  assertOwnerOrAdmin(actor, addressDoc.user.toString(), "ADDRESS_ACCESS_DENIED");
  const ownerId = addressDoc.user.toString();
  if (data.isDefault) {
    await Address.updateMany(
      { user: ownerId, _id: { $ne: addressId }, ...tenantWhereClause(actor.organizationId) },
      { $set: { isDefault: false } }
    );
  }
  addressDoc.name = data.name || addressDoc.name;
  addressDoc.phone = data.phone || addressDoc.phone;
  addressDoc.address = data.address || addressDoc.address;
  addressDoc.city = data.city || addressDoc.city;
  addressDoc.pincode = data.pincode || addressDoc.pincode;
  if (data.landmark !== undefined) addressDoc.landmark = data.landmark;
  if (data.isDefault !== undefined) addressDoc.isDefault = data.isDefault;
  await addressDoc.save();
  return addressDoc;
}

export async function deleteAddress(actor: RequestActor, addressId: string) {
  const address = await Address.findOne(tenantScopedIdFilter(actor.organizationId, addressId));
  if (!address) throw new AppError("Address not found", 404, "ADDRESS_NOT_FOUND");
  assertOwnerOrAdmin(actor, address.user.toString(), "ADDRESS_ACCESS_DENIED");
  await Address.deleteOne(tenantScopedIdFilter(actor.organizationId, addressId));
  return { message: "Address deleted successfully" };
}
