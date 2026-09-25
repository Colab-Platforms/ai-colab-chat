export interface DailyModelUsage {
  day: string;
  modelId: number;
  modelName: string;
  tokens: number;
}

export interface DashboardSummary {
  wallet: {
    id: number;
    userId: number;
    tokensRemaining: number;
    tokensUsed: number;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  creditWallet: {
    id: number;
    userId: number;
    bundledCredits: number;
    topupCredits: number;
    creditsUsed: number;
    creditsRemaining: number;
  } | null;
  subscription: {
    subscription: Record<string, unknown> | null;
    pendingSubscription: Record<string, unknown> | null;
    freePlanTaken: boolean;
    pendingExpiresAt: Date | null;
    pendingAuthLink: string | null;
    pendingSubscriptionSessionId: string | null;
  } | null;
  dailyByModel: DailyModelUsage[];
  chartDays: number;
}
