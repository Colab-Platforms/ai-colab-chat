import cron from "node-cron";
import { grantDueYearlyMonths } from "@/modules/subscription/yearly-grant.service.js";

const run = async (source: string) => {
  try {
    const result = await grantDueYearlyMonths();
    console.log(
      `[yearly-grant] ${source}: granted ${result.months} month(s) to ${result.subscriptions} subscription(s)` +
        (result.adopted ? `, adopted ${result.adopted} legacy subscription(s)` : ""),
    );
  } catch (error) {
    console.error(`[yearly-grant] ${source} failed:`, error);
  }
};

const task = () => {
  // Daily at 00:10 IST — before the 00:30 manual-expiry cron, so a plan's last
  // due month is still granted before the plan is expired.
  cron.schedule("10 0 * * *", () => run("daily"), { timezone: "Asia/Kolkata" });

  // Catch up after downtime without waiting for the next midnight.
  void run("startup");
};

export default task;
