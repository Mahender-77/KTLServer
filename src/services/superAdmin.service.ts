import mongoose from "mongoose";
import Organization from "../models/Organization";
import User from "../models/User";
import Role from "../models/Role";
import Plan from "../models/Plan";
import { SUBSCRIPTION_STATUS } from "../models/Organization";
import { AppError } from "../utils/AppError";
import type { OrgModuleKey } from "../constants/modules";
import type { ProductFieldConfig, ProductFieldKey } from "../constants/productFields";
import { PRODUCT_FIELD_KEYS, DEFAULT_PRODUCT_FIELD_CONFIG } from "../constants/productFields";
import { invalidateProductFieldConfigCache } from "../utils/productFieldConfig";
import { ROLES } from "../constants/roles";
import { ensureDefaultRolesForOrganization } from "../migrations/organizationBootstrap";
import { logSuperAdminAction } from "../utils/superAdminAudit";

export async function listOrganizations(params: { page: number; limit: number }) {
  const skip = (params.page - 1) * params.limit;
  const [raw, total] = await Promise.all([
    Organization.find({})
      .select(
        "_id name isActive modules owner planId subscriptionStatus subscriptionStartDate subscriptionEndDate createdAt updatedAt"
      )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(params.limit)
      .lean(),
    Organization.countDocuments({}),
  ]);

  const data = raw.map((o) => ({
    _id: o._id,
    name: o.name,
    isActive: o.isActive,
    modules: Array.isArray(o.modules) ? o.modules : [],
    ownerId: o.owner ? String(o.owner) : null,
    planId: o.planId ? String(o.planId) : null,
    subscriptionStatus: o.subscriptionStatus ?? SUBSCRIPTION_STATUS.TRIAL,
    subscriptionStartDate: o.subscriptionStartDate ?? null,
    subscriptionEndDate: o.subscriptionEndDate ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  }));

  const totalPages = params.limit > 0 ? Math.ceil(total / params.limit) : 0;

  return {
    data,
    total,
    page: params.page,
    limit: params.limit,
    totalPages,
  };
}

function mapPublicContact(u: {
  _id: unknown;
  name: string;
  email: string;
  phone?: string | null;
  isSuspended?: boolean;
  createdAt?: Date;
}) {
  return {
    _id: String(u._id),
    name: u.name,
    email: u.email,
    phone: u.phone ?? null,
    isSuspended: u.isSuspended === true,
    createdAt: u.createdAt ?? null,
  };
}

export async function getOrganizationById(organizationId: string) {
  if (!mongoose.isValidObjectId(organizationId)) {
    throw new AppError("Invalid organization id", 400, "INVALID_ID");
  }
  const o = await Organization.findById(organizationId)
    .select(
      "_id name isActive modules owner planId subscriptionStatus subscriptionStartDate subscriptionEndDate createdAt updatedAt productFieldConfig"
    )
    .lean();
  if (!o) throw new AppError("Organization not found", 404, "ORG_NOT_FOUND");

  const orgObjectId = new mongoose.Types.ObjectId(organizationId);

  const [ownerDoc, adminDocs] = await Promise.all([
    o.owner
      ? User.findById(o.owner).select("name email phone isSuspended createdAt").lean()
      : Promise.resolve(null),
    User.find({
      organizationId: orgObjectId,
      role: ROLES.ADMIN,
      isSuperAdmin: { $ne: true },
    })
      .select("name email phone isSuspended createdAt")
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  return {
    _id: o._id,
    name: o.name,
    isActive: o.isActive,
    modules: Array.isArray(o.modules) ? o.modules : [],
    ownerId: o.owner ? String(o.owner) : null,
    owner: ownerDoc ? mapPublicContact(ownerDoc) : null,
    clientAdmins: adminDocs.map((u) => mapPublicContact(u)),
    planId: o.planId ? String(o.planId) : null,
    subscriptionStatus: o.subscriptionStatus ?? SUBSCRIPTION_STATUS.TRIAL,
    subscriptionStartDate: o.subscriptionStartDate ?? null,
    subscriptionEndDate: o.subscriptionEndDate ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    productFieldConfig: o.productFieldConfig ?? null,
  };
}

export async function updateOrganizationModules(
  organizationId: string,
  modules: OrgModuleKey[],
  actorUserId: string
) {
  if (!mongoose.isValidObjectId(organizationId)) {
    throw new AppError("Invalid organization id", 400, "INVALID_ID");
  }

  const unique = [...new Set(modules)] as OrgModuleKey[];

  const before = await Organization.findById(organizationId)
    .select("modules name planId")
    .lean();
  if (!before) throw new AppError("Organization not found", 404, "ORG_NOT_FOUND");
  if (before.planId) {
    throw new AppError(
      "Modules are managed by the assigned plan. Update organization plan instead.",
      400,
      "PLAN_MANAGED_MODULES"
    );
  }

  const updateResult = await Organization.updateOne(
    { _id: organizationId },
    { $set: { modules: unique } },
    { runValidators: true }
  );
  if ((updateResult.matchedCount ?? 0) === 0) {
    throw new AppError("Organization not found", 404, "ORG_NOT_FOUND");
  }
  const updated = await Organization.findById(organizationId)
    .select("_id name isActive modules updatedAt")
    .lean();

  logSuperAdminAction("organization.modules.patch", actorUserId, {
    organizationId,
    organizationName: before.name,
    before: Array.isArray(before.modules) ? before.modules : [],
    after: unique,
  });

  return {
    message: "Organization modules updated",
    organization: {
      _id: updated?._id,
      name: updated?.name,
      isActive: updated?.isActive,
      modules: updated?.modules ?? [],
      updatedAt: updated?.updatedAt,
    },
  };
}

export async function updateOrganizationStatus(
  organizationId: string,
  isActive: boolean,
  actorUserId: string
) {
  if (!mongoose.isValidObjectId(organizationId)) {
    throw new AppError("Invalid organization id", 400, "INVALID_ID");
  }

  const before = await Organization.findById(organizationId).select("isActive name").lean();
  if (!before) throw new AppError("Organization not found", 404, "ORG_NOT_FOUND");

  const updateResult = await Organization.updateOne(
    { _id: organizationId },
    { $set: { isActive } },
    { runValidators: true }
  );
  if ((updateResult.matchedCount ?? 0) === 0) {
    throw new AppError("Organization not found", 404, "ORG_NOT_FOUND");
  }
  const updated = await Organization.findById(organizationId)
    .select("_id name isActive modules updatedAt")
    .lean();

  logSuperAdminAction("organization.status.patch", actorUserId, {
    organizationId,
    organizationName: before.name,
    before: { isActive: before.isActive },
    after: { isActive },
  });

  return {
    message: "Organization status updated",
    organization: {
      _id: updated?._id,
      name: updated?.name,
      isActive: updated?.isActive,
      modules: updated?.modules ?? [],
      updatedAt: updated?.updatedAt,
    },
  };
}

export async function createPlan(
  data: { name: string; price: number; modules: OrgModuleKey[]; isActive?: boolean },
  actorUserId: string
) {
  const name = data.name.trim();
  const modules = [...new Set(data.modules)];
  const existing = await Plan.findOne({ name }).select("_id").lean();
  if (existing) throw new AppError("Plan already exists", 400, "PLAN_EXISTS");

  const plan = await Plan.create({
    name,
    price: data.price,
    modules,
    isActive: data.isActive ?? true,
  });

  logSuperAdminAction("plan.create", actorUserId, {
    planId: plan._id.toString(),
    name: plan.name,
    price: plan.price,
    modules: plan.modules,
    isActive: plan.isActive,
  });

  return {
    message: "Plan created",
    plan: {
      _id: plan._id,
      name: plan.name,
      price: plan.price,
      modules: plan.modules,
      isActive: plan.isActive,
      createdAt: plan.createdAt,
    },
  };
}

export async function listPlans() {
  const plans = await Plan.find({})
    .select("_id name price modules isActive createdAt updatedAt")
    .sort({ price: 1, createdAt: -1 })
    .lean();

  return {
    data: plans.map((p) => ({
      _id: p._id,
      name: p.name,
      price: p.price,
      modules: p.modules ?? [],
      isActive: p.isActive,
      createdAt: p.createdAt ?? null,
      updatedAt: p.updatedAt ?? null,
    })),
  };
}

export async function assignOrganizationPlan(
  organizationId: string,
  planId: string,
  actorUserId: string
) {
  if (!mongoose.isValidObjectId(organizationId) || !mongoose.isValidObjectId(planId)) {
    throw new AppError("Invalid id", 400, "INVALID_ID");
  }

  const [org, plan] = await Promise.all([
    Organization.findById(organizationId).select("name planId modules").lean(),
    Plan.findById(planId).select("name modules isActive").lean(),
  ]);
  if (!org) throw new AppError("Organization not found", 404, "ORG_NOT_FOUND");
  if (!plan || plan.isActive !== true) {
    throw new AppError("Plan not found or inactive", 400, "PLAN_INVALID");
  }

  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 1);

  const updateResult = await Organization.updateOne(
    { _id: organizationId },
    {
      $set: {
        planId,
        modules: plan.modules ?? [],
        subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
        subscriptionStartDate: now,
        subscriptionEndDate: end,
      },
    },
    { runValidators: true }
  );
  if ((updateResult.matchedCount ?? 0) === 0) {
    throw new AppError("Organization not found", 404, "ORG_NOT_FOUND");
  }
  const updated = await Organization.findById(organizationId)
    .select(
      "_id name modules planId subscriptionStatus subscriptionStartDate subscriptionEndDate updatedAt"
    )
    .lean();

  logSuperAdminAction("organization.plan.patch", actorUserId, {
    organizationId,
    organizationName: org.name,
    before: { planId: org.planId ? String(org.planId) : null, modules: org.modules ?? [] },
    after: {
      planId,
      planName: plan.name,
      modules: plan.modules ?? [],
      subscriptionStatus: SUBSCRIPTION_STATUS.ACTIVE,
      subscriptionStartDate: now,
      subscriptionEndDate: end,
    },
  });

  return {
    message: "Organization plan assigned",
    organization: updated,
  };
}

function normalizeProductFieldConfig(
  incoming: Partial<Record<ProductFieldKey, boolean>> | undefined
): ProductFieldConfig {
  const out = { ...DEFAULT_PRODUCT_FIELD_CONFIG } as ProductFieldConfig;
  if (!incoming) return out;
  for (const key of PRODUCT_FIELD_KEYS) {
    if (typeof incoming[key] === "boolean") out[key] = incoming[key] as boolean;
  }
  return out;
}

export async function createOrganizationFull(
  data: {
    organization: { name: string };
    admin: { name: string; email: string; password: string };
    modules: OrgModuleKey[];
    productFields?: Partial<Record<ProductFieldKey, boolean>>;
  },
  actorUserId: string
) {
  const orgName = data.organization.name.trim();
  const adminName = data.admin.name.trim();
  const adminEmail = data.admin.email.trim().toLowerCase();
  const modules = [...new Set(data.modules)];
  const productFieldConfig = normalizeProductFieldConfig(data.productFields);

  const [existingOrg, existingUser] = await Promise.all([
    Organization.findOne({ name: orgName }).select("_id").lean(),
    User.findOne({ email: adminEmail }).select("_id").lean(),
  ]);
  if (existingOrg) throw new AppError("Organization name already exists", 400, "ORG_EXISTS");
  if (existingUser) throw new AppError("Admin email already exists", 400, "EMAIL_EXISTS");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const adminUser = new User({
      name: adminName,
      email: adminEmail,
      password: data.admin.password,
      role: ROLES.ADMIN,
    });
    await adminUser.save({ session });

    const org = new Organization({
      name: orgName,
      owner: adminUser._id,
      isActive: true,
      modules,
      productFieldConfig,
      subscriptionStatus: SUBSCRIPTION_STATUS.TRIAL,
      subscriptionStartDate: new Date(),
    });
    await org.save({ session });

    adminUser.organizationId = org._id as mongoose.Types.ObjectId;
    await adminUser.save({ session });

    await session.commitTransaction();

    const organizationId = org._id.toString();
    invalidateProductFieldConfigCache(organizationId);
    await ensureDefaultRolesForOrganization(organizationId);
    const adminRole = await Role.findOne({
      organizationId,
      name: "Admin",
      isActive: true,
    })
      .select("_id")
      .lean();
    if (adminRole?._id) {
      await User.updateOne(
        { _id: adminUser._id },
        { $set: { roleId: adminRole._id, role: ROLES.ADMIN } }
      );
    }

    logSuperAdminAction("organization.full-create", actorUserId, {
      organizationId,
      organizationName: org.name,
      modules,
      adminUserId: adminUser._id.toString(),
      adminEmail,
      productFieldConfig,
    });

    return {
      message: "Organization and admin created successfully",
      organization: {
        _id: org._id,
        name: org.name,
        modules: org.modules,
        productFieldConfig: org.productFieldConfig,
      },
      admin: {
        _id: adminUser._id,
        name: adminUser.name,
        email: adminUser.email,
      },
    };
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
}
