import { ROLES } from "../constants/roles.js";
import type { RequestActor } from "../types/access.js";
import { AppError } from "../utils/AppError.js";
/**
 * Enforce resource.user === actor (or admin). Use when loading by id without user in query.
 * Admins remain scoped to their organization unless a future super-admin role is introduced.
 */
export function assertOwnerOrAdmin(
  actor: RequestActor,
  resourceUserId: string | undefined | null,
  errorCode = "ACCESS_DENIED"
): void {
  if (actor.role === ROLES.ADMIN) return;
  const uid = resourceUserId?.toString?.() ?? "";
  if (uid && uid === actor.userId) return;
  throw new AppError("You do not have access to this resource", 403, errorCode);
}
