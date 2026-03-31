import Category from "../models/Category";
import slugify from "slugify";
import mongoose from "mongoose";
import { AppError } from "../utils/AppError";
import { andWithTenant, tenantWhereClause, tenantScopedIdFilter } from "../utils/tenantScope";
import { tenantFilterFromActor } from "../utils/tenantFilter";

export async function createCategory(
  organizationId: string,
  data: { name: string; parent?: string | null }
) {
  const { name, parent } = data;
  let slug = slugify(name, { lower: true });
  const exists = await Category.findOne({ slug, ...tenantWhereClause(organizationId) });
  if (exists) slug = `${slug}-${Date.now()}`;

  let parentId: mongoose.Types.ObjectId | null = null;
  if (parent) {
    if (!mongoose.Types.ObjectId.isValid(parent)) {
      throw new AppError("Invalid parent ID", 400, "INVALID_PARENT_ID");
    }
    const parentDoc = await Category.findOne(
      tenantScopedIdFilter(organizationId, parent)
    ).select("_id");
    if (!parentDoc) {
      throw new AppError("Parent category not found", 404, "PARENT_CATEGORY_NOT_FOUND");
    }
    parentId = parentDoc._id as mongoose.Types.ObjectId;
  }

  const category = await Category.create({
    organizationId,
    name,
    slug,
    parent: parentId,
  });
  return category;
}

export async function getCategoriesTree(organizationId: string) {
  const categories = await Category.find(
    tenantFilterFromActor({ organizationId, isSuperAdmin: false })
  );
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

export async function getSubCategories(
  organizationId: string,
  parentId: string
) {
  if (!mongoose.Types.ObjectId.isValid(parentId)) {
    throw new AppError("Invalid parent ID", 400, "INVALID_PARENT_ID");
  }
  return Category.find(
    andWithTenant(organizationId, {
      parent: new mongoose.Types.ObjectId(parentId),
      isActive: true,
    })
  );
}

export async function getFlatCategories(organizationId: string) {
  return Category.find(
    tenantFilterFromActor({ organizationId, isSuperAdmin: false })
  ).sort({ name: 1 });
}

export async function getCategoryById(organizationId: string, id: string) {
  const category = await Category.findOne(tenantScopedIdFilter(organizationId, id)).populate(
    "parent"
  );
  if (!category) throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  return category;
}

export async function updateCategory(
  organizationId: string,
  id: string,
  data: { name?: string; parent?: string | null; isActive?: boolean }
) {
  const { name, parent, isActive } = data;
  const updateData: any = {};
  if (isActive !== undefined) updateData.isActive = isActive;
  if (name) {
    updateData.name = name;
    updateData.slug = slugify(name, { lower: true });
    const slugExists = await Category.findOne(
      andWithTenant(organizationId, {
        slug: updateData.slug,
        _id: { $ne: new mongoose.Types.ObjectId(id) },
      })
    )
      .select("_id")
      .lean();
    if (slugExists) updateData.slug = `${updateData.slug}-${Date.now()}`;
  }
  if (parent !== undefined) {
    if (parent === null || parent === "") {
      updateData.parent = null;
    } else {
      if (!mongoose.Types.ObjectId.isValid(parent)) {
        throw new AppError("Invalid parent ID", 400, "INVALID_PARENT_ID");
      }
      const parentDoc = await Category.findOne(
        tenantScopedIdFilter(organizationId, parent)
      ).select("_id");
      if (!parentDoc) {
        throw new AppError("Parent category not found", 404, "PARENT_CATEGORY_NOT_FOUND");
      }
      updateData.parent = parentDoc._id;
    }
  }

  const category = await Category.findOneAndUpdate(
    tenantScopedIdFilter(organizationId, id),
    updateData,
    { new: true }
  );
  if (!category) throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  return category;
}

export async function deleteCategory(organizationId: string, id: string) {
  const hasChildren = await Category.findOne(
    andWithTenant(organizationId, { parent: new mongoose.Types.ObjectId(id) })
  );
  if (hasChildren) {
    throw new AppError("Cannot delete category with subcategories", 400, "CATEGORY_HAS_CHILDREN");
  }
  const result = await Category.deleteOne(tenantScopedIdFilter(organizationId, id));
  if ((result.deletedCount ?? 0) === 0) {
    throw new AppError("Category not found", 404, "CATEGORY_NOT_FOUND");
  }
  return { message: "Category deleted successfully" };
}
