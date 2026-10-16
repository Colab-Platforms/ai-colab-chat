import cron from "node-cron";
import { isEnterpriseEnabled } from "@/utils/enterprise.js";
import OrgBillingService from "@/modules/org/org.billing.service.js";
import { purgeStaleInvites } from "@/modules/org/org.retention.service.js";

const billing = new OrgBillingService();

const run = async (source: string) => {
  if (!isEnterpriseEnabled()) return;
  try {
    // Order matters: invoice first, then remind, then expire what's past grace.
    const issued = await billing.generateRenewalBills();
    const reminded = await billing.sendReminders();
    const expired = await billing.expireLapsed();
    const purged = await purgeStaleInvites();
    if (issued || reminded || expired || purged) {
      console.log(`[org-billing] ${source}: ${issued} invoice(s) issued, ${reminded} reminder(s), ${expired} plan(s) expired, ${purged} stale invite(s) purged`);
    }
  } catch (error) {
    console.error(`[org-billing] ${source} failed:`, error);
  }
};

const task = () => {
  // Daily at 00:40 IST, after the seat-refill cron.
  cron.schedule("40 0 * * *", () => run("daily"), { timezone: "Asia/Kolkata" });
  void run("startup");
};

export default task;
