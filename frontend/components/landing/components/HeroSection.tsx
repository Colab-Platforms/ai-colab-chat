"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion } from "framer-motion";

import { ScrollTiltHero } from "./ScrollTiltHero";
import { EASE } from "./motionVariants";

export function HeroSection() {
  return (
    <section className="flex text-foreground transition-all duration-300">
      <div className="container mx-auto flex flex-1 flex-col max-sm:px-5">
        <div className="flex flex-col items-center justify-center gap-5 pt-48">
          {/* Headline */}
          <motion.h1
            className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-center text-landing-primary leading-tight text-balance"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
          >
            Stop hopping between AI apps. <br />
            <span className="text-black dark:text-white">One place. Every model. No friction.</span>
          </motion.h1>

          {/* Subtext */}
          <motion.p
            className="text-xl max-md:text-lg text-gray-600 max-w-3xl text-center text-balance dark:text-gray-200"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.25 }}
          >
            Write, code, brainstorm, and generate content in one workspace. Access multiple AI models, compare
            responses side-by-side, and move faster.
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.65, ease: EASE, delay: 0.4 }}
          >
            <Link
              href="/register"
              className="px-8 py-4 mt-2 bg-landing-primary hover:bg-landing-primary-hover rounded-full text-white font-semibold flex items-center gap-2 transition-all duration-300"
            >
              Get Started
              <ArrowUpRight className="w-4 h-4 text-white" />
            </Link>
          </motion.div>
        </div>

        {/* Hero image - scroll-driven tilt */}
        <ScrollTiltHero />
      </div>
    </section>
  );
}

