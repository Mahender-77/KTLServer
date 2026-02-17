import { Request, Response } from "express";
import Store from "../models/Store";

// CREATE STORE
export const createStore = async (req: Request, res: Response) => {
  try {
    const { name, address, city, lat, lng } = req.body;

    const store = await Store.create({
      name,
      address,
      city,
      location: {
        lat,
        lng,
      },
    });

    res.status(201).json(store);
  } catch (error) {
    console.error("Create Store Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// GET ALL STORES
export const getStores = async (_req: Request, res: Response) => {
  try {
    const stores = await Store.find().sort({ createdAt: -1 });
    res.json(stores);
  } catch {
    res.status(500).json({ message: "Server Error" });
  }
};

// DELETE STORE
export const deleteStore = async (req: Request, res: Response) => {
  try {
    await Store.findByIdAndDelete(req.params.id);
    res.json({ message: "Store deleted" });
  } catch {
    res.status(500).json({ message: "Server Error" });
  }
};
