import { Request, Response } from "express";
import Address from "../models/Address";

interface AuthRequest extends Request {
  user?: any;
}

// ── GET /api/addresses ───────────────────────────────────────────────────────────
export const getAddresses = async (req: AuthRequest, res: Response) => {
  try {
    const addresses = await Address.find({ user: req.user._id }).sort({
      isDefault: -1,
      createdAt: -1,
    });

    res.json(addresses);
  } catch (err) {
    console.error("Get addresses error:", err);
    res.status(500).json({ message: "Failed to fetch addresses" });
  }
};

// ── POST /api/addresses ───────────────────────────────────────────────────────────
export const createAddress = async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, address, city, pincode, landmark, isDefault } = req.body;

    if (!name || !phone || !address || !city || !pincode) {
      return res.status(400).json({ message: "All required fields must be provided" });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await Address.updateMany(
        { user: req.user._id },
        { $set: { isDefault: false } }
      );
    }

    const newAddress = new Address({
      user: req.user._id,
      name,
      phone,
      address,
      city,
      pincode,
      landmark: landmark || "",
      isDefault: isDefault || false,
    });

    await newAddress.save();

    res.status(201).json(newAddress);
  } catch (err) {
    console.error("Create address error:", err);
    res.status(500).json({ message: "Failed to create address" });
  }
};

// ── PUT /api/addresses/:id ───────────────────────────────────────────────────────
export const updateAddress = async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, address, city, pincode, landmark, isDefault } = req.body;

    const addressDoc = await Address.findOne({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!addressDoc) {
      return res.status(404).json({ message: "Address not found" });
    }

    // If this is set as default, unset other defaults
    if (isDefault) {
      await Address.updateMany(
        { user: req.user._id, _id: { $ne: req.params.id } },
        { $set: { isDefault: false } }
      );
    }

    addressDoc.name = name || addressDoc.name;
    addressDoc.phone = phone || addressDoc.phone;
    addressDoc.address = address || addressDoc.address;
    addressDoc.city = city || addressDoc.city;
    addressDoc.pincode = pincode || addressDoc.pincode;
    addressDoc.landmark = landmark !== undefined ? landmark : addressDoc.landmark;
    addressDoc.isDefault = isDefault !== undefined ? isDefault : addressDoc.isDefault;

    await addressDoc.save();

    res.json(addressDoc);
  } catch (err) {
    console.error("Update address error:", err);
    res.status(500).json({ message: "Failed to update address" });
  }
};

// ── DELETE /api/addresses/:id ────────────────────────────────────────────────────
export const deleteAddress = async (req: AuthRequest, res: Response) => {
  try {
    const address = await Address.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });

    if (!address) {
      return res.status(404).json({ message: "Address not found" });
    }

    res.json({ message: "Address deleted successfully" });
  } catch (err) {
    console.error("Delete address error:", err);
    res.status(500).json({ message: "Failed to delete address" });
  }
};

