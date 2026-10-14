"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, Moon, Sun, X } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "framer-motion";

import { Button } from "../../ui/button";
import { useTheme } from "@/context/theme-context";
import { EASE } from "./motionVariants";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { toggleTheme } = useTheme();
  const { scrollY } = useScroll();
  const navLinks = [
    { href: "#features", label: "Features" },
    // { href: "#models", label: "Models" },
    { href: "#pricing", label: "Pricing" },
    { href: "#testimonials", label: "Testimonials" },
    { href: "#faq", label: "FAQs" },
  ];

  useMotionValueEvent(scrollY, "change", (latest) => {
    // Hysteresis: the navbar changes height when it flips, which shifts the
    // scroll position slightly. A single threshold made it flip back and forth
    // (flicker) on trackpad momentum / iOS rubber-banding near the top.
    setIsScrolled((prev) => (prev ? latest > 20 : latest > 80));
  });

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-50 transform-gpu transition-[padding] duration-300 ease-in-out  ${
        isScrolled ? "pt-4 pb-2" : "py-8"
      }`}
      // Slide only: starting at opacity 0 left the navbar invisible whenever
      // the entrance animation was delayed or skipped.
      initial={{ y: -20 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      <div
        className={`mx-auto flex h-14 flex-col justify-center transition-all duration-300 ease-in-out ${
          isScrolled
            ? "container max-w-6xl px-6 rounded-full border border-gray-200/50 dark:border-gray-800/50 bg-[#e7e4eb] dark:bg-[#060104] shadow-sm max-md:max-w-[95%]"
            : "container px-5 bg-transparent"
        }`}
      >
        <div className="flex items-center justify-between h-full">
          <Link href="/">
            <Image
              src="/black.webp"
              alt="Logo"
              width={100}
              height={100}
              className={`h-auto dark:hidden transition-all duration-300 ${
                isScrolled ? "w-[70px] sm:w-[76px]" : "w-[78px] sm:w-[86px]"
              }`}
            />
            <Image
              src="/white.webp"
              alt="Logo"
              width={100}
              height={100}
              className={`h-auto hidden dark:block transition-all duration-300 ${
                isScrolled ? "w-[70px] sm:w-[76px]" : "w-[78px] sm:w-[86px]"
              }`}
            />
          </Link>
          <div className="hidden lg:flex">
            <ul className="flex items-center gap-8 text-sm font-medium text-gray-600 dark:text-gray-300">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-landing-primary dark:hover:text-landing-primary transition"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              aria-label="Toggle Theme"
            >
              <Moon className="w-5 h-5 text-gray-800 dark:hidden" />
              <Sun className="w-5 h-5 text-gray-200 hidden dark:block" />
            </button>
            <Link href="/login" className="hidden lg:block">
              <Button className="rounded-full bg-landing-primary hover:bg-landing-primary-hover text-white px-6 transition-all duration-300">
                Log in
              </Button>
            </Link>
            <Link href="/login" className="lg:hidden">
              <Button className="rounded-full bg-landing-primary hover:bg-landing-primary-hover text-white px-4 py-2 h-9 text-sm transition-all duration-300">
                Log in
              </Button>
            </Link>
            <button
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="inline-flex lg:hidden p-2 rounded-full hover:bg-gray-200/80 dark:hover:bg-gray-800/80 transition-colors"
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav-menu"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-gray-800 dark:text-gray-200" />
              ) : (
                <Menu className="w-5 h-5 text-gray-800 dark:text-gray-200" />
              )}
            </button>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {isMobileMenuOpen ? (
          <motion.div
            id="mobile-nav-menu"
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.985 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="mx-auto mt-2 w-[95%] max-w-6xl lg:hidden"
          >
            <div className="rounded-[28px] border border-gray-200/60 dark:border-gray-800/60 bg-white/85 dark:bg-black/70 backdrop-blur-md shadow-sm p-3">
              <ul className="space-y-1">
                {navLinks.map((link) => (
                  <li key={`mobile-${link.href}`}>
                    <Link
                      href={link.href}
                      className="block rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-900/70 hover:text-landing-primary dark:hover:text-pink-400 transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.nav>
  );
}

