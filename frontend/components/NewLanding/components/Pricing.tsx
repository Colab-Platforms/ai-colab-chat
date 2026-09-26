"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Sparkles, Loader2, Lock } from "lucide-react";
import { planService } from "@/lib/services";
import { useAuth } from "@/context/auth-context";
import { getPlanFeatureLines } from "@/lib/planFeatures";

// ─────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────
interface PlanTier {
  id: number;
  name: string;
  price: number;
  description: string;
  features: string[];
  isPopular: boolean;
  isFree: boolean;
}

// ─────────────────────────────────────────────────────
//  Fallback / Default data (in case API is empty/fails)
// ─────────────────────────────────────────────────────
const FALLBACK_PLANS: PlanTier[] = [
  {
    id: 1,
    name: "Free",
    price: 0,
    description: "Get started at no cost for your first month.",
    features: [
      "Unlimited AI Models",
      "File Uploads & Attachments",
      "Community Support",
      "50,000 monthly tokens",
    ],
    isPopular: false,
    isFree: true,
  },
  {
    id: 2,
    name: "Plus",
    price: 1799,
    description: "Ideal for Plus users.",
    features: [
      "Unlimited AI Models",
      "File Uploads & Attachments",
      "Priority Support",
      "10,00,000 monthly tokens",
    ],
    isPopular: true,
    isFree: false,
  },
  {
    id: 3,
    name: "Pro",
    price: 3699,
    description: "Ideal for Pro users.",
    features: [
      "Unlimited AI Models",
      "File Uploads & Attachments",
      "Priority Plus Support",
      "20,00,000 monthly tokens",
    ],
    isPopular: false,
    isFree: false,
  },
];

const CheckIcon = () => (
  <div className="w-5 h-5 rounded-full bg-white flex items-center justify-center shrink-0">
    <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" strokeWidth="3.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  </div>
);

export default function Pricing() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanTier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await planService.list({
          page: "1",
          pageSize: "100",
        });

        if (!response.data.status) {
          setPlans(FALLBACK_PLANS);
          return;
        }

        const outer = response.data.data;
        const planList: any[] = Array.isArray(outer)
          ? outer
          : Array.isArray(outer?.data)
          ? outer.data
          : outer?.records ?? [];

        const parsed = planList
          .filter((plan: any) => plan.isActive && !plan.isDeleted)
          .sort((a: any, b: any) => Number(a.monthlyPrice) - Number(b.monthlyPrice))
          .map((plan: any) => {
            // Shared parser (lib/planFeatures.ts) — also used by the real
            // subscription page, so marketing copy stays in sync with what a
            // subscriber actually gets.
            const features = getPlanFeatureLines(plan).included;

            const isFree = Number(plan.monthlyPrice) === 0;

            return {
              id: plan.id,
              name: plan.name,
              price: Number(plan.monthlyPrice),
              description:
                plan.description ||
                (isFree ? "Get started at no cost for your first month." : `Ideal for ${plan.name} users.`),
              features,
              isPopular: plan.name.toLowerCase() === "pro",
              isFree,
            };
          });

        if (parsed.length === 0) {
          setPlans(FALLBACK_PLANS);
        } else {
          setPlans(parsed);
        }
      } catch (err) {
        console.error("Error fetching pricing plans in new landing:", err);
        setPlans(FALLBACK_PLANS);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const getPlanHref = (planId: number) => {
    const target = `/profile/subscription?planId=${planId}&billingCycle=MONTHLY`;
    if (user) return target;
    return `/login?redirect=${encodeURIComponent(target)}`;
  };

  const getPriceDetails = (plan: PlanTier) => {
    if (plan.isFree) {
      return {
        amount: "Free",
        period: "",
      };
    }

    return {
      amount: `₹${plan.price.toLocaleString("en-IN")}`,
      period: "/month + GST",
    };
  };

  if (loading) {
    return (
      <section id="pricing" className="bg-[#09090b] text-white py-16 md:py-24 border-t border-neutral-900">
        <div className="container max-w-7xl mx-auto px-5 sm:px-10 lg:px-0 flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <p className="text-sm text-neutral-400">Loading plans…</p>
        </div>
      </section>
    );
  }

  // Ensure we have at least Free, Pro, and Pro Plus mapped
  const freePlan = plans.find((p) => p.isFree) || FALLBACK_PLANS[0];
  const proPlan = plans.find((p) => p.isPopular) || FALLBACK_PLANS[1];
  const proPlusPlan = plans.find((p) => !p.isFree && !p.isPopular) || FALLBACK_PLANS[2];

  return (
    <section id="pricing" className="bg-[#09090b] text-white py-16 md:py-24 border-t border-[#111115] relative overflow-hidden">
      {/* Background visual glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="container max-w-7xl mx-auto px-5 sm:px-10 lg:px-0 w-full relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center text-center w-full pb-16 gap-4">
          <div className="px-6 py-2 rounded-full bg-[#292929] flex items-center justify-center gap-3 w-fit border-2 border-[#3f3f3f] mb-2">
            <div className="w-3 h-3 bg-[#3c3b3b] rounded-full" />
            <p className="text-foreground">Pricing</p>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight">
            Clear Pricing Plans
            <br />
            That Scale With You
          </h2>
        </div>

        {/* Pricing Layout Container */}
        <div className="relative max-w-7xl mx-auto mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 rounded-[32px] border border-neutral-800/80 bg-neutral-950/40 backdrop-blur-sm">
            
            {/* Free Plan Card */}
            <div className="p-8 lg:p-12 flex flex-col justify-between lg:border-r lg:border-neutral-800/60 min-h-[500px]">
              <div>
                <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase">FREE</span>
                <div className="mt-6 flex items-baseline">
                  <h3 className="text-4xl sm:text-5xl font-bold text-white tracking-tight">Free</h3>
                </div>
                <p className="mt-4 text-sm text-neutral-400 leading-relaxed min-h-[40px]">
                  {freePlan.description}
                </p>

                <div className="mt-8">
                  <Link href={getPlanHref(freePlan.id)}>
                    <button className="w-full py-3 px-6 rounded-full bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white font-medium text-sm transition-all duration-200">
                      Start Free
                    </button>
                  </Link>
                </div>
              </div>

              <div className="mt-10 pt-8 border-t border-neutral-800/80">
                <ul className="space-y-4">
                  {freePlan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-sm text-neutral-300">
                      <CheckIcon />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Highlighted Pro Plan Card */}
            <div className="relative my-8 lg:-my-8 lg:py-16 p-8 lg:px-10 bg-[#0e0a17]/95 border-2 border-purple-500/80 rounded-3xl shadow-[0_0_50px_rgba(139,92,246,0.15)] flex flex-col justify-between min-h-[520px] z-20">
              
              {/* Hanging "Most Popular" Ribbon */}
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/50 bg-[#160f2e] px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-purple-300 shadow-md">
                  <Sparkles className="h-3 w-3 text-purple-400" />
                  Most Popular
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider text-purple-300 uppercase">PRO PLAN</span>
                </div>
                
                {(() => {
                  const details = getPriceDetails(proPlan);
                  return (
                    <div className="mt-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl sm:text-5xl font-bold text-white tracking-tight">{details.amount}</span>
                        {details.period && <span className="text-neutral-400 text-sm font-medium">{details.period}</span>}
                      </div>
                    </div>
                  );
                })()}

                <p className="mt-4 text-sm text-neutral-400 leading-relaxed min-h-[40px]">
                  {proPlan.description}
                </p>

                <div className="mt-8">
                  <Link href={getPlanHref(proPlan.id)}>
                    <button className="w-full py-3 px-6 rounded-full bg-white hover:bg-neutral-200 text-black font-semibold text-sm transition-all duration-200 shadow-lg shadow-purple-500/10">
                      Get Started - Pro
                    </button>
                  </Link>
                </div>
              </div>

              <div className="mt-10 pt-8 border-t border-purple-950/60">
                <ul className="space-y-4">
                  {proPlan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-sm text-neutral-200">
                      <CheckIcon />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Pro Plus Plan Card */}
            <div className="p-8 lg:p-12 flex flex-col justify-between lg:border-l lg:border-neutral-800/60 min-h-[500px]">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold tracking-wider text-neutral-400 uppercase">PLUS PLAN</span>
                </div>

                {(() => {
                  const details = getPriceDetails(proPlusPlan);
                  return (
                    <div className="mt-6">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl sm:text-5xl font-bold text-white tracking-tight">{details.amount}</span>
                        {details.period && <span className="text-neutral-400 text-sm font-medium">{details.period}</span>}
                      </div>
                    </div>
                  );
                })()}

                <p className="mt-4 text-sm text-neutral-400 leading-relaxed min-h-[40px]">
                  {proPlusPlan.description}
                </p>

                <div className="mt-8">
                  <Link href={getPlanHref(proPlusPlan.id)}>
                    <button className="w-full py-3 px-6 rounded-full bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white font-medium text-sm transition-all duration-200">
                      Choose Plus
                    </button>
                  </Link>
                </div>
              </div>

              <div className="mt-10 pt-8 border-t border-neutral-800/80">
                <ul className="space-y-4">
                  {proPlusPlan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-3 text-sm text-neutral-300">
                      <CheckIcon />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

          </div>
        </div>

        {/* Trust / billing disclosure note */}
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <p className="flex items-center gap-2 text-sm font-medium text-neutral-300">
            <Lock className="h-4 w-4" />
            Payments are securely processed by Cashfree
          </p>
          <p className="max-w-2xl text-sm text-neutral-400 leading-relaxed">
            By subscribing, you agree to our{" "}
            <Link href="/terms" className="text-neutral-200 underline underline-offset-4 hover:text-white">
              Terms of Use
            </Link>
            . Higher-tier models draw down your tokens faster via a disclosed
            per-model multiplier — please read the Terms carefully for full
            billing details before you pay.
          </p>
        </div>

      </div>
    </section>
  );
}
