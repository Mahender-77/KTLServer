import { ROLES } from "./roles";

/**
 * Default permissions merged for tenant `admin` legacy role when Role DB is missing or stale.
 * Keeps `checkPermission` and `getCurrentUser` aligned without importing heavy migration modules.
 */
export const DEFAULT_TENANT_ADMIN_PERMISSIONS: readonly string[] = [
  "product.create",
  "product.view",
  "product.update",
  "order.manage",
  "user.create",
  "inventory.view",
  "inventory.update",
  "audit.view",
  "category.manage",
  "store.manage",
] as const;

export function mergeWithTenantAdminDefaults(
  legacyRole: string | undefined,
  rolePermissions: string[] | undefined
): string[] {
  if (legacyRole !== ROLES.ADMIN) {
    return [...(rolePermissions ?? [])];
  }
  return [...new Set([...(rolePermissions ?? []), ...DEFAULT_TENANT_ADMIN_PERMISSIONS])];
}
