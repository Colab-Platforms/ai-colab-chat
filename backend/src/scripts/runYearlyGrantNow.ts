/**
 * Manual trigger for the yearly-plan monthly grant cron (src/crons/yearlyTokenGrant.ts).
 * Grants every month that is currently due; months that aren't due yet are never granted early.
 *
 * Run with: npm run yearly:grant
 *   (or: npx tsx src/scripts/runYearlyGrantNow.ts)
 *
 * To test end to end, move a yearly subscription's nextGrantAt into the past
 * (e.g. in Prisma Studio: set nextGrantAt = now) and run this.
 */
import "dotenv/config";
import { grantDueYearlyMonths } from "@/modules/subscription/yearly-grant.service.js";

grantDueYearlyMonths()
  .then((r) => {
    console.log(
      `[yearly-grant] manual run: granted ${r.months} month(s) to ${r.subscriptions} subscription(s), adopted ${r.adopted} legacy`,
    );
    process.exit(0);
  })
  .catch((error) => {
    console.error("[yearly-grant] manual run error:", error);
    process.exit(1);
  });
