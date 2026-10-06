"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "July 23, 2026";

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. What Are Cookies",
    body: (
      <p>
        Cookies are small text files stored on your device when you visit a website.
        They help the site remember your preferences, keep you signed in, and
        understand how the site is used.
      </p>
    ),
  },
  {
    title: "2. Cookies We Use",
    body: (
      <ul className="list-disc pl-5 space-y-2">
        <li><strong className="text-foreground">Essential cookies</strong> - required for authentication, session management, and core functionality of the Service. These cannot be disabled without breaking the Service.</li>
        <li><strong className="text-foreground">Preference cookies</strong> - remember settings such as theme (light/dark) and sidebar state.</li>
        <li><strong className="text-foreground">Analytics cookies</strong> - help us understand how the Service is used so we can improve it.</li>
      </ul>
    ),
  },
  {
    title: "3. Third-Party Cookies",
    body: (
      <p>
        Some cookies may be set by third-party services we use for authentication
        (e.g. Google Sign-In) or payment processing. These providers have their own
        privacy and cookie practices, which we encourage you to review.
      </p>
    ),
  },
  {
    title: "4. Managing Cookies",
    body: (
      <p>
        Most browsers let you control cookies through their settings, including
        blocking or deleting them. Disabling essential cookies may prevent you from
        signing in or using core features of the Service.
      </p>
    ),
  },
  {
    title: "5. Changes to This Policy",
    body: (
      <p>
        We may update this Cookie Policy from time to time. Material changes will be
        reflected by updating the &quot;Last updated&quot; date below.
      </p>
    ),
  },
  {
    title: "6. Contact",
    body: (
      <p>
        Questions about this Cookie Policy can be sent to{" "}
        <a
          href="mailto:support@colabplatforms.com"
          className="text-primary underline underline-offset-4"
        >
          support@colabplatforms.com
        </a>
        , or via our{" "}
        <Link href="/support" className="text-primary underline underline-offset-4">
          Support page
        </Link>
        .
      </p>
    ),
  },
];

export default function CookiePolicyPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-5 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/black.webp" alt="AI Colab" width={70} height={28} className="dark:hidden h-6 w-auto" priority />
            <Image src="/white.webp" alt="AI Colab" width={70} height={28} className="hidden dark:block h-6 w-auto" priority />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-balance">Cookie Policy</h1>
        <p className="text-muted-foreground text-sm mt-2">Last updated: {LAST_UPDATED}</p>

        <div className="mt-10 space-y-9 text-[15px] leading-relaxed text-foreground/90">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-foreground mb-2">{section.title}</h2>
              {section.body}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
