"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { EASE } from "@/components/landing/components/motionVariants";

export function Navbar({ scrolled }: { scrolled?: boolean } = {}) {
  const [windowScrolled, setIsScrolled] = useState(false);
  // Pages whose content scrolls inside a frame (e.g. /business) report their
  // own scroll state so the navbar floats the same way as on the landing page.
  const isScrolled = scrolled ?? windowScrolled;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const { scrollY } = useScroll();
  const navLinks = [
    { href: "#about", label: "About" },
    { href: "/business", label: "Business" },
    { href: "#pricing", label: "Pricing" },
    { href: "#faq", label: "FAQs" },
    { href: "#testimonials", label: "Testimonials" },
  ].map((link) => ({
    ...link,
    // Section links live on the landing page; from /business, go back there.
    href: link.href.startsWith("#") && pathname !== "/" ? `/${link.href}` : link.href,
  }));
  // A plain <a> on purpose: from /business it changes only the hash, which the
  // embedded business page listens for to scroll to its lead form.
  const demoHref = "/business#demo";

  useMotionValueEvent(scrollY, "change", (latest) => {
    if (latest > 50) {
      setIsScrolled(true);
    } else {
      setIsScrolled(false);
    }
  });

  return (
    <motion.nav
      className={`fixed top-0 left-0 right-0 z-9999 transition-[padding] duration-300 ease-in-out ${
        isScrolled ? "pt-5 pb-2" : "py-5"
      }`}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE }}
    >
      <div className={`bg-linear-to-b from-white dark:from-black to-transparent w-full h-24 fixed top-0 left-0 right-0 -z-10 ${isScrolled ? "opacity-100" : "opacity-0"}`}></div>
      <div
        className={`mx-auto flex h-14 flex-col justify-center transition-all duration-300 ease-in-out ${
          isScrolled
            ? "container max-w-7xl px-5 sm:px-10 rounded-full border border-gray-200/50 dark:border-gray-800/50 bg-[#e7e4eb]/80 dark:bg-[#060104]/80 backdrop-blur-md shadow-sm max-md:max-w-[95%]"
            : "container max-w-7xl px-5 sm:px-10 bg-transparent"
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
                isScrolled ? "w-[70px] sm:w-[76px]" : "w-[70px] sm:w-[76px]"
              }`}
            />
            <Image
              src="/white.webp"
              alt="Logo"
              width={100}
              height={100}
              className={`h-auto hidden dark:block transition-all duration-300 ${
                isScrolled ? "w-[70px] sm:w-[76px]" : "w-[70px] sm:w-[76px]"
              }`}
            />
          </Link>
          <div className="hidden lg:flex">
            <ul className="flex items-center gap-8 text-sm font-medium text-gray-600 dark:text-gray-300">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:text-landing-primary transition-colors duration-300"
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
            <a
              href={demoHref}
              className="hidden lg:inline-flex h-9 items-center rounded-full bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
            >
              Book a demo
            </a>
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
              className="inline-flex lg:hidden p-2 rounded-full hover:bg-gray-800/80 transition-colors"
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
                      className="block rounded-2xl px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-gray-900/70 hover:text-landing-primary transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <a
                    href={demoHref}
                    className="block rounded-2xl px-4 py-2.5 text-sm font-semibold text-landing-primary hover:bg-gray-100/80 dark:hover:bg-gray-900/70 transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    Book a demo
                  </a>
                </li>
              </ul>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.nav>
  );
}
