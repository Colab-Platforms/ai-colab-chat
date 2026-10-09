import prisma from "@root/prisma.js";

export const getOverview = async () => {
  const [totalUsers, activeSubscriptions, openTickets, revenueAgg, tokensAgg] =
    await Promise.all([
      prisma.user.count({ where: { isDeleted: false } }),
      prisma.subscription.count({ where: { status: "ACTIVE" } }),
      prisma.supportRequest.count({
        where: { type: "TICKET", status: "OPEN" },
      }),
      prisma.payment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
      }),
      prisma.usageLog.aggregate({
        _sum: { totalTokens: true },
      }),
    ]);

  return {
    totalUsers,
    activeSubscriptions,
    openTickets,
    totalRevenue: revenueAgg._sum.amount ?? 0,
    totalTokensUsed: tokensAgg._sum.totalTokens ?? 0,
  };
};
