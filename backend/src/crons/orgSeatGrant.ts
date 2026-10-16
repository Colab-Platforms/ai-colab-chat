import cron from "node-cron";
import { isEnterpriseEnabled } from "@/utils/enterprise.js";
import { grantDueOrgSeats } from "@/modules/org/org.grant.service.js";

const run = async (source: string) => {
  if (!isEnterpriseEnabled()) return;
  try {
    const r = await grantDueOrgSeats();
    if (r.due) console.log(`[org-grant] ${source}: ${r.granted}/${r.due} seat(s) refilled, ${r.failed} failed`);
  } catch (error) {
    console.error(`[org-grant] ${source} failed:`, error);
  }
};

const task = () => {
  // Daily at 00:20 IST. Seats are refilled on their own monthly anniversary,
  // so this only does work for the few that are due that day.
  cron.schedule("20 0 * * *", () => run("daily"), { timezone: "Asia/Kolkata" });

  // Catch up after downtime.
  void run("startup");
};

export default task;
