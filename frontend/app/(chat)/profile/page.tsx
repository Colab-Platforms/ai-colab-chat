"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/auth-context";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ModelUsageLineChart,
  type DailyModelUsageRow,
} from "@/components/dashboard/model-usage-line-chart";
import { dashboardService } from "@/lib/services";
import { Wallet, CreditCard, Coins, TrendingUp, Loader2, Video } from "lucide-react";
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

  const stats = [
    {
      label: "Tokens Remaining",
      value: <StatValue value={wallet?.tokensRemaining ?? 0} />,
      icon: Coins,
      gradient: "from-emerald-500/20 to-teal-500/10",
      iconColor: "text-emerald-500",
    },
    {
      label: "Tokens Used",
      value: <StatValue value={wallet?.tokensUsed ?? 0} />,
      icon: TrendingUp,
      gradient: "from-blue-500/20 to-indigo-500/10",
      iconColor: "text-blue-500",
    },
    {
      label: "Current Plan",
      value: subscription?.plan?.name || "None",
      icon: CreditCard,
      gradient: "from-purple-500/20 to-pink-500/10",
      iconColor: "text-purple-500",
    },
    {
      label: "Wallet Used",
      value: `${usagePercent.toFixed(1)}%`,
      icon: Wallet,
      gradient: "from-amber-500/20 to-orange-500/10",
      iconColor: "text-amber-500",
    },
    {
      label: "Video Credits",
      value: <StatValue value={creditWallet?.creditsRemaining ?? 0} />,
      icon: Video,
      gradient: "from-violet-500/20 to-fuchsia-500/10",
      iconColor: "text-violet-500",
      href: "/profile/wallet",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back,{" "}
          <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {user?.firstName}
          </span>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Here&apos;s your account overview
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 items-stretch">
        {stats.map((stat) => {
          const card = (
            <Card
              className={`h-full bg-card/90 backdrop-blur-sm border-border/30 shadow-sm hover:shadow-md transition-shadow overflow-hidden ${stat.href ? "cursor-pointer" : ""}`}
            >
              <CardContent className="p-5 h-full">
                <div className="flex items-start justify-between h-full gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider leading-tight min-h-[2rem] flex items-center">
                      {stat.label}
                    </p>
                    <p className="text-2xl font-bold mt-1.5 flex items-center">{stat.value}</p>
                  </div>
                  <div
                    className={`w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center shrink-0 ${stat.iconColor}`}
                  >
                    <stat.icon className="w-5 h-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
          return stat.href ? (
            <Link key={stat.label} href={stat.href} className="block h-full">
              {card}
            </Link>
          ) : (
            <div key={stat.label} className="h-full">{card}</div>
          );
        })}
      </div>

      {wallet && (
        <Card className="border-border/30 bg-card/90 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base">Token Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Used</span>
                <span className="font-medium">
                  {wallet.tokensUsed.toLocaleString()} /{" "}
                  {total.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{usagePercent.toFixed(1)}% used</span>
                <span>{wallet.tokensRemaining.toLocaleString()} remaining</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/30 bg-card/90 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base">Usage by model</CardTitle>
          <CardDescription>
            {wallet?.currentPeriodStart
              ? "Total tokens per day by model since your current plan renewed (UTC)."
              : `Total tokens per day by model — last ${chartDays} days (UTC).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModelUsageLineChart rows={dailyByModel} days={chartDays} />
        </CardContent>
      </Card>
    </div>
  );
}
