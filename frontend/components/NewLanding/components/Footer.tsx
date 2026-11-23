"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

// ─────────────────────────────────────────────────────
//  Types & Interfaces
// ─────────────────────────────────────────────────────
interface FooterSection {
  title: string;
  links: { label: string; href: string }[];
}

// ─────────────────────────────────────────────────────
//  Footer Link Data
// ─────────────────────────────────────────────────────
const FOOTER_SECTIONS: FooterSection[] = [
  {
    title: "Product",
    links: [
      { label: "Home", href: "/" },
      { label: "About", href: "#about" },
      { label: "Pricing", href: "#pricing" },
      { label: "Get started", href: "/login" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Careers", href: "#" },
      { label: "Blog", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms of use", href: "/terms" },
      { label: "Privacy policy", href: "/privacy-policy" },
      { label: "Cookie policy", href: "/cookie-policy" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help & Support", href: "/support" },
      { label: "Raise a ticket", href: "/support" },
      { label: "Contact us", href: "/support" },
    ],
  },
];

// ─────────────────────────────────────────────────────
//  Social Icons (Custom SVGs for Premium Glyphs)
// ─────────────────────────────────────────────────────

const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 transition-transform duration-300 group-hover:scale-110">
    <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
  </svg>
);

const LinkedinIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 transition-transform duration-300 group-hover:scale-110">
    <path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z" />
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 transition-transform duration-300 group-hover:scale-110">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const InstagramIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 transition-transform duration-300 group-hover:scale-110">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const SOCIAL_LINKS = [
  { icon: <FacebookIcon />, href: "https://facebook.com", label: "Facebook" },
  { icon: <LinkedinIcon />, href: "https://linkedin.com", label: "LinkedIn" },
  { icon: <XIcon />, href: "https://x.com", label: "X" },
  { icon: <InstagramIcon />, href: "https://instagram.com", label: "Instagram" },
];

export default function Footer() {
  // Mobile accordion state tracking
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    Product: false,
    Company: false,
    Legal: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <footer className="relative bg-[#09090b] text-white pt-20 md:pt-28 pb-32 sm:pb-40 md:pb-48 border-t border-[#111115] overflow-hidden">
      
      <div className="container max-w-7xl mx-auto px-6 relative z-10">
        
        {/* Top Section: Logo & Links Columns */}
        <div className="flex flex-col md:flex-row md:justify-between items-start gap-12 md:gap-8 pb-16">
          
          {/* Logo */}
          <div className="flex flex-col gap-4 max-w-xs">
            <Link href="/" className="inline-block transition-opacity duration-300 hover:opacity-85">
              <Image
                src="/white.webp"
                alt="Colab Logo"
                width={110}
                height={110}
                className="w-[84px] sm:w-[92px] h-auto"
                priority
              />
            </Link>
            <p className="text-neutral-400 text-sm font-normal">
              Colab Platforms is an advanced AI chatbot platform enabling simultaneous chat with multiple LLM models. 
            </p>
          </div>

          {/* Desktop Navigation (visible only on md and up) */}
          <div className="hidden md:flex gap-16 lg:gap-24">
            {FOOTER_SECTIONS.map((section) => (
              <div key={section.title} className="flex flex-col min-w-[120px]">
                <h4 className="text-neutral-400 font-normal text-xs tracking-wider uppercase mb-5 select-none">
                  {section.title}
                </h4>
                <ul className="flex flex-col gap-3.5">
                  {section.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-neutral-300 hover:text-white transition-colors duration-300 text-sm font-normal"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Mobile Accordions Navigation (visible only on mobile) */}
          <div className="md:hidden w-full flex flex-col divide-y divide-neutral-900 border-t border-b border-neutral-900/60 mt-4">
            {FOOTER_SECTIONS.map((section) => {
              const isOpen = openSections[section.title];
              return (
                <div key={section.title} className="py-2.5">
                  <button
                    onClick={() => toggleSection(section.title)}
                    className="flex items-center justify-between w-full text-left font-normal text-neutral-300 text-sm py-2 select-none"
                  >
                    <span>{section.title}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-neutral-500 transition-transform duration-300 ${
                        isOpen ? "rotate-180 text-white" : ""
                      }`}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                        className="overflow-hidden"
                      >
                        <ul className="flex flex-col gap-3 pt-2 pb-3 pl-1">
                          {section.links.map((link) => (
                            <li key={link.label}>
                              <Link
                                href={link.href}
                                className="text-neutral-400 hover:text-white transition-colors duration-300 text-sm"
                              >
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

        </div>

        {/* Bottom Section: Copyright & Socials */}
        <div className="flex flex-col-reverse md:flex-row items-center justify-between gap-6 pt-8">
          
          {/* Copyright */}
          <p className="text-neutral-500 text-[11px] sm:text-xs select-none">
            © Colabplatforms.ai, Inc., 2026. All rights reserved
          </p>

          {/* Socials */}
          <div className="flex items-center gap-6">
            {SOCIAL_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                className="group text-neutral-500 hover:text-neutral-200 transition-colors duration-300"
              >
                {link.icon}
              </a>
            ))}
          </div>

        </div>

      </div>

      {/* Decorative hills background (spans full width at absolute bottom) */}
      <div className="absolute bottom-0 left-0 right-0 w-full  sm:h-[160px] md:h-[160px] pointer-events-none z-0 select-none">
        <Image
          src="/new-landing/footer-bg.webp"
          alt="Hills Footer Background"
          width={2000}
          height={350}
          className="object-cover object-top select-none pointer-events-none"
        />
      </div>

    </footer>
  );
}
