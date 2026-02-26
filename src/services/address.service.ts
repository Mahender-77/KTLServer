import Address from "../models/Address";
import { AppError } from "../utils/AppError";

export async function getAddresses(userId: string) {
  return Address.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 });
}

export async function createAddress(userId: string, data: any) {
  const { name, phone, address, city, pincode, landmark, isDefault } = data;
  if (!name || !phone || !address || !city || !pincode) {
    throw new AppError("All required fields must be provided", 400, "ADDRESS_FIELDS_REQUIRED");
  }
  if (isDefault) {
    await Address.updateMany({ user: userId }, { $set: { isDefault: false } });
  }
  const newAddress = new Address({
    user: userId,
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

export async function updateAddress(userId: string, addressId: string, data: any) {
  const addressDoc = await Address.findOne({ _id: addressId, user: userId });
  if (!addressDoc) throw new AppError("Address not found", 404, "ADDRESS_NOT_FOUND");
  if (data.isDefault) {
    await Address.updateMany(
      { user: userId, _id: { $ne: addressId } },
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

export async function deleteAddress(userId: string, addressId: string) {
  const address = await Address.findOneAndDelete({ _id: addressId, user: userId });
  if (!address) throw new AppError("Address not found", 404, "ADDRESS_NOT_FOUND");
  return { message: "Address deleted successfully" };
}
