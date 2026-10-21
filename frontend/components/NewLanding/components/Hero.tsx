"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { EASE } from "@/components/landing/components/motionVariants";
import HeroGrid from "./HeroGrid";
import HeroMock from "./HeroMock";
import { useTheme } from "@/context/theme-context";

const SUBTEXT = "Experience the future of AI conversation with our multichat interface.";

// Types the subtext out once, with a blinking caret. The full text is also
// rendered invisibly so the layout doesn't shift while it types.
function TypedSubtext() {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(SUBTEXT.length);
      return;
    }
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      i += 1;
      setN(i);
      if (i < SUBTEXT.length) timer = setTimeout(tick, 28);
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, []);
  const done = n >= SUBTEXT.length;
  return (
    <>
      <span className="sr-only">{SUBTEXT}</span>
      <span aria-hidden="true" className="relative block">
        <span className="invisible">{SUBTEXT}</span>
        <span className="absolute inset-0">
          {SUBTEXT.slice(0, n)}
          {/* Zero-width so the caret can't push the last word onto a new line. */}
          <span className="relative inline-block h-[1em] w-0 align-[-0.15em]">
            <span className={`absolute left-0.5 top-0 block h-full w-px bg-current ${done ? "animate-pulse" : ""}`} />
          </span>
        </span>
      </span>
    </>
  );
}

export function Hero() {
  const { theme } = useTheme();
  return (
    <section className="flex flex-col text-foreground transition-all duration-300 pb-[clamp(64px,9vw,140px)]">
      <div className="container max-w-7xl mx-auto flex flex-1 flex-col px-5 sm:px-10 z-50">
        <div className="flex flex-col items-center justify-center gap-5 pt-48 z-50">
          {/* Headline */}
          <motion.h1
            className="text-3xl md:text-4xl lg:text-4xl xl:text-6xl font-bold text-center text-black dark:text-white leading-tight text-balance"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
          >
            Multiple Models <br />
            <span className="text-black dark:text-white">One Powerful Interface</span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            className="text-xl max-md:text-lg text-gray-600 dark:text-gray-400 max-w-3xl text-center text-balance"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.25 }}
          >
            <TypedSubtext />
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.65, ease: EASE, delay: 0.4 }}
          >
            <Link
              href="/register"
              className="px-8 py-4 mt-2 bg-[linear-gradient(145deg,#6A45D9,#4A3198)] dark:bg-[linear-gradient(145deg,#9677FF,#6953B3)] hover:brightness-110 rounded-full text-white font-medium flex items-center gap-2 transition-all duration-300"
            >
              Get Started
              <ArrowUpRight className="w-4 h-4 text-white" />
            </Link>
          </motion.div>
        </div>

        <HeroGrid />

        <HeroMock dark={theme === "dark"} />
      </div>


    </section>
  );
}

