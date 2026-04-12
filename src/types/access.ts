import type { AppRole } from "../constants/roles";

/**
 * Authenticated actor for ownership / role checks in services.
 * Extend with `organizationId` when adding multi-tenant isolation.
 */
export interface RequestActor {
  userId: string;
  role: AppRole | string;
  /** Tenant scope for row-level isolation */
  organizationId: string;
  isSuperAdmin?: boolean;
}
