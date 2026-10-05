import prisma from "@root/prisma";
import { hashPassword } from "@/utils/auth";
import dayjs from "dayjs";

const USERS = [
    {
        firstName: "Super",
        lastName: "Admin",
        email: "superadmin@aicolab.com",
        password: "SuperAdmin@123",
        roles: ["USER", "ADMIN", "SUPER_ADMIN"],
    },
    {
        firstName: "Admin",
        lastName: "User",
        email: "admin@aicolab.com",
        password: "Admin@123",
        roles: ["USER", "ADMIN"],
    },
];

export async function seedSuperAdmin() {
    console.log("👑 Seeding admin users...");

    // Find Pro plan (top tier, ₹3699 — better plan for admins), fall back to Free
    const plan =
        (await prisma.plan.findFirst({ where: { name: "Pro" } })) ||
        (await prisma.plan.findFirst({ where: { name: "Free" } }));

    for (const userData of USERS) {
        const existing = await prisma.user.findFirst({ where: { email: userData.email } });

        let userId: number;

        if (existing) {
            userId = existing.id;
            console.log(`  ℹ️ User already exists: ${userData.email}`);
        } else {
            const hashedPassword = await hashPassword(userData.password);
            const user = await prisma.user.create({
                data: {
                    firstName: userData.firstName,
                    lastName: userData.lastName,
                    email: userData.email,
                    password: hashedPassword,
                    isVerified: true,
                    isActive: true,
                },
            });
            userId = user.id;
        }

        // Assign all roles
        for (const roleName of userData.roles) {
            const role = await prisma.role.findUnique({ where: { name: roleName } });
            if (!role) continue;

            await prisma.userRole.upsert({
                where: { userId_roleId: { userId, roleId: role.id } },
                update: {},
                create: { userId, roleId: role.id },
            });
        }

        // Assign plan subscription + wallet if not already present
        if (plan) {
            const existingSub = await prisma.subscription.findFirst({ where: { userId } });
            if (!existingSub) {
                const now = new Date();
                const periodEnd = dayjs(now).add(1, "month").toDate();

                await prisma.subscription.create({
                    data: {
                        userId,
                        planId: plan.id,
                        status: "ACTIVE",
                        billingCycle: "MONTHLY",
                        startedAt: now,
                        expiresAt: periodEnd,
                        autoRenew: true,
                    },
                });

                await prisma.userWallet.create({
                    data: {
                        userId,
                        tokensRemaining: plan.tokenLimit,
                        tokensUsed: 0,
                        currentPeriodStart: now,
                        currentPeriodEnd: periodEnd,
                    },
                });

                console.log(`  💳 Assigned ${plan.name} plan to ${userData.email}`);
            }
        }

        console.log(`  ✅ ${userData.email} — roles: ${userData.roles.join(", ")}`);
    }
}
