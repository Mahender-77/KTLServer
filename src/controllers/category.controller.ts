import { Request, Response } from "express";
import Category from "../models/Category";
import slugify from "slugify";
import console from "node:console";
import mongoose from "mongoose";

// CREATE
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, parent } = req.body;

    let slug = slugify(name, { lower: true });

    // If slug exists, append timestamp
    const exists = await Category.findOne({ slug });
    if (exists) {
      slug = `${slug}-${Date.now()}`;
    }

    const category = await Category.create({
      name,
      slug,
      parent: parent || null,
    });

    console.log("Created Category:", category);

    res.status(201).json(category);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

// GET ALL (Tree structure)
export const getCategories = async (_req: Request, res: Response) => {
  console.log("Fetching categories...");
  try {
    const categories = await Category.find();

    const map = new Map();

    categories.forEach((cat) => {
      map.set(cat._id.toString(), { ...cat.toObject(), children: [] });
    });

    const tree: any[] = [];

    categories.forEach((cat) => {
      if (cat.parent) {
        const parent = map.get(cat.parent.toString());
        if (parent) {
          parent.children.push(map.get(cat._id.toString()));
        }
      } else {
        tree.push(map.get(cat._id.toString()));
      }
    });

    res.json(tree);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// GET SUB CATEGORIES BY PARENT ID

export const getSubCategories = async (req: Request, res: Response) => {
  try {
    const parentId = req.params.parentId as string;

    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      return res.status(400).json({ message: "Invalid parent ID" });
    }

    const subCategories = await Category.find({
      parent: new mongoose.Types.ObjectId(parentId),
      isActive: true,
    });

    res.json(subCategories);
  } catch (error) {
    console.error("Sub Category Fetch Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};



// GET FLAT LIST (for filters/dropdowns)
export const getFlatCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    console.error("Error fetching flat categories:", error);
    res.status(500).json({ message: "Server Error" });
  }
};


// GET SINGLE CATEGORY
export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const category = await Category.findById(req.params.id).populate("parent");

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(category);
  } catch (error) {
    console.error("Error fetching category:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// UPDATE
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { name, parent, isActive } = req.body;

    const updateData: any = { isActive };

    if (name) {
      updateData.name = name;
      updateData.slug = slugify(name, { lower: true });
    }

    if (parent !== undefined) {
      updateData.parent = parent || null;
    }

    const category = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true },
    );

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json(category);
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// DELETE
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    // Check if category has children
    const hasChildren = await Category.findOne({ parent: req.params.id });

    if (hasChildren) {
      return res.status(400).json({
        message: "Cannot delete category with subcategories",
      });
    }

    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ message: "Server Error" });
  }
};
