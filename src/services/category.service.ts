import Category from "../models/Category";
import slugify from "slugify";
import mongoose from "mongoose";
import { AppError } from "../utils/AppError";

export async function createCategory(data: { name: string; parent?: string | null }) {
  const { name, parent } = data;
  let slug = slugify(name, { lower: true });
  const exists = await Category.findOne({ slug });
  if (exists) slug = `${slug}-${Date.now()}`;

  const category = await Category.create({
    name,
    slug,
    parent: parent || null,
  });
  return category;
}

export async function getCategoriesTree() {
  const categories = await Category.find();
  const map = new Map();
  categories.forEach((cat) => {
    map.set(cat._id.toString(), { ...cat.toObject(), children: [] });
  });
  const tree: any[] = [];
  categories.forEach((cat) => {
    if (cat.parent) {
      const parent = map.get(cat.parent.toString());
      if (parent) parent.children.push(map.get(cat._id.toString()));
    } else {
      tree.push(map.get(cat._id.toString()));
    }
  });
  return tree;
}

export async function getSubCategories(parentId: string) {
  if (!mongoose.Types.ObjectId.isValid(parentId)) {
    throw new AppError("Invalid parent ID", 400, "INVALID_PARENT_ID");
  }
  return Category.find({
    parent: new mongoose.Types.ObjectId(parentId),
    isActive: true,
  });
}

export async function getFlatCategories() {
  return Category.find().sort({ name: 1 });
}

export async function getCategoryById(id: string) {
  const category = await Category.findById(id).populate("parent");
  if (!category) throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  return category;
}

export async function updateCategory(
  id: string,
  data: { name?: string; parent?: string | null; isActive?: boolean }
) {
  const { name, parent, isActive } = data;
  const updateData: any = { isActive };
  if (name) {
    updateData.name = name;
    updateData.slug = slugify(name, { lower: true });
  }
  if (parent !== undefined) updateData.parent = parent || null;

  const category = await Category.findByIdAndUpdate(id, updateData, { new: true });
  if (!category) throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  return category;
}

export async function deleteCategory(id: string) {
  const hasChildren = await Category.findOne({ parent: id });
  if (hasChildren) {
    throw new AppError("Cannot delete category with subcategories", 400, "CATEGORY_HAS_CHILDREN");
  }
  const category = await Category.findByIdAndDelete(id);
  if (!category) throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  return { message: "Category deleted successfully" };
}
