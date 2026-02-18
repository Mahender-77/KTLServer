import { Request, Response } from "express";
import Product from "../models/Product";
import slugify from "slugify";
import mongoose from "mongoose";

// CREATE PRODUCT

export const createProduct = async (req: Request, res: Response) => {
  try {
    console.log("=== CREATE PRODUCT REQUEST ===");
    console.log("Body:", JSON.stringify(req.body, null, 2));
    console.log("File:", JSON.stringify(req.file, null, 2));

    if (!req.body) {
      return res.status(400).json({ message: "Invalid request body" });
    }

    const { name, description, category } = req.body;

    // Parse variants
    let variants;
    try {
      variants =
        typeof req.body.variants === "string"
          ? JSON.parse(req.body.variants)
          : req.body.variants;
      console.log("Parsed variants:", JSON.stringify(variants, null, 2));
    } catch (error) {
      console.error("Failed to parse variants:", error);
      return res.status(400).json({ message: "Invalid variants format" });
    }

    // Parse inventory
    let inventory;
    try {
      inventory =
        typeof req.body.inventory === "string"
          ? JSON.parse(req.body.inventory)
          : req.body.inventory;
      console.log("Parsed inventory:", JSON.stringify(inventory, null, 2));
    } catch (error) {
      console.error("Failed to parse inventory:", error);
      return res.status(400).json({ message: "Invalid inventory format" });
    }

    // Validation
    if (!name || !category || !variants || variants.length === 0) {
      console.error("Validation failed:", { name, category, variants });
      return res.status(400).json({ message: "Missing required fields" });
    }

    const slug = slugify(name, { lower: true });
    console.log("Generated slug:", slug);

    const exists = await Product.findOne({ slug });
    if (exists) {
      return res.status(400).json({ message: "Product already exists" });
    }

    const imageUrl = req.file ? (req.file as any).path : null;
    console.log("Image URL:", imageUrl);

    const product = new Product({
      name,
      slug,
      description,
      category,
      images: imageUrl ? [imageUrl] : [],
      variants,
      inventory: [],
    });

    await product.save();
    console.log("Product saved with ID:", product._id);

    // Now handle inventory
    if (Array.isArray(inventory) && inventory.length > 0) {
      try {
        const updatedInventory = inventory.map(
          (item: { store: string; variantIndex: number; quantity: number }) => {
            console.log(
              "Processing inventory item:",
              JSON.stringify(item, null, 2),
            );
            const variant = product.variants[item.variantIndex];

            if (!variant?._id) {
              throw new Error(`Invalid variant index: ${item.variantIndex}`);
            }

            return {
              store: new mongoose.Types.ObjectId(item.store),
              variant: variant._id,
              quantity: item.quantity,
            };
          },
        );

        console.log(
          "Updated inventory:",
          JSON.stringify(updatedInventory, null, 2),
        );
        product.inventory = updatedInventory;
        await product.save();
        console.log("Inventory saved successfully");
      } catch (invError) {
        console.error("Inventory Error:", invError);
        await Product.findByIdAndDelete(product._id);
        return res.status(400).json({
          message: "Failed to set inventory",
          error: invError instanceof Error ? invError.message : "Unknown error",
        });
      }
    }

    console.log("✅ Product created successfully");
    res.status(201).json(product);
  } catch (error) {
    console.error("❌ Create Product Error:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    res.status(500).json({
      message: "Server Error",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// GET ALL PRODUCTS
export const getProducts = async (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    let filter: any = { isActive: true };

    if (category) {
      filter.category = category;
    }

    const products = await Product.find(filter)
      .populate("category");

    res.json(products);
  } catch {
    res.status(500).json({ message: "Server Error" });
  }
};


// DELETE PRODUCT
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted" });
  } catch {
    res.status(500).json({ message: "Server Error" });
  }
};


// PUBLIC GET PRODUCTS (for mobile app)
export const getPublicProducts = async (req: Request, res: Response) => {
  try {
    const { category } = req.query;

    const filter: any = { isActive: true };

    if (category) {
      filter.category = category;
    }

    const products = await Product.find(filter)
      .populate("category")
      .populate("inventory.store");

    res.json(products);
  } catch (error) {
    console.error("Public Product Fetch Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};


// ─── GET /api/products/public/:id ─────────────────────────────────────────────
export const getProductById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id)
      .populate("category", "name slug") // include category name + slug
      .lean();                            // plain JS object, faster than Mongoose doc

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Only return active products to public
    if (!product.isActive) {
      return res.status(404).json({ message: "Product not found" });
    }

    return res.status(200).json(product);
  } catch (error) {
    console.error("getProductById error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};