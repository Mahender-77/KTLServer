import cron from "node-cron";
import Organization, { SUBSCRIPTION_STATUS } from "../models/Organization";

let started = false;

/**
 * Daily subscription expiry scheduler.
 * Marks organizations as `subscriptionStatus: "expired"` when `subscriptionEndDate < now`.
 */
export function startSubscriptionExpiryScheduler(): void {
  if (started) return;
  started = true;

  cron.schedule(
    "0 0 * * *", // daily at 00:00 UTC
    async () => {
      const now = new Date();

      const filter = {
        subscriptionEndDate: { $exists: true, $ne: null, $lt: now },
        subscriptionStatus: { $ne: SUBSCRIPTION_STATUS.EXPIRED },
      };

      const update = { $set: { subscriptionStatus: SUBSCRIPTION_STATUS.EXPIRED } };

      try {
        const result = await Organization.updateMany(filter, update);
        console.log(
          JSON.stringify({
            type: "SUBSCRIPTION_EXPIRY_CRON",
            ts: now.toISOString(),
            matchedCount: (result as any)?.matchedCount,
            modifiedCount: (result as any)?.modifiedCount,
          })
        );
      } catch (err) {
        console.error("[SUBSCRIPTION_EXPIRY_CRON] failed:", err);
      }
    },
    {
      timezone: "UTC",
    }
  );

  console.log("[SUBSCRIPTION_EXPIRY_CRON] scheduler started (daily, UTC).");
}

