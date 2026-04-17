import { AppError } from "./AppError.js";

type TenantUser = {
  isSuperAdmin?: boolean;
  organizationId?: unknown;
};

type TenantRequestLike = {
  user?: TenantUser;
};

/**
 * Reusable tenant query filter.
 * Always returns organizationId scope for tenant data queries.
 */
export const tenantFilter = (req: TenantRequestLike): Record<string, unknown> => {
  const orgId = req?.user?.organizationId?.toString?.() ?? req?.user?.organizationId;
  if (!orgId) {
    throw new AppError("Organization required", 403, "ORG_REQUIRED");
  }
  return { organizationId: orgId };
};

export const tenantFilterFromActor = (context: {
  organizationId?: string;
  isSuperAdmin?: boolean;
}): Record<string, unknown> =>
  tenantFilter({
    user: {
      isSuperAdmin: context.isSuperAdmin === true,
      organizationId: context.organizationId,
    },
  });

