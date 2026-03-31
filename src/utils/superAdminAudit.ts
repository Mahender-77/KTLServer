/**
 * Structured audit log for platform (super-admin) actions.
 * Future: ship to a dedicated collection, SIEM, or billing webhooks.
 */
export function logSuperAdminAction(
  action: string,
  actorUserId: string,
  details: Record<string, unknown>
): void {
  console.log(
    JSON.stringify({
      type: "SUPER_ADMIN_AUDIT",
      ts: new Date().toISOString(),
      action,
      actorUserId,
      ...details,
    })
  );
}
