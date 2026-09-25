import WalletService from "@/modules/wallet/wallet.service.js";
import CreditWalletService from "@/modules/credit-wallet/creditWallet.service.js";
import SubscriptionService from "@/modules/subscription/subscription.service.js";
import UsageLogService from "@/modules/usage-log/usageLog.service.js";
import type { DashboardSummary } from "./dashboard.types.js";

const walletService = new WalletService();
const creditWalletService = new CreditWalletService();
const subscriptionService = new SubscriptionService();
const usageLogService = new UsageLogService();

class DashboardService {
  async getSummary(userId: number): Promise<DashboardSummary> {
    // Fetch wallet and subscription in parallel; both can fail gracefully —
    // a missing CreditWallet (pre-existing subscription, or Free plan) is
    // expected, not an error.
    const [walletResult, creditWalletResult, subscriptionResult] = await Promise.allSettled([
      walletService.getWallet(userId),
      creditWalletService.getWallet(userId),
      subscriptionService.getCurrent(userId),
    ]);

    const wallet =
      walletResult.status === "fulfilled" ? walletResult.value : null;

    const creditWallet =
      creditWalletResult.status === "fulfilled" ? creditWalletResult.value : null;

    const subscription =
      subscriptionResult.status === "fulfilled"
        ? subscriptionResult.value
        : null;

    // Determine chart range: use billing period length or fall back to 30 days.
    let chartDays = 30;
    if (wallet?.currentPeriodStart) {
      const start = new Date(wallet.currentPeriodStart);
      const today = new Date();
      const startUtc = Date.UTC(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
      );
      const todayUtc = Date.UTC(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
      const diffDays =
        Math.floor((todayUtc - startUtc) / (1000 * 60 * 60 * 24)) + 1;
      if (Number.isFinite(diffDays) && diffDays >= 1) {
        chartDays = Math.min(diffDays, 90);
      }
    }

    const dailyByModel = await usageLogService
      .getDailyTokensByModel(userId, chartDays)
      .catch(() => []);

    return { wallet, creditWallet, subscription, dailyByModel, chartDays };
  }
}

export default DashboardService;
