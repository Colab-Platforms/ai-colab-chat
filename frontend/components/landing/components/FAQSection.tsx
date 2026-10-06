"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { ContactModal } from "./ContactModal";

const faqs = [
  {
    question: "What AI models are available on the platform?",
    answer:
      "We support 15+ leading models including GPT-4o, GPT-4 Turbo, Claude 3.5 Sonnet, Claude 3 Opus, Gemini 1.5 Pro, Gemini 2.0 Flash, DeepSeek V3, and more. New models are added regularly as they become available.",
  },
  {
    question: "How does the Token Wallet work?",
    answer:
      "The Token Wallet gives you a unified balance that works across all models. Tokens are allocated through your active plan, and you can use them on any supported model without separate API keys. The dashboard shows a real-time breakdown of usage per model so you always know where your tokens go.",
  },
  {
    question: "What is a Rolling Context Window?",
    answer:
      "A Rolling Context Window automatically manages message history so your conversation always fits within the model's token limit. Instead of hitting a hard cutoff, older messages are gracefully trimmed while keeping the most recent and relevant context intact.",
  },
  {
    question: "How do plans and billing work?",
    answer:
      "The platform currently uses fixed monthly plans. New users can start with the Free plan for the first month, then choose a paid plan to continue with higher limits and features.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "New users can use the Free plan for their first month. After that, you can continue on a paid plan based on your usage needs.",
  },
  {
    question: "What happens after my first month on the Free plan?",
    answer:
      "After your first month, you can move to a paid plan to keep using the platform without interruption. Plan details are shown in the pricing section.",
  },
  {
    question: "Can I install the platform as an app on my device?",
    answer:
      "Yes - you can install it from your browser as a Progressive Web App (PWA) on desktop and mobile. An active internet connection is required for chat features.",
  },
];

function FAQItem({
  question,
  answer,
  index,
  isOpen,
  onToggle,
}: {
  question: string;
  answer: string;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      viewport={{ once: true }}
      className={`rounded-2xl border transition-colors duration-300 ${
        isOpen
          ? "border-landing-primary/50 dark:border-landing-primary/70 bg-white dark:bg-landing-primary/10"
          : "border-gray-100 dark:border-landing-primary/40 bg-white/60 dark:bg-[#0f0208]/60 hover:border-landing-primary dark:hover:border-landing-primary/50"
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-7 py-5 text-left"
        aria-expanded={isOpen}
      >
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
          {question}
        </span>
        <ChevronDown
          className={`shrink-0 h-4 w-4 transition-all duration-300 ${
            isOpen
              ? "rotate-180 text-landing-primary dark:text-landing-primary"
              : "rotate-0 text-gray-400 dark:text-gray-500"
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="px-7 pb-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <section id="faq" className="py-24 bg-[#e7e4eb] dark:bg-[#060104]">
      <div className="container mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          viewport={{ once: true }}
          className="flex flex-col items-center text-center max-w-xl mx-auto mb-14"
        >
          <span className="border border-landing-primary/50 dark:border-landing-primary/60 text-landing-primary dark:landing-primary bg-landing-primary/10 dark:bg-landing-primary/40 py-1 px-4 rounded-full text-xs font-medium tracking-wide mb-5">
            FAQ
          </span>
          <h2 className="text-4xl max-md:text-3xl font-bold text-landing-primary dark:text-landing-primary tracking-tight">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-gray-600 dark:text-gray-400 text-balance">
            Everything you need to know about the platform. Can't find the answer you're looking for?{" "}
            <ContactModal>
              <button
                className="text-landing-primary dark:text-landing-primary font-medium underline-offset-2 hover:underline transition-all"
              >
                Contact our support team.
              </button>
            </ContactModal>
          </p>
        </motion.div>

        {/* Accordion */}
        <div className="max-w-3xl mx-auto flex flex-col gap-3">
          {faqs.map((faq, i) => (
            <FAQItem
              key={i}
              index={i}
              question={faq.question}
              answer={faq.answer}
              isOpen={openIndex === i}
              onToggle={() => toggle(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
