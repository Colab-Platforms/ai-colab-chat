"use client";

import * as React from "react";
import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Mic, Share2, Download } from "lucide-react";
import { motion, useInView } from "framer-motion";

// ---------------------------------------------------------------------------
// Shared card shell
// ---------------------------------------------------------------------------
const Card = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <div
    className={cn(
      "relative flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-7 overflow-hidden",
      "shadow-[0_1px_4px_0_rgb(0,0,0,0.06)]",
      "hover:shadow-[0_4px_20px_0_rgb(0,0,0,0.09)] hover:border-gray-200 transition-all duration-300",
      // dark: cards sit on a near-black section bg - give them enough lift
      "dark:bg-landing-primary/15 dark:border-landing-primary/60 dark:shadow-[0_1px_3px_0_rgb(0,0,0,0.4)] dark:hover:border-landing-primary/80",
      className
    )}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Animated card wrapper - stagger on scroll
// ---------------------------------------------------------------------------
const cardVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.97 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.65,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      delay,
    },
  }),
};

function AnimatedCard({
  children,
  delay = 0,
  className = "",
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px 0px" });

  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      custom={delay}
      variants={cardVariants}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Card 1 - Multi-Model Access (LEFT tall, spans 3 rows)
// ---------------------------------------------------------------------------
const models = [
  { name: "GPT-5.4",            cap: "Vision"           },
  { name: "Claude Sonnet 4.6",  cap: "Web Search"       },
  { name: "Gemini 2.0 Flash",   cap: "Standard"         },
  { name: "DeepSeek V3.2",      cap: "Standard"         },
];

const IntegrationCard = () => (
  <Card className="justify-between gap-0">
    {/* Top */}
    <div className="flex flex-col gap-5">
      {/* Icon badge */}
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-landing-primary/10 to-landing-primary/20 dark:from-landing-primary/10 dark:to-landing-primary/20">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-landing-primary dark:text-landing-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
        </svg>
      </div>

      {/* Title + description */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Multi-Model Access
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-400 dark:text-gray-500">
          Pick any model for any task.{" "}
          <span className="text-landing-primary dark:text-landing-primary font-medium">
            Switch instantly - no new tabs, no separate accounts.
          </span>
        </p>
      </div>

      {/* Model list */}
      <div className="flex flex-col divide-y divide-gray-50 dark:divide-white/[0.04]">
        {models.map((m) => (
          <div
            key={m.name}
            className="flex items-center justify-between py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-landing-primary dark:bg-landing-primary opacity-70" />
              <span className="text-sm text-gray-700 dark:text-gray-200">{m.name}</span>
            </div>
            <span className="text-[10px] font-medium text-gray-400 dark:text-gray-400 bg-gray-50 dark:bg-white/[0.07] px-2 py-0.5 rounded-full">
              {m.cap}
            </span>
          </div>
        ))}
        <div className="py-2.5 text-xs text-gray-400 dark:text-gray-500 italic">
          + many more available
        </div>
      </div>
    </div>

    {/* Bottom: quick-access features */}
    <div className="mt-6 flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 dark:border-landing-primary dark:bg-landing-primary/30 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-300">
        <Mic className="h-3.5 w-3.5 text-landing-primary dark:landing-primary" />
        Voice Input
      </div>
      <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 dark:border-landing-primary dark:bg-landing-primary/30 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-300">
        <Share2 className="h-3.5 w-3.5 text-landing-primary dark:text-landing-primary" />
        Share Chat
      </div>
      <div className="flex items-center gap-1.5 rounded-lg border border-gray-100 dark:border-landing-primary dark:bg-landing-primary/30 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-300">
        <Download className="h-3.5 w-3.5 text-landing-primary dark:text-landing-primary" />
        Install PWA
      </div>
    </div>
  </Card>
);

// ---------------------------------------------------------------------------
// Card 2 - Rolling Context Window (top-middle)
// ---------------------------------------------------------------------------
const TrackersCard = () => (
  <Card className="justify-between">
    <div>
      <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">
        Rolling Context
      </p>
      <p className="mt-0.5 text-xs text-landing-primary dark:text-landing-primary font-medium">
        Never lose what matters
      </p>
    </div>

    {/* Visual: message window diagram */}
    <div className="mt-4 flex flex-col gap-2">
      {[
        { width: "w-3/5",  faded: true  },
        { width: "w-4/5",  faded: true  },
        { width: "w-full", faded: false },
        { width: "w-4/5",  faded: false },
        { width: "w-full", faded: false },
      ].map((row, i) => (
        <div key={i} className={`${row.width} h-2.5 rounded-full ${row.faded ? "bg-gray-100 dark:bg-white/[0.07]" : "bg-landing-primary/25 dark:bg-landing-primary/40"}`} />
      ))}
    </div>

    <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
      Older messages are dropped automatically so you always stay within token limits - without losing your newest context.
    </p>
  </Card>
);

// ---------------------------------------------------------------------------
// Card 3 - Big stat (top-right)
// ---------------------------------------------------------------------------
const StatisticCard = () => (
  <Card className="items-start justify-center gap-3">
    <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest">
      Models Available
    </p>
    <p
      className="font-black leading-none tracking-tighter text-gray-900 dark:text-gray-100"
      style={{ fontSize: "clamp(4rem, 7vw, 6rem)" }}
    >
      15<span className="text-landing-primary dark:text-landing-primary">+</span>
    </p>
    <p className="text-sm text-gray-400 dark:text-gray-500">
      Active AI models across GPT, Claude, Gemini, DeepSeek &amp; more.
    </p>
  </Card>
);

// ---------------------------------------------------------------------------
// Card 4 - Streaming speed stat (mid-middle)
// ---------------------------------------------------------------------------
const FocusCard = () => (
  <Card className="justify-between">
    {/* Header */}
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="text-sm font-semibold text-landing-primary dark:text-landing-primary">
          Streaming Speed
        </p>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
          First Token Latency
        </p>
      </div>
      <span className="flex-shrink-0 rounded-full border border-landing-primary/25 px-2.5 py-0.5 text-[10px] font-semibold text-landing-primary dark:border-landing-primary/30 dark:text-landing-primary">
        Live
      </span>
    </div>

    {/* Big number */}
    <p
      className="font-black leading-none tracking-tighter text-gray-900 dark:text-gray-100"
      style={{ fontSize: "clamp(2.8rem, 4.5vw, 3.75rem)" }}
    >
      &lt;2<span className="text-landing-primary dark:text-landing-primary">s</span>
    </p>

    {/* Labels */}
    <div className="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-600">
      <span>Avg. first token</span>
      <span>All models</span>
    </div>
  </Card>
);

// ---------------------------------------------------------------------------
// Card 5 - Parallel Multi-Model Chat (mid-right)
// ---------------------------------------------------------------------------
const ProductivityCard = () => (
  <Card className="justify-center gap-3">
    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
      Parallel Comparison
    </p>
    <p className="text-sm leading-relaxed text-gray-400 dark:text-gray-500">
      Send one prompt to multiple models simultaneously and{" "}
      <span className="text-landing-primary dark:text-landing-primary font-medium">
        compare answers side-by-side
      </span>{" "}
      to choose the best response.
    </p>
  </Card>
);

// ---------------------------------------------------------------------------
// Card 6 - Token Wallet (bottom, spans 2 cols)
// ---------------------------------------------------------------------------
const WalletCard = () => (
  <Card className="flex-row flex-wrap items-center justify-between gap-6">
    {/* Left: text */}
    <div className="min-w-[180px]">
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        Token Wallet
      </p>
      <p className="mt-1 text-sm text-landing-primary dark:text-landing-primary">
        Your usage, always in view.
      </p>
    </div>

    {/* Right: feature highlights */}
    <div className="flex flex-wrap gap-3">
      {[
        "Unified Token Balance",
        "Usage History",
        "Rolling Context Window",
        "Transparent Tracking",
      ].map((feat) => (
        <span
          key={feat}
          className="rounded-full border border-gray-200 dark:border-landing-primary/60 bg-gray-50 dark:bg-landing-primary/40 px-3.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300"
        >
          {feat}
        </span>
      ))}
    </div>
  </Card>
);

// ---------------------------------------------------------------------------
// Grid - explicit Tailwind responsive classes (no inline style needed)
// Mobile: single column stack
// Desktop (md+): 3-col bento
// ---------------------------------------------------------------------------
export function BentoFeatures() {
  return (
    <>
      {/* ── Desktop grid (md and above) ── */}
      <div className="hidden md:grid w-full gap-5 "
        style={{
          gridTemplateColumns: "repeat(3, 1fr)",
          gridTemplateRows: "repeat(3, minmax(190px, auto))",
        }}
      >
        {/* Left tall - rows 1-3 */}
        <AnimatedCard delay={0.05} style={{ gridRow: "1 / 4", gridColumn: "1" }}>
          <IntegrationCard />
        </AnimatedCard>
        {/* Row 1 right two */}
        <AnimatedCard delay={0.15} style={{ gridRow: "1", gridColumn: "2" }}>
          <TrackersCard />
        </AnimatedCard>
        <AnimatedCard delay={0.25} style={{ gridRow: "1", gridColumn: "3" }}>
          <StatisticCard />
        </AnimatedCard>
        {/* Row 2 right two */}
        <AnimatedCard delay={0.35} style={{ gridRow: "2", gridColumn: "2" }}>
          <FocusCard />
        </AnimatedCard>
        <AnimatedCard delay={0.45} style={{ gridRow: "2", gridColumn: "3" }}>
          <ProductivityCard />
        </AnimatedCard>
        {/* Row 3 wide */}
        <AnimatedCard delay={0.55} style={{ gridRow: "3", gridColumn: "2 / 4" }}>
          <WalletCard />
        </AnimatedCard>
      </div>

      {/* ── Mobile stack (below md) ── */}
      <div className="flex md:hidden flex-col gap-4">
        <AnimatedCard delay={0.0}><IntegrationCard /></AnimatedCard>
        <AnimatedCard delay={0.08}><TrackersCard /></AnimatedCard>
        <AnimatedCard delay={0.16}><StatisticCard /></AnimatedCard>
        <AnimatedCard delay={0.24}><FocusCard /></AnimatedCard>
        <AnimatedCard delay={0.32}><ProductivityCard /></AnimatedCard>
        <AnimatedCard delay={0.40}><WalletCard /></AnimatedCard>
      </div>
    </>
  );
}
