import prisma from "@root/prisma";

export async function seedModelProviders() {
    console.log("🏢 Seeding model providers...");

    const existing = await prisma.modelProvider.findFirst({ where: { name: "OpenRouter" } });

    if (existing) {
        await prisma.modelProvider.update({
            where: { id: existing.id },
            data: {
                description: "OpenRouter API - multi-model gateway",
                apiKey: process.env.OPENROUTER_API_KEY ?? null,
            },
        });
    } else {
        await prisma.modelProvider.create({
            data: {
                name: "OpenRouter",
                description: "OpenRouter API - multi-model gateway",
                apiKey: process.env.OPENROUTER_API_KEY ?? null,
            },
        });
    }

    console.log("  ✅ Model provider seeded: OpenRouter");
}
