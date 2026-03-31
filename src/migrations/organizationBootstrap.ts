import mongoose from "mongoose";
import Organization from "../models/Organization";
import User from "../models/User";
import Product from "../models/Product";
import Order from "../models/Order";
import Store from "../models/Store";
import Cart from "../models/Cart";
import Address from "../models/Address";
import Wishlist from "../models/Wishlist";
import SubOrder from "../models/SubOrder";
import Category from "../models/Category";
import Role from "../models/Role";
import { ROLES } from "../constants/roles";
import { DEFAULT_ORG_MODULES } from "../constants/modules";
import { DEFAULT_PRODUCT_FIELD_CONFIG } from "../constants/productFields";

/** Single shared tenant for legacy data and default signups until multi-org onboarding is added. */
export const DEFAULT_ORG_NAME = "Default Organization";

let defaultOrgIdCache: string | null = null;

export function tryGetDefaultOrganizationId(): string | null {
  return defaultOrgIdCache;
}

export function setDefaultOrganizationCache(id: string): void {
  defaultOrgIdCache = id;
}

// ─── RBAC Seed ───────────────────────────────────────────────────────────────
// Permissions are stored inside each Role document (organization-scoped).
export const RBAC_PERMISSIONS = [
  "product.create",
  "product.view",
  "product.update",
  "order.manage",
  "user.create",
] as const;

export const DEFAULT_ROLE_DEFINITIONS: Array<{
  name: string;
  legacyRole: (typeof ROLES)[keyof typeof ROLES];
  permissions: string[];
}> = [
  {
    name: "Admin",
    legacyRole: ROLES.ADMIN,
    permissions: [...RBAC_PERMISSIONS],
  },
  {
    name: "Delivery",
    legacyRole: ROLES.DELIVERY,
    permissions: ["order.manage"],
  },
  {
    name: "User",
    legacyRole: ROLES.USER,
    permissions: ["product.view", "order.manage"],
  },
];

export async function ensureDefaultRolesForOrganization(
  organizationId: string
): Promise<void> {
  if (!organizationId) return;

  await Promise.all(
    DEFAULT_ROLE_DEFINITIONS.map(async (def) => {
      await Role.updateOne(
        { organizationId, name: def.name },
        { $set: { permissions: def.permissions, isActive: true } },
        { upsert: true }
      );
    })
  );
}

/**
 * Ensures a default organization exists when there are users, backfills organizationId on
 * tenant-scoped collections, and refreshes indexes. Safe to run on every process start.
 */
export async function bootstrapTenantData(): Promise<void> {
  await Product.collection.dropIndex("slug_1").catch(() => undefined);
  await Category.collection.dropIndex("slug_1").catch(() => undefined);
  await Cart.collection.dropIndex("user_1").catch(() => undefined);
  await Wishlist.collection.dropIndex("user_1").catch(() => undefined);

  // Backfill `modules` for legacy organizations (default: product + order).
  await Organization.updateMany(
    { $or: [{ modules: { $exists: false } }, { modules: { $size: 0 } }] },
    { $set: { modules: [...DEFAULT_ORG_MODULES] } }
  );
  await Organization.updateMany(
    { $or: [{ productFieldConfig: { $exists: false } }, { productFieldConfig: null }] },
    { $set: { productFieldConfig: { ...DEFAULT_PRODUCT_FIELD_CONFIG } } }
  );

  let org = await Organization.findOne({ name: DEFAULT_ORG_NAME });

  if (!org) {
    const firstUser = await User.findOne().sort({ createdAt: 1 });
    if (firstUser) {
      org = await Organization.create({
        name: DEFAULT_ORG_NAME,
        owner: firstUser._id,
        isActive: true,
        modules: [...DEFAULT_ORG_MODULES],
        productFieldConfig: { ...DEFAULT_PRODUCT_FIELD_CONFIG },
      });
      // Ownership implies full access for now.
      await User.updateOne({ _id: firstUser._id }, { $set: { role: ROLES.ADMIN } });
    }
  }

  if (org) {
    const oid = org._id as mongoose.Types.ObjectId;
    defaultOrgIdCache = oid.toString();

    // Seed default RBAC roles for all active organizations (organization-scoped).
    const activeOrgs = await Organization.find({ isActive: true }).select("_id").lean();
    await Promise.all(
      activeOrgs.map(async (o: any) => {
        if (o?._id) await ensureDefaultRolesForOrganization(String(o._id));
      })
    );

    // Ensure the org owner has admin privileges (legacy safety).
    if (org.owner) {
      await User.updateOne({ _id: org.owner }, { $set: { role: ROLES.ADMIN } });
    }

    // Seed RBAC roles for this organization.
    await ensureDefaultRolesForOrganization(oid.toString());

    // Backfill owner roleId for RBAC-first permission checks.
    const adminRole = await Role.findOne({
      organizationId: oid,
      name: "Admin",
      isActive: true,
    }).lean();
    if (adminRole?._id && org.owner) {
      await User.updateOne(
        { _id: org.owner },
        { $set: { roleId: adminRole._id, role: ROLES.ADMIN } }
      );
    }

    const missing = {
      $or: [{ organizationId: { $exists: false } }, { organizationId: null }],
    };
    const setOrg = { $set: { organizationId: oid } };

    await User.updateMany(missing, setOrg);
    await Product.updateMany(missing, setOrg);
    await Order.updateMany(missing, setOrg);
    await Store.updateMany(missing, setOrg);
    await Cart.updateMany(missing, setOrg);
    await Address.updateMany(missing, setOrg);
    await Wishlist.updateMany(missing, setOrg);
    await SubOrder.updateMany(missing, setOrg);
    await Category.updateMany(missing, setOrg);
  } else {
    const anyOrg = await Organization.findOne({ isActive: true }).sort({ createdAt: 1 }).lean();
    if (anyOrg?._id) {
      defaultOrgIdCache = anyOrg._id.toString();
    } else {
      console.warn(
        "[tenant] No organization in database yet — public catalog routes return empty until the first account is registered."
      );
    }
  }

  await Product.syncIndexes().catch((e) => console.warn("[tenant] Product.syncIndexes:", e));
  await Category.syncIndexes().catch((e) => console.warn("[tenant] Category.syncIndexes:", e));
  await Cart.syncIndexes().catch((e) => console.warn("[tenant] Cart.syncIndexes:", e));
  await Wishlist.syncIndexes().catch((e) => console.warn("[tenant] Wishlist.syncIndexes:", e));
}

/**
 * Resolves default org after registration or bootstrap (e.g. for cache warm-up).
 */
export async function refreshDefaultOrgCache(): Promise<void> {
  const org =
    (await Organization.findOne({ name: DEFAULT_ORG_NAME })) ??
    (await Organization.findOne({ isActive: true }).sort({ createdAt: 1 }));
  if (org?._id) {
    defaultOrgIdCache = org._id.toString();
  }
}
