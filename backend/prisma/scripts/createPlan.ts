/**
 * Generic plan-creation script — builds a plan's tokenLimit/monthlyVideoCredits
 * and INR prices from a nominal USD price + margin + video/token split via
 * computePlanPricing() (src/utils/planPricing.ts), then creates it through
 * the normal PlanService.create() path, which already syncs all three billing
 * cycles to Cashfree.
 *
 * Usage:
 *   npm run db:create-plan -- --name "Ultra" --priceUsd 49
 *   npm run db:create-plan -- --name "Ultra" --priceUsd 49 --margin 50 --videoSplit 50 --dryRun
 *   npm run db:create-plan -- --name "Ultra" --priceUsd 49 --videoModels bytedance/seedance-2.0,bytedance/seedance-2.0-mini,google/veo-3.1-lite
 *
 * Flags:
 *   --name          required, plan display name
 *   --priceUsd      required, nominal monthly USD price (tax-exclusive)
 *   --margin        optional, % of priceUsd kept as margin (default 50)
 *   --videoSplit    optional, % of the margin budget given to video credits, rest to tokens (default 50)
 *   --fx            optional, INR/USD used only for the displayed price (default 94.98, matches existing plans)
 *   --videoModels   optional, comma-separated Model.externalId list this plan may generate video with
 *   --dryRun        optional, prints the computed numbers without writing anything
 */
import "dotenv/config";
import prisma from "@root/prisma.js";
import PlanService from "@/modules/plan/plan.service.js";
import { computePlanPricing } from "@/utils/planPricing.js";
import { getUsdPerToken } from "@/utils/walletUtils.js";

function parseArgs(argv: string[]): Record<string, string> {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      opts[key] = next;
      i++;
    } else {
      opts[key] = "true";
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const name = opts.name;
  const priceUsd = opts.priceUsd ? Number(opts.priceUsd) : NaN;
  if (!name || !Number.isFinite(priceUsd) || priceUsd <= 0) {
    console.error(
      'Usage: npm run db:create-plan -- --name "Ultra" --priceUsd 49 [--margin 50] [--videoSplit 50] [--fx 94.98] [--videoModels externalId1,externalId2] [--dryRun]',
    );
    process.exit(1);
  }

  const marginPercent = opts.margin ? Number(opts.margin) : undefined;
  const videoSplitPercent = opts.videoSplit ? Number(opts.videoSplit) : undefined;
  const fxRate = opts.fx ? Number(opts.fx) : undefined;
  const dryRun = opts.dryRun === "true";

  // Live rate, not the code-default fallback — this is the whole point: the
  // plan's numbers always match whatever billing is actually charging today.
  const usdPerToken = await getUsdPerToken();

  const pricing = computePlanPricing({
    priceUsd,
    marginPercent,
    videoSplitPercent,
    fxRate,
    usdPerToken,
  });

  console.log(
    `\nPlan "${name}" — $${pricing.priceUsd}/mo, ${pricing.marginPercent}% margin, ` +
      `${pricing.videoSplitPercent}/${100 - pricing.videoSplitPercent} video/token split\n`,
  );
  console.table({
    "Monthly price (INR)": pricing.monthlyPriceInr,
    "Quarterly price (INR)": pricing.quarterlyPriceInr,
    "Yearly price (INR)": pricing.yearlyPriceInr,
    "Real cost budget (USD)": pricing.realCostBudgetUsd.toFixed(2),
    "Video budget (USD)": pricing.videoBudgetUsd.toFixed(2),
    "Token budget (USD)": pricing.tokenBudgetUsd.toFixed(2),
    "Video credits / month": pricing.monthlyVideoCredits,
    "Token limit": pricing.tokenLimit,
  });

  if (dryRun) {
    console.log("--dryRun set — nothing was written. Re-run without --dryRun to actually create this plan.");
    return;
  }

  let allowedVideoModelIds: number[] | undefined;
  if (opts.videoModels) {
    const externalIds = opts.videoModels.split(",").map((s) => s.trim()).filter(Boolean);
    const models = await prisma.model.findMany({
      where: { externalId: { in: externalIds } },
      select: { id: true, externalId: true },
    });
    const found = new Set(models.map((m) => m.externalId));
    for (const id of externalIds) {
      if (!found.has(id)) console.warn(`  ⚠️ video model "${id}" not found — skipping`);
    }
    allowedVideoModelIds = models.map((m) => m.id);
  }

  const planService = new PlanService();
  const plan = await planService.create({
    name,
    monthlyPrice: pricing.monthlyPriceInr,
    quarterlyPrice: pricing.quarterlyPriceInr,
    yearlyPrice: pricing.yearlyPriceInr,
    tokenLimit: pricing.tokenLimit,
    monthlyVideoCredits: pricing.monthlyVideoCredits,
    restrictToFreeModels: false,
    documentGenEnabled: true,
    imageGenEnabled: true,
    videoGenEnabled: pricing.monthlyVideoCredits > 0,
    features: { maxModels: -1, attachments: true, support: "priority" },
    allowedVideoModelIds,
  });

  console.log(`\n✅ Plan "${plan.name}" created (id=${plan.id}) and synced to Cashfree for all 3 billing cycles.`);
}

main()
  .catch((error) => {
    console.error("Failed to create plan:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
