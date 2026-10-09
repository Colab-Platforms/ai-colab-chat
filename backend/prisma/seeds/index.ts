import prisma from "@root/prisma";
import { seedRoles } from "./roles.seed.js";
import { seedModelProviders } from "./modelProviders.seed.js";
import { seedModels } from "./models.seed.js";
import { seedPlans } from "./plans.seed.js";
import { seedSuperAdmin } from "./superAdmin.seed.js";
import { seedAssistants } from "./assistants.seed.js";
import { backfillCreditWallets } from "./backfillCreditWallets.seed.js";

const seedRegistry = {
  roles: seedRoles,
  modelProviders: seedModelProviders,
  models: seedModels,
  plans: seedPlans,
  superAdmin: seedSuperAdmin,
  assistants: seedAssistants,
  backfillCreditWallets,
} as const;

type SeedName = keyof typeof seedRegistry;

function parseSelectedSeeds(argv: string[]): SeedName[] | null {
  const onlyArg =
    argv.find((arg) => arg.startsWith("--only=")) ??
    (() => {
      const idx = argv.indexOf("--only");
      return idx >= 0 ? `--only=${argv[idx + 1] ?? ""}` : null;
    })();

  if (!onlyArg) return null;

  const raw = onlyArg.split("=")[1]?.trim() ?? "";
  if (!raw) {
    throw new Error("Missing value for --only. Example: --only=plans or --only=roles,plans");
  }

  const requested = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const validSeeds = Object.keys(seedRegistry) as SeedName[];
  const invalidSeeds = requested.filter(
    (seedName) => !validSeeds.includes(seedName as SeedName),
  );
  if (invalidSeeds.length > 0) {
    throw new Error(
      `Invalid seed name(s): ${invalidSeeds.join(", ")}. Valid seeds: ${validSeeds.join(", ")}`,
    );
  }

  return requested as SeedName[];
}

async function main() {
  console.log("🌱 Starting seed...\n");

  const selectedSeeds = parseSelectedSeeds(process.argv.slice(2));
  const seedOrder = (Object.keys(seedRegistry) as SeedName[]).filter(
    (seedName) => !selectedSeeds || selectedSeeds.includes(seedName),
  );

  if (selectedSeeds) {
    console.log(`🎯 Running selected seeds: ${seedOrder.join(", ")}\n`);
  } else {
    console.log(`🧩 Running all seeds: ${seedOrder.join(", ")}\n`);
  }

  for (const seedName of seedOrder) {
    await seedRegistry[seedName]();
  }

  console.log("\n✅ All seeds completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
