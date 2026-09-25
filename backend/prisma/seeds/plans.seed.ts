import prisma from "@root/prisma";
import SubscriptionCashfreeService from "@/modules/subscription/subscription.cashfree.service.js";

const PLANS = [
    {
        name: "Free",
        monthlyPrice: 0,
        quarterlyPrice: 0,
        yearlyPrice: 0,
        tokenLimit: 50000,
        restrictToFreeModels: true,
        documentGenEnabled: true,
        imageGenEnabled: false,
        videoGenEnabled: false,
        monthlyVideoCredits: 0,
        features: {
            maxModels: -1,
            attachments: true,
            support: "community",
        },
    },
    {
        name: "Pro",
        monthlyPrice: 1499,
        quarterlyPrice: 4497,
        yearlyPrice: 17988,
        tokenLimit: 1000000,
        restrictToFreeModels: false,
        documentGenEnabled: true,
        imageGenEnabled: true,
        videoGenEnabled: true,
        // 200 credits/month, pegged to $0.03/credit real cost — see the $19
        // plan pricing worksheet. Video limited to Seedance 2.0 Mini + Veo
        // 3.1 Lite via PlanVideoModel (seeded below); Seedance 2.0 full is
        // Pro Plus only.
        monthlyVideoCredits: 200,
        features: {
            maxModels: -1,
            attachments: true,
            support: "priority",
        },
    },
    {
        name: "Pro Plus",
        monthlyPrice: 2799,
        quarterlyPrice: 8397,
        yearlyPrice: 33588,
        tokenLimit: 2000000,
        restrictToFreeModels: false,
        documentGenEnabled: true,
        imageGenEnabled: true,
        videoGenEnabled: true,
        // 410 credits/month — all video models unlocked, including
        // Seedance 2.0 full.
        monthlyVideoCredits: 410,
        features: {
            maxModels: -1,
            attachments: true,
            support: "priority_plus",
        },
    },
];

// Which video models each plan may use — seeded by Model.externalId so this
// doesn't depend on model-row insertion order. Free gets none (videoGenEnabled
// is false there anyway; this is belt-and-suspenders).
const PLAN_VIDEO_MODELS: Record<string, string[]> = {
    Free: [],
    Pro: ["bytedance/seedance-2.0-mini", "google/veo-3.1-lite"],
    "Pro Plus": ["bytedance/seedance-2.0", "bytedance/seedance-2.0-mini", "google/veo-3.1-lite"],
};

export async function seedPlans() {
    console.log("📋 Seeding plans...");
    const cashfreeService = new SubscriptionCashfreeService();
    const allowLocalWriteWithoutCashfreeSync =
        process.env.CASHFREE_ALLOW_DB_WITHOUT_SYNC === "true";
    const shouldSyncCashfreePlans =
        process.env.CASHFREE_APP_ID &&
        process.env.CASHFREE_APP_SECRET &&
        process.env.CASHFREE_SKIP_PLAN_SYNC !== "true";

    for (const plan of PLANS) {
        const existing = await prisma.plan.findFirst({ where: { name: plan.name } });

        let upserted: any;
        if (existing) {
            upserted = await prisma.plan.update({ where: { id: existing.id }, data: plan });
        } else {
            upserted = await prisma.plan.create({ data: plan });
        }
        if (shouldSyncCashfreePlans) {
            try {
                await cashfreeService.syncAllPlanCycles(upserted);
            } catch (error: any) {
                if (allowLocalWriteWithoutCashfreeSync) {
                    console.warn(
                        `  ⚠️ Cashfree sync failed for "${upserted.name}", local write retained due to CASHFREE_ALLOW_DB_WITHOUT_SYNC=true: ${error?.message ?? error}`,
                    );
                    continue;
                }

                if (existing) {
                    await prisma.plan.update({
                        where: { id: existing.id },
                        data: {
                            name: existing.name,
                            monthlyPrice: existing.monthlyPrice,
                            quarterlyPrice: existing.quarterlyPrice,
                            yearlyPrice: existing.yearlyPrice,
                            tokenLimit: existing.tokenLimit,
                            features: existing.features as any,
                            isActive: existing.isActive,
                            isDeleted: existing.isDeleted,
                        },
                    });
                } else {
                    await prisma.plan.delete({ where: { id: upserted.id } });
                }

                throw error;
            }
        }
    }

    if (process.env.CASHFREE_SKIP_PLAN_SYNC === "true") {
        console.log("  ℹ️ Cashfree sync explicitly disabled via CASHFREE_SKIP_PLAN_SYNC=true");
    }

    console.log(`  ✅ Plans seeded: ${PLANS.map((p) => p.name).join(", ")}`);

    console.log("🎬 Seeding plan video-model allow-lists...");
    for (const [planName, externalIds] of Object.entries(PLAN_VIDEO_MODELS)) {
        const plan = await prisma.plan.findFirst({ where: { name: planName } });
        if (!plan) continue;

        // Clear and re-write rather than diffing — the allow-list is small
        // and this keeps the seed idempotent without a separate "remove
        // models no longer in the list" pass.
        await prisma.planVideoModel.deleteMany({ where: { planId: plan.id } });

        for (const externalId of externalIds) {
            const model = await prisma.model.findFirst({ where: { externalId } });
            if (!model) {
                console.warn(`  ⚠️ Video model "${externalId}" not found — skipping for plan "${planName}"`);
                continue;
            }
            await prisma.planVideoModel.create({ data: { planId: plan.id, modelId: model.id } });
        }
    }
    console.log("  ✅ Plan video-model allow-lists seeded");

    console.log("💳 Seeding credit pricing config...");
    // costPerCreditInr is the RAW cost basis, no margin: $0.03/credit ×
    // ₹94.98/$ ≈ ₹2.85. A top-up's amount is de-taxed, has marginPercent
    // (10-20%, default 15) taken off the top, and only what's left converts
    // to credits at this cost — see calculateTopUpCredits in walletUtils.ts.
    const creditPricingData = { costPerCreditInr: 2.85, marginPercent: 15, gstPercent: 18 };
    const existingPricing = await prisma.creditPricingConfig.findFirst();
    if (existingPricing) {
        await prisma.creditPricingConfig.update({
            where: { id: existingPricing.id },
            data: creditPricingData,
        });
    } else {
        await prisma.creditPricingConfig.create({ data: creditPricingData });
    }
    console.log("  ✅ Credit pricing config seeded (₹2.85/credit cost, 15% margin, 18% GST)");
}
