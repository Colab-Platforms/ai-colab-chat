"use client";

import { useRef, useEffect, useState } from "react";
import Image from "next/image";
import { motion, useScroll, useTransform, MotionValue, useInView } from "framer-motion";

// ─── Data ────────────────────────────────────────────────────────────────────

interface CardItem {
  badge: string;
  title: string;
  description: string;
  bottomText: string;
  imageUrl: string;
  imageOnLeft: boolean;
  bottomGradient: string;
  bottomGlow: string;
  glowColor: string;
}

const cardItems: CardItem[] = [
  {
    badge: "Shared context",
    title: "15+ AI Models. Always Growing.",
    description:
      "Connect the information your team relies on, so every answer starts with the right context.",
    bottomText: "One source of truth for every reply.",
    imageUrl: "/new-landing/what/1.png",
    imageOnLeft: false,
    bottomGradient: "from-transparent via-purple-500/70 to-transparent",
    bottomGlow: "rgba(139,92,246,0.18)",
    glowColor: "139,92,246",
  },
  {
    badge: "Instant action",
    title: "Instant Answers. <2 Second Response.",
    description:
      "Move work forward directly from the chat, without jumping between tools or losing momentum.",
    bottomText: "From question to action in one flow.",
    imageUrl: "/new-landing/what/2.png",
    imageOnLeft: true,
    bottomGradient: "from-transparent via-purple-500/70 to-transparent",
    bottomGlow: "rgba(139,92,246,0.18)",
    glowColor: "139,92,246",
  },
  {
    badge: "Continuous insight",
    title: "See Every Token. Control Every Rupee.",
    description:
      "See what people ask, where friction appears, and what needs attention across the workspace.",
    bottomText: "Clear signals from real conversations.",
    imageUrl: "/new-landing/what/3.png",
    imageOnLeft: false,
    bottomGradient: "from-transparent via-purple-600/70 to-transparent",
    bottomGlow: "rgba(139,92,246,0.18)",
    glowColor: "139,92,246",
  },
];

// Height of your fixed navbar - cards start below this
const NAVBAR_HEIGHT = 120;
// Bottom breathing room inside the sticky viewport
const CARD_BOTTOM_GAP = 48; // px

// ─── Icons ───────────────────────────────────────────────────────────────────

const CrosshairIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
    <circle cx="8" cy="8" r="2" fill="#71717a" />
    <path d="M8 1v3M8 12v3M1 8h3M12 8h3" stroke="#71717a" strokeWidth="1.2" strokeLinecap="round" />
    <path
      d="M4.2 4.2L5.9 5.9M10.1 10.1L11.8 11.8M11.8 4.2L10.1 5.9M5.9 10.1L4.2 11.8"
      stroke="#71717a"
      strokeWidth="1.2"
      strokeLinecap="round"
    />
  </svg>
);

// ─── Card UI pieces ───────────────────────────────────────────────────────────

function TextContent({ card, className }: { card: CardItem; className?: string }) {
  return (
    <div className={`flex flex-col justify-between h-auto sm:h-full p-8 sm:p-10 lg:p-14 flex-1 ${className || ""}`}>
      <div className="flex flex-col gap-5 lg:gap-7">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-neutral-500" />
          <span className="text-[13px] text-neutral-400 tracking-wide">{card.badge}</span>
        </div>
        <h3 className="text-[25px] sm:text-[32px] lg:text-[38px] xl:text-[42px] font-bold text-white leading-[1.15] tracking-tight whitespace-pre-line">
          {card.title}
        </h3>
        <p className="text-[14px] sm:text-[15px] text-neutral-400 leading-[1.65] whitespace-pre-line">
          {card.description}
        </p>
      </div>
      <div className="flex items-center gap-2.5 pt-6 mt-8">
        <CrosshairIcon />
        <span className="text-[13px] text-neutral-400">{card.bottomText}</span>
      </div>
    </div>
  );
}

function ImageContent({ card, index, className }: { card: CardItem; index: number; className?: string }) {
  const imgRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(imgRef, { once: false, amount: 0.3 });

  return (
    <div
      className={`relative flex items-center justify-center bg-black overflow-hidden flex-[1.1] z-20 m-5 rounded-xl ${className || ""}`}
      style={{ minHeight: 0 }}
    >
      <motion.div
        ref={imgRef}
        className="relative w-3/4 h-3/4"
        initial={{ scale: 1.15 }}
        animate={{ scale: isInView ? 1 : 1.15 }}
        transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <Image
          src={card.imageUrl}
          alt={card.badge}
          fill
          className="object-contain"
          priority={index === 0}
        />
        <div className="bg-linear-to-t from-black to-transparent absolute bottom-0 left-0 w-full h-10"></div>
      </motion.div>
    </div>
  );
}


function StackedCard({
  card,
  index,
  total,
  progress,
}: {
  card: CardItem;
  index: number;
  total: number;
  progress: MotionValue<number>;
}) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const segSize = 1 / total;

  // ── Entry: slide up from below ──────────────────────────────────────────
  // Card[0] starts visible. Card[i>0] translates from 100% → 0% during its segment.
  const entryStart = index * segSize;
  const entryEnd   = (index + 1) * segSize;

  const y = useTransform(
    progress,
    // tiny non-zero range for card 0 avoids degenerate transform
    isFirst ? [0, 0.001] : [entryStart, entryEnd],
    isFirst ? ["0%", "0%"] : ["105%", "0%"],
  );

  // ── Dim: scale + darken while next card slides in ───────────────────────
  // Card[i] dims during the same range that card[i+1] enters.
  const dimStart = (index + 1) * segSize;
  const dimEnd   = Math.min((index + 2) * segSize, 1);

  // Cards deeper in the stack are slightly smaller
  const buriedScale = Math.max(1 - (total - index - 1) * 0.04, 0.88);

  const scale = useTransform(
    progress,
    [dimStart, dimEnd],
    [1, isLast ? 1 : buriedScale],
  );

  const brightness = useTransform(
    progress,
    [dimStart, dimEnd],
    ["brightness(1)", isLast ? "brightness(1)" : "brightness(0.25)"],
  );

  return (
    <motion.div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: index + 1,
        y,
        scale: isLast ? undefined : scale,
        filter: isLast ? undefined : brightness,
        // Scale from top-centre so cards appear to recede into the back
        transformOrigin: "50% 0%",
        willChange: "transform, filter",
      }}
    >
      {/*
        Single seamless border using the p-px gradient-background trick.
        The 1px padding reveals the gradient background as a border.
        Gradient: white/07 at top → purple at bottom = one border, two colours, perfect corners.
      */}
      <div
        className="absolute inset-0 rounded-[20px] p-px"
        style={{
          background: `linear-gradient(
            to bottom,
            rgba(255,255,255,0.07) 0%,
            rgba(255,255,255,0.07) 50%,
            rgba(${card.glowColor},0.75) 100%
          )`,
        }}
      >
        <div className="w-full h-full rounded-[19px] bg-[#0d0d0f] overflow-hidden flex flex-row group">
          {card.imageOnLeft ? (
            <>
              <ImageContent card={card} index={index} />
              <TextContent card={card} />
            </>
          ) : (
            <>
              <TextContent card={card} />
              <ImageContent card={card} index={index} />
            </>
          )}
        </div>
      </div>

      {/* Bottom bloom glow */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          zIndex: 15,
          height: "50%",
          background: `radial-gradient(ellipse 70% 100% at 50% 100%, rgba(${card.glowColor},0.18) 0%, rgba(${card.glowColor},0.06) 55%, transparent 100%)`,
        }}
      />
    </motion.div>
  );
}

// ─── Mobile: plain flowing cards ──────────────────────────────────────────────

function MobileCard({ card, index }: { card: CardItem; index: number }) {
  return (
    <div className="relative w-full h-auto sm:aspect-video mb-6 flex flex-col">
      {/* Single seamless border */}
      <div
        className="relative sm:absolute inset-0 rounded-[20px] p-px flex flex-col"
        style={{
          background: `linear-gradient(
            to bottom,
            rgba(255,255,255,0.07) 0%,
            rgba(255,255,255,0.07) 50%,
            rgba(${card.glowColor},0.75) 100%
          )`,
        }}
      >
        <div className="w-full h-auto sm:h-full rounded-[19px] bg-[#0d0d0f] overflow-hidden flex flex-col sm:flex-row group">
          <ImageContent
            card={card}
            index={index}
            className={`order-1 aspect-square sm:aspect-auto ${card.imageOnLeft ? "sm:order-1" : "sm:order-2"}`}
          />
          <TextContent
            card={card}
            className={`order-2 ${card.imageOnLeft ? "sm:order-2" : "sm:order-1"}`}
          />
        </div>
      </div>

      {/* Bottom bloom glow */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          zIndex: 15,
          height: "50%",
          background: `radial-gradient(ellipse 70% 100% at 50% 100%, rgba(${card.glowColor},0.18) 0%, rgba(${card.glowColor},0.06) 55%, transparent 100%)`,
        }}
      />
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────

export default function WhatYouGet() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // scrollYProgress goes 0 → 1 as we scroll from the top of trackRef to its bottom.
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start start", "end end"],
  });

  const total = cardItems.length;

  return (
    <section className="bg-[#09090b] text-white py-16 md:py-24" >

      {/* ── Header - normal scroll, disappears before the stack begins ── */}
      <div className="container max-w-7xl mx-auto px-5 sm:px-10 w-full">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 w-full pb-16">
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="px-6 py-2 rounded-full bg-[#292929] flex items-center justify-center gap-3 w-fit border-2 border-[#3f3f3f] mb-2">
              <div className="w-3 h-3 bg-[#3c3b3b] rounded-full" />
              <p className="text-foreground">What you get</p>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight">
              Ask Once. Get Answers
              <br />
              From Every AI Model.
            </h2>
          </div>
          <div className="text-lg text-neutral-400 leading-relaxed max-w-lg">
            <p>
              Colab AI helps to find the right{" "}
              <br className="hidden sm:inline" />
              context, take the next step, and{" "}
              <br className="hidden sm:inline" />
              improve how work gets done.
            </p>
          </div>
        </div>
      </div>

      {/**
       * trackRef is ALWAYS mounted so useScroll never sees an unhydrated ref.
       * On mobile it collapses to height:auto and the sticky layout is skipped.
       * On desktop it becomes the tall scroll track.
       */}
      <div
        ref={trackRef}
        style={{ height: isDesktop ? `${total * 100}vh` : "auto" }}
        className="relative"
      >
        {isDesktop ? (
          /* ── Desktop: ONE sticky viewport, ALL cards inside it ── */
          <div
            className="sticky w-full overflow-hidden"
            style={{
              top: NAVBAR_HEIGHT,
              height: `calc(100vh - ${NAVBAR_HEIGHT}px)`,
            }}
          >
            {/* Card stage - cards are position:absolute inside this box */}
            <div
              className="relative container max-w-7xl mx-auto px-5 sm:px-10 w-full"
              style={{ height: `calc(100vh - ${NAVBAR_HEIGHT}px - ${CARD_BOTTOM_GAP}px)` }}
            >
              {cardItems.map((card, idx) => (
                <StackedCard
                  key={card.badge}
                  card={card}
                  index={idx}
                  total={total}
                  progress={scrollYProgress}
                />
              ))}
            </div>
          </div>
        ) : (
          /* ── Mobile: plain flowing cards ── */
          <div className="container max-w-7xl mx-auto px-5 sm:px-10 md:pb-24">
            {cardItems.map((card, idx) => (
              <MobileCard key={card.badge} card={card} index={idx} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
