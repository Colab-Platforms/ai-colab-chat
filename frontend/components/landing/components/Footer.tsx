"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";


const LinkedinIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const socialLinks = [
  {
    icon: <X className="h-4 w-4" />,
    href: "https://twitter.com",
    label: "X (Twitter)",
  },
  {
    icon: <LinkedinIcon className="h-4 w-4" />,
    href: "https://linkedin.com",
    label: "LinkedIn",
  },
];

const mainLinks = [
  { href: "#features", label: "Features" },
  { href: "#models", label: "Models" },
  { href: "#pricing", label: "Pricing" },
  { href: "#testimonials", label: "Testimonials" },
  { href: "#faq", label: "FAQs" },
];

const legalLinks = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookie-policy", label: "Cookie Policy" },
  { href: "/support", label: "Support & Help" },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="pb-6 pt-16 lg:pb-8 lg:pt-24 bg-[#e7e4eb] dark:bg-[#060104] ">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        viewport={{ once: true }}
        className="container mx-auto px-5"
      >

        {/* Top row - logo + socials */}
        <div className="md:flex md:items-start md:justify-between">
          <Link href="/" className="flex items-center gap-x-2" aria-label="ColabPlatforms.ai">
            <Image
              src="/black.webp"
              alt="Logo"
              width={110}
              height={110}
              className="h-auto dark:hidden"
            />
            <Image
              src="/white.webp"
              alt="Logo"
              width={110}
              height={110}
              className="h-auto hidden dark:block"
            />
          </Link>

          <ul className="flex list-none mt-6 md:mt-0 space-x-3">
            {socialLinks.map((link, i) => (
              <li key={i}>
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-10 w-10 rounded-full bg-gray-100 hover:bg-pink-50 dark:bg-white/5 dark:hover:bg-pink-950/60 border-0 text-gray-500 dark:text-gray-400 hover:text-landing-primary dark:hover:text-pink-400 transition-colors duration-200"
                  asChild
                >
                  <a href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label}>
                    {link.icon}
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom grid - copyright + nav + legal */}
        <div className=" mt-6 pt-6 md:mt-4 md:pt-8 lg:grid lg:grid-cols-10">

          {/* Copyright - left col on lg */}
          <div className="mt-6 text-sm leading-6 text-gray-400 dark:text-gray-500 whitespace-nowrap lg:mt-0 lg:row-[1/3] lg:col-[1/4]">
            <div>© {year} ColabPlatforms.ai</div>
            <div className="mt-0.5">All rights reserved.</div>
          </div>

          {/* Main nav links - right-aligned on lg */}
          <nav className="lg:mt-0 lg:col-[4/11]">
            <ul className="list-none flex flex-wrap -my-1 -mx-2 lg:justify-end">
              {mainLinks.map((link, i) => (
                <li key={i} className="my-1 mx-2 shrink-0">
                  <Link
                    href={link.href}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-landing-primary dark:hover:text-pink-400 underline-offset-4 hover:underline transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Legal links - right-aligned on lg */}
          <div className="mt-6 lg:mt-0 lg:col-[4/11]">
            <ul className="list-none flex flex-wrap -my-1 -mx-3 lg:justify-end">
              {legalLinks.map((link, i) => (
                <li key={i} className="my-1 mx-3 shrink-0">
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 dark:text-gray-600 underline-offset-4 hover:underline hover:text-gray-600 dark:hover:text-gray-400 transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </motion.div>
    </footer>
  );
}
