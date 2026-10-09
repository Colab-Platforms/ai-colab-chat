"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import { SettingsCard, SettingsHeader } from "@/components/settings/settings-ui";
import { DailyTokensBarChart, ModelShareList } from "@/components/dashboard/usage-extra-charts";
import { formatCompactNumber } from "@/lib/utils";
import {
  ModelUsageLineChart,
  type DailyModelUsageRow,
} from "@/components/dashboard/model-usage-line-chart";
import { dashboardService } from "@/lib/services";
import { CircleDashed, Clapperboard, BadgeCheck, BarChart3, Loader2 } from "lucide-react";
import Link from "next/link";
import { StatValue } from "@/components/dashboard/stat-value";

export default function DashboardPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<any>(null);
  const [creditWallet, setCreditWallet] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [dailyByModel, setDailyByModel] = useState<DailyModelUsageRow[]>([]);
  const [chartDays, setChartDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await dashboardService.getSummary();
        if (cancelled) return;

        const data = res?.data?.data;

        setWallet(data?.wallet ?? null);
        setCreditWallet(data?.creditWallet ?? null);
        setSubscription(
          data?.subscription?.subscription ??
            data?.subscription?.subscription ??
            data?.subscription ??
            null,
        );
        setChartDays(data?.chartDays ?? 30);
        setDailyByModel(Array.isArray(data?.dailyByModel) ? data.dailyByModel : []);
      } catch {
        // silently swallow — UI shows zeros
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const total = wallet ? wallet.tokensRemaining + wallet.tokensUsed : 0;
  const usagePercent = total > 0 ? (wallet.tokensUsed / total) * 100 : 0;

  const modelCount = new Set(dailyByModel.map((r) => r.modelName)).size;
  const periodTokens = dailyByModel.reduce((sum, r) => sum + r.tokens, 0);
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  const periodEnd = wallet?.currentPeriodEnd ? new Date(wallet.currentPeriodEnd) : null;
  const daysLeft = periodEnd ? Math.max(0, Math.ceil((periodEnd.getTime() - Date.now()) / 86_400_000)) : null;
  const planPrice = Number(subscription?.plan?.monthlyPrice ?? 0);

  const stats = [
    {
      label: "Tokens left",
      icon: CircleDashed,
      value: <StatValue value={wallet?.tokensRemaining ?? 0} />,
      sub: `of ${formatCompactNumber(total)} this cycle`,
    },
    {
      label: "Video credits",
      icon: Clapperboard,
      value: <StatValue value={creditWallet?.creditsRemaining ?? 0} />,
      sub: `${creditWallet?.bundledCredits ?? 0} plan · ${creditWallet?.topupCredits ?? 0} top-up`,
      href: "/profile/wallet",
    },
    {
      label: "Plan",
      icon: BadgeCheck,
      value: subscription?.plan?.name || "None",
      sub: subscription
        ? `${planPrice > 0 ? `₹${planPrice.toLocaleString("en-IN")}/mo · ` : ""}${
            subscription.expiresAt ? `expires ${fmtDate(subscription.expiresAt)}` : "active"
          }`
        : "No active plan",
      href: "/profile/subscription",
    },
    {
      label: "Used this cycle",
      icon: BarChart3,
      value: <StatValue value={wallet?.tokensUsed ?? periodTokens} />,
      sub: `${modelCount} model${modelCount === 1 ? "" : "s"} used`,
    },
  ];

  const chartDescription = wallet?.currentPeriodStart
    ? "Total tokens per day by model since your current plan renewed (UTC)."
    : `Total tokens per day by model — last ${chartDays} days (UTC).`;

  return (
    <div>
      <SettingsHeader title={`Welcome back, ${user?.firstName ?? ""}`} description="Here's your account at a glance." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const card = (
            <SettingsCard className="h-full p-4 transition-colors hover:border-border-strong">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <stat.icon className="h-3.5 w-3.5 text-accent-ink" />
                {stat.label}
              </p>
              <p className="mt-2.5 text-[26px] font-semibold leading-none tracking-tight">{stat.value}</p>
              <p className="mt-2 truncate text-xs text-faint">{stat.sub}</p>
            </SettingsCard>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="block h-full">
              {card}
            </Link>
          ) : (
            <div key={stat.label} className="h-full">
              {card}
            </div>
          );
        })}
      </div>

      {wallet && (
        <SettingsCard className="mt-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Token usage this cycle</h2>
            {periodEnd && (
              <p className="text-xs text-muted-foreground">
                {fmtDate(wallet.currentPeriodStart)} – {periodEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                {daysLeft !== null && ` · ${daysLeft} days left`}
              </p>
            )}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.max(Math.min(usagePercent, 100), wallet.tokensUsed > 0 ? 1.5 : 0)}%` }}
            />
          </div>
          <div className="mt-2.5 flex justify-between text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{wallet.tokensUsed.toLocaleString()}</span> used · {usagePercent.toFixed(1)}%
            </span>
            <span>
              <span className="font-medium text-foreground">{wallet.tokensRemaining.toLocaleString()}</span> left of {total.toLocaleString()}
            </span>
          </div>
        </SettingsCard>
      )}

      {/* Graph 1 — the original per-model line chart, unchanged */}
      <SettingsCard className="mt-4 p-5">
        <h2 className="text-sm font-semibold">Usage by model</h2>
        <p className="mb-4 mt-0.5 text-xs text-muted-foreground">{chartDescription}</p>
        <ModelUsageLineChart rows={dailyByModel} days={chartDays} />
      </SettingsCard>

      {/* Graphs 2 and 3 — daily totals and each model's share */}
      <div className="mt-4 space-y-4">
        <SettingsCard className="p-5">
          <h2 className="text-sm font-semibold">Daily tokens</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Tokens used each day, stacked by model.</p>
          <DailyTokensBarChart rows={dailyByModel} days={chartDays} />
        </SettingsCard>
        <SettingsCard className="p-5">
          <h2 className="text-sm font-semibold">Model share</h2>
          <p className="mb-4 mt-0.5 text-xs text-muted-foreground">Where your tokens went this cycle.</p>
          <ModelShareList rows={dailyByModel} />
        </SettingsCard>
      </div>
    </div>
  );
}
