import User from "../models/User";
import { getSuperAdminEmails } from "../config/env";

/**
 * Grants `isSuperAdmin` to users whose email appears in `SUPER_ADMIN_EMAILS` (comma-separated).
 * Safe to run on every process start; does not remove flags from users removed from the list.
 */
export async function bootstrapSuperAdminUsers(): Promise<void> {
  const emails = getSuperAdminEmails();
  if (emails.length === 0) return;

  await User.updateMany(
    { email: { $in: emails } },
    { $set: { isSuperAdmin: true } }
  );
}
