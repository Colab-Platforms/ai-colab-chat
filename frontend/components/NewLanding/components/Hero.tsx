"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";
import { EASE } from "@/components/landing/components/motionVariants";
import HeroGrid from "./HeroGrid";
import HeroMock from "./HeroMock";
import { useTheme } from "@/context/theme-context";

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
            Multiple Models. <br />
            <span className="text-black dark:text-white">One Powerful Interface.</span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            className="text-xl max-md:text-lg text-gray-600 dark:text-gray-400 max-w-3xl text-center text-balance"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.25 }}
          >
            Experience the future of AI conversation with our multichat interface.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.65, ease: EASE, delay: 0.4 }}
          >
            <Link
              href="/register"
              className="px-8 py-4 mt-2 bg-black dark:bg-white rounded-full text-white dark:text-black font-medium flex items-center gap-2 transition-all duration-300"
            >
              Get Started
              <ArrowUpRight className="w-4 h-4 text-white dark:text-black" />
            </Link>
          </motion.div>
        </div>

        <HeroGrid />

        <HeroMock dark={theme === "dark"} />
      </div>


    </section>
  );
}

