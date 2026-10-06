"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";

const LAST_UPDATED = "July 23, 2026";

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Overview",
    body: (
      <p>
        This Privacy Policy explains how AI Colab (&quot;we&quot;, &quot;us&quot;) collects,
        uses, and protects your information when you use the Service. By using the
        Service, you agree to the practices described in this Policy.
      </p>
    ),
  },
  {
    title: "2. Information We Collect",
    body: (
      <ul className="list-disc pl-5 space-y-2">
        <li><strong className="text-foreground">Account information</strong> - name, email address, and password (stored hashed) when you register.</li>
        <li><strong className="text-foreground">Usage data</strong> - prompts, chats, uploaded files, model selections, and token usage needed to operate the Service.</li>
        <li><strong className="text-foreground">Billing data</strong> - subscription plan, payment status, and transaction history processed through our payment provider.</li>
        <li><strong className="text-foreground">Technical data</strong> - IP address, browser/device information, and log data for security and reliability.</li>
      </ul>
    ),
  },
  {
    title: "3. How We Use Your Information",
    body: (
      <ul className="list-disc pl-5 space-y-2">
        <li>To provide, maintain, and improve the Service, including routing your prompts to the AI model providers you select.</li>
        <li>To manage your account, subscription, and token balance.</li>
        <li>To communicate with you about your account, updates, or support requests.</li>
        <li>To detect, prevent, and address fraud, abuse, and security issues.</li>
      </ul>
    ),
  },
  {
    title: "4. Sharing Your Information",
    body: (
      <p>
        We share your prompts and content with the third-party AI model providers you
        choose to use, solely to generate responses. We may also share information with
        service providers who help us operate the Service (e.g. hosting, email
        delivery, payment processing), under obligations to protect your data. We do
        not sell your personal information.
      </p>
    ),
  },
  {
    title: "5. Data Retention",
    body: (
      <p>
        We retain your account and chat data for as long as your account is active, or
        as needed to provide the Service. You can delete individual chats or your
        account at any time; deleted data is removed from active systems and purged
        from backups on a rolling basis.
      </p>
    ),
  },
  {
    title: "6. Data Security",
    body: (
      <p>
        We use industry-standard measures - including encryption in transit, access
        controls, and hashed credential storage - to protect your information. No
        method of transmission or storage is 100% secure, and we cannot guarantee
        absolute security.
      </p>
    ),
  },
  {
    title: "7. Your Rights & Choices",
    body: (
      <ul className="list-disc pl-5 space-y-2">
        <li>You can access, update, or delete your account information from your profile settings.</li>
        <li>You can request a copy or deletion of your personal data by contacting us.</li>
        <li>You can opt out of non-essential communications at any time.</li>
      </ul>
    ),
  },
  {
    title: "8. Children's Privacy",
    body: (
      <p>
        The Service is not directed to children under 16, and we do not knowingly
        collect personal information from children.
      </p>
    ),
  },
  {
    title: "9. Changes to This Policy",
    body: (
      <p>
        We may update this Privacy Policy from time to time. Material changes will be
        reflected by updating the &quot;Last updated&quot; date below. Continued use of
        the Service after a revision takes effect constitutes acceptance of the updated
        Policy.
      </p>
    ),
  },
  {
    title: "10. Contact",
    body: (
      <p>
        Questions about this Privacy Policy or your data can be sent to{" "}
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

export default function PrivacyPolicyPage() {
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
        <h1 className="text-3xl sm:text-4xl font-bold text-balance">Privacy Policy</h1>
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
