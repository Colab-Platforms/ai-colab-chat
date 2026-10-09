"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { adminService } from "@/lib/services";
import { Users, CreditCard, LifeBuoy, Coins, IndianRupee, Loader2 } from "lucide-react";

interface AdminOverview {
  totalUsers: number;
  activeSubscriptions: number;
  openTickets: number;
  totalRevenue: number;
  totalTokensUsed: number;
}

export default function AdminOverviewPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await adminService.getOverview();
        if (!cancelled) setOverview(res?.data?.data ?? null);
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

  const stats = [
    {
      label: "Total Users",
      value: overview?.totalUsers?.toLocaleString() || "0",
      icon: Users,
      iconColor: "text-blue-500",
    },
    {
      label: "Active Subscriptions",
      value: overview?.activeSubscriptions?.toLocaleString() || "0",
      icon: CreditCard,
      iconColor: "text-purple-500",
    },
    {
      label: "Open Tickets",
      value: overview?.openTickets?.toLocaleString() || "0",
      icon: LifeBuoy,
      iconColor: "text-amber-500",
    },
    {
      label: "Total Revenue",
      value: `₹${Number(overview?.totalRevenue ?? 0).toLocaleString()}`,
      icon: IndianRupee,
      iconColor: "text-emerald-500",
    },
    {
      label: "Total Tokens Used",
      value: overview?.totalTokensUsed?.toLocaleString() || "0",
      icon: Coins,
      iconColor: "text-teal-500",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Platform-wide aggregates across users, billing, support, and usage.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((stat) => (
          <Card
            key={stat.label}
            className="bg-card/90 backdrop-blur-sm border-border/30 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold mt-1.5">{stat.value}</p>
                </div>
                <div
                  className={`w-10 h-10 rounded-xl bg-background/50 flex items-center justify-center ${stat.iconColor}`}
                >
                  <stat.icon className="w-5 h-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
