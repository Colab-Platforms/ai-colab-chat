import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import {
  getPaginationOptions,
  formatPaginationResponse,
} from "@/utils/paginationUtils.js";
import { buildPrismaQuery } from "prisma-qb";
import PaymentService from "@/modules/payments/payment.service.js";

const paymentService = new PaymentService();

class CreditWalletService {
  async getWallet(userId: number) {
    const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new ApiError(
        "Credit wallet not found. Please subscribe to a plan first",
        STATUS_CODES.NOT_FOUND,
      );
    }
    // creditsRemaining is the single number the frontend shows/compares
    // against — bundledCredits/topupCredits stay for the breakdown UI.
    return {
      ...wallet,
      creditsRemaining: wallet.bundledCredits + wallet.topupCredits,
    };
  }

  async getTransactions(query: any, userId: number) {
    const { take, skip, page, pageSize } = getPaginationOptions(query, 10);

    const { where: qbWhere, orderBy } = buildPrismaQuery({
      query,
      searchFields: [
        { field: "referenceId", model: "creditTransaction" },
        { field: "type", model: "creditTransaction" },
      ],
      filterFields: [
        { key: "type", field: "type", type: "string" },
        { key: "walletId", field: "walletId", type: "number" },
      ],
      sortFields: [
        { key: "createdAt", field: "createdAt" },
        { key: "amount", field: "amount" },
      ],
      defaultSort: { key: "createdAt", order: "desc" },
      allowedQueryKeys: ["page", "pageSize"],
    });

    const where: any = { ...qbWhere, userId };

    const [transactions, totalRecords] = await Promise.all([
      prisma.creditTransaction.findMany({ where, skip, take, orderBy }),
      prisma.creditTransaction.count({ where }),
    ]);

    return formatPaginationResponse(transactions, totalRecords, page, pageSize);
  }

  /** Pay-as-you-go top-up — delegates order creation to PaymentService, which owns Cashfree integration. */
  async createTopUp(userId: number, amountInr: number) {
    return paymentService.createCreditTopUp(userId, amountInr);
  }

  /** Lets the frontend compute a live "≈ N credits" preview before paying. */
  async getPricing() {
    const pricing = await prisma.creditPricingConfig.findFirst({ orderBy: { id: "desc" } });
    if (!pricing) {
      throw new ApiError("Credit pricing isn't configured", STATUS_CODES.SERVER_ERROR);
    }
    return {
      costPerCreditInr: Number(pricing.costPerCreditInr),
      marginPercent: Number(pricing.marginPercent),
      gstPercent: Number(pricing.gstPercent),
    };
  }
}

export default CreditWalletService;
