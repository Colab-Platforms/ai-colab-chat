"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { CircleCheck, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { planService } from "@/lib/services";
import { getPlanFeatureLines } from "@/lib/planFeatures";
import { ScrollReveal } from "./ScrollReveal";

// ─────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────
interface PlanTier {
  id: number;
  name: string;
  price: number;
  description: string;
  features: string[];
  isPopular?: boolean;
  isFree?: boolean;
}

// ─────────────────────────────────────────────────────
//  PricingCard — reusable UI card (exported for reuse)
// ─────────────────────────────────────────────────────
export interface PricingCardProps {
  title: string;
  /** Pre-formatted price string, e.g. "₹999/month" or "Free" */
  price: string;
  description?: string;
  features: string[];
  cta: string;
  href: string;
  featured?: boolean;
  /** True when this is the free plan (free only for the 1st month) */
  isFreeFirstMonth?: boolean;
  delay?: number;
}

export function PricingCard({
  title,
  price,
  description,
  features,
  cta,
  href,
  featured = false,
  isFreeFirstMonth = false,
  delay = 0,
}: PricingCardProps) {
  return (
    <ScrollReveal delay={delay} className="h-full">
      <div
        className={cn(
          "relative flex flex-col h-full rounded-2xl border p-7 text-left transition-all duration-300",
          "bg-white/60 dark:bg-[#0f0208]/60 backdrop-blur-sm",
          featured
            ? "border-landing-primary dark:border-landing-primary shadow-xl shadow-pink-200/30 dark:shadow-pink-900/20 scale-[1.03] z-10"
            : "border-gray-100 dark:border-landing-primary/40 hover:border-landing-primary/40 dark:hover:border-landing-primary/80 hover:shadow-lg hover:shadow-pink-100/30 dark:hover:shadow-pink-900/10"
        )}
        aria-label={`${title} plan`}
      >
        {/* Most Popular ribbon */}
        {featured && (
          <div className="absolute -top-3.5 inset-x-0 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-landing-primary px-4 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-md shadow-landing-primary/60">
              <Sparkles className="h-3 w-3" />
              Most Popular
            </span>
          </div>
        )}

        {/* Plan name badge */}
        <div className="flex items-center gap-2 mt-2">
          <Badge
            variant={featured ? "default" : "secondary"}
            className={cn(
              "rounded-md uppercase tracking-wider text-[11px] font-semibold",
              featured &&
                "bg-landing-primary/10 dark:bg-landing-primary/60 text-landing-primary dark:text-landing-primary border-landing-primary dark:border-landing-primary"
            )}
          >
            {title}
          </Badge>
        </div>

        {/* Price */}
        <h3
          className={cn(
            "mt-5 text-4xl font-bold tracking-tight",
            featured
              ? "text-landing-primary dark:text-landing-primary"
              : "text-landing-primary dark:text-landing-primary"
          )}
        >
          {price}
        </h3>

        {/* Description */}
        {description && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 min-h-[40px] leading-relaxed">
            {description}
          </p>
        )}

        {/* Divider */}
        <div className="my-6 border-t border-gray-100 dark:border-landing-primary/40" />

        {/* Features list */}
        <ul className="space-y-3 mb-8 grow">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-start text-sm text-gray-700 dark:text-gray-300"
            >
              <CircleCheck
                className={cn(
                  "mr-3 mt-0.5 h-4 w-4 shrink-0",
                  featured
                    ? "text-landing-primary dark:text-landing-primary"
                    : "text-landing-primary dark:text-landing-primary"
                )}
                aria-hidden
              />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="mt-auto">
          <Link href={href}>
            <Button
              size="lg"
              className={cn(
                "w-full font-semibold transition-all",
                featured
                  ? "bg-landing-primary hover:bg-landing-primary-hover text-white shadow-landing-primary/20"
                  : "border border-landing-primary/50 dark:border-landing-primary/50 text-landing-primary dark:text-white bg-transparent hover:bg-landing-primary/10 dark:bg-landing-primary/10 dark:hover:bg-landing-primary/30"
              )}
              variant={featured ? "default" : "outline"}
            >
              {cta}
            </Button>
          </Link>
        </div>
      </div>
    </ScrollReveal>
  );
}

// ─────────────────────────────────────────────────────
//  PricingSection — full section with header + cards
// ─────────────────────────────────────────────────────
export function PricingSection() {
  const { user } = useAuth();
  const [plans, setPlans] = React.useState<PlanTier[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [plansError, setPlansError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchPlans = async () => {
      try {
        setPlansError(null);
        const response = await planService.list({
          page: "1",
          pageSize: "100",
        });
        if (!response.data.status) {
          setPlans([]);
          setPlansError("Our plans are being refreshed right now. Check back in a moment.");
          return;
        }

        const outer = response.data.data;
        const planList: any[] = Array.isArray(outer)
          ? outer
          : Array.isArray(outer?.data)
          ? outer.data
          : outer?.records ?? [];

        const activePlans = planList.filter((plan: any) => plan.isActive && !plan.isDeleted);
        // The entry-level PAID plan is "Most Popular", whatever it happens to
        // be named — matching on the literal name "pro" broke the moment a
        // plan got renamed (see the identical fix in NewLanding/Pricing.tsx).
        const cheapestPaidPrice = Math.min(
          ...activePlans
            .map((plan: any) => Number(plan.monthlyPrice))
            .filter((price: number) => price > 0),
        );

        const parsed = activePlans
          .sort(
            (a: any, b: any) =>
              Number(a.monthlyPrice) - Number(b.monthlyPrice)
          )
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
                (isFree
                  ? "Get started at no cost for your first month."
                  : `Ideal for ${plan.name} users.`),
              features,
              isPopular: !isFree && Number(plan.monthlyPrice) === cheapestPaidPrice,
              isFree,
            };
          });

        if (parsed.length === 0) {
          setPlans([]);
          setPlansError("No active plans are available at the moment.");
          return;
        }

        setPlans(parsed);
      } catch (err) {
        console.error("Error fetching pricing plans:", err);
        setPlans([]);
        setPlansError("Our plans are being refreshed right now. Check back in a moment.");
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const formatPrice = (price: number): string => {
    if (price === 0) return "Free";
    return `₹${price.toLocaleString("en-IN")}/mo + GST`;
  };

  const getPlanHref = (planId: number) => {
    const target = `/profile/subscription?planId=${planId}`;
    if (user) return target;
    return `/login?redirect=${encodeURIComponent(target)}`;
  };

  return (
    <section id="pricing" className="py-24 bg-[#e7e4eb] dark:bg-[#060104]">
      <div className="container mx-auto px-6">

        {/* ── Section header — same ScrollReveal pattern as Testimonials & FAQ ── */}
        <ScrollReveal
          delay={0.1}
          className="flex flex-col items-center text-center max-w-4xl mx-auto mb-14"
        >
          <span className="border border-landing-primary/50 dark:border-landing-primary/60 text-landing-primary dark:landing-primary bg-landing-primary/10 dark:bg-landing-primary/40 py-1 px-4 rounded-full text-xs font-medium tracking-wide mb-5">
            Plans & Pricing
          </span>
          <h2 className="text-4xl max-md:text-3xl font-bold text-landing-primary dark:text-landing-primary tracking-tight">
            Invest in intelligence. Simple, transparent pricing
          </h2>
          <p className="mt-4 text-gray-600 dark:text-gray-400 text-balance">
            Start free for your first month — no credit card needed. Upgrade
            when you&rsquo;re ready and unlock the full power of 15+ AI models,
            rolling context, and team collaboration.
          </p>
        </ScrollReveal>

        {/* ── Cards ── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[320px] gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-pink-400" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading plans…
            </p>
          </div>
        ) : plansError ? (
          <div className="flex items-center justify-center min-h-[220px]">
            <p className="text-sm text-gray-600 dark:text-gray-300 text-center">
              {plansError}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto items-stretch">
            {plans.map((plan, i) => (
              <PricingCard
                key={plan.id}
                delay={0.15 + i * 0.1}
                title={plan.name}
                price={formatPrice(plan.price)}
                description={plan.description}
                features={plan.features}
                isFreeFirstMonth={plan.isFree}
                cta={
                  plan.isFree
                    ? "Start Free"
                    : plan.isPopular
                    ? "Get Started — Pro"
                    : `Choose ${plan.name}`
                }
                href={getPlanHref(plan.id)}
                featured={plan.isPopular}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
