"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ─────────────────────────────────────────────────────
//  Types & Data Structures
// ─────────────────────────────────────────────────────
interface FAQItem {
  question: string;
  answer: string;
}

const TABS = ["General", "AI Capabilities", "Integration & Security"];

const FAQ_DATA: Record<string, FAQItem[]> = {
  General: [
    {
      question: "How does Colabplatforms.ai work?",
      answer:
        "Colabplatforms.ai is a unified workspace that connects you to 15+ leading AI models. Instead of managing separate subscriptions and API keys, you get a single interface, unified context sharing, and a shared token limit to use the best model for any specific task.",
    },
    {
      question: "Is there a free trial available?",
      answer:
        "Yes, new users can start with the Free plan which includes 50,000 monthly tokens for the first month. No credit card is required to sign up and start testing the platform.",
    },
    {
      question: "Who is Colabplatforms.ai built for?",
      answer:
        "Colabplatforms.ai is built for developers, designers, product managers, and teams who want to leverage multiple AI models in their daily workflows. It is perfect for anyone looking to compare models side-by-side or automate multi-model tasks.",
    },
    {
      question: "Can I use multiple AI models at the same time?",
      answer:
        "Yes! You can compare answers side-by-side or route prompts to different models within the same workspace to find the best output.",
    },
    {
      question: "What happens after my first month free trial?",
      answer:
        "After your first month on the Free plan, you can choose to upgrade to a Pro or Pro Plus plan. If you choose not to upgrade, your token balance will reset and you will need to choose a plan to continue.",
    },
    {
      question: "Does Colabplatforms.ai work for solo users?",
      answer:
        "Yes! Colabplatforms.ai works perfectly for solo developers, creators, and freelancers. It is designed to scale from a single individual to large engineering teams.",
    },
  ],
  "AI Capabilities": [
    {
      question: "Which AI models are supported?",
      answer:
        "We support GPT-4o, GPT-4 Turbo, Claude 3.5 Sonnet, Claude 3 Opus, Gemini 1.5 Pro, Gemini 2.0 Flash, DeepSeek V3, and more. You can switch models on the fly in any conversation.",
    },
    {
      question: "What is a Rolling Context Window?",
      answer:
        "A Rolling Context Window automatically manages message history so your conversation always fits within the model's token limit. Instead of hitting a hard cutoff, older messages are gracefully trimmed while keeping the most recent and relevant context intact.",
    },
    {
      question: "How accurate are the AI model responses?",
      answer:
        "Accuracy depends on the model selected and the context provided. By providing relevant file attachments or using models specialized for code (like Claude 3.5 Sonnet or GPT-4o), you can achieve high precision and reliability.",
    },
  ],
  "Integration & Security": [
    {
      question: "Is my data used to train the AI models?",
      answer:
        "No. We value your privacy and security. None of the data, files, or conversations you submit through Colabplatforms.ai are used to train the underlying models.",
    },
    {
      question: "Can I connect external developer tools?",
      answer:
        "Yes! You can upload files directly, and we support deep integrations with your local development workspaces. More integrations with popular developer platforms are added regularly.",
    },
    {
      question: "How is my code and intellectual property secured?",
      answer:
        "All communications are encrypted using SSL/TLS, and data at rest is encrypted using industry-standard protocols. Access is strictly controlled through secure user authentication.",
    },
    {
      question: "Can I export my chat history and documents?",
      answer:
        "Yes, you can export your conversations and shared code snippets at any time directly from the dashboard settings.",
    },
  ],
};

// ─────────────────────────────────────────────────────
//  Helper Components
// ─────────────────────────────────────────────────────
function PlusIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-neutral-400 transition-transform duration-300 ${
        isOpen ? "rotate-45 text-white" : ""
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

interface FAQCardProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function FAQCard({ question, answer, isOpen, onToggle }: FAQCardProps) {
  return (
    <div
      onClick={onToggle}
      className={`group rounded-2xl border transition-all duration-300 cursor-pointer overflow-hidden p-6 sm:p-7 ${
        isOpen
          ? "border-neutral-700 bg-neutral-900/40"
          : "border-neutral-900 bg-neutral-950/20 hover:border-neutral-800 hover:bg-neutral-900/20"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <span
          className={`text-sm sm:text-base font-medium transition-colors duration-300 leading-snug ${
            isOpen ? "text-white" : "text-neutral-300 group-hover:text-white"
          }`}
        >
          {question}
        </span>
        <PlusIcon isOpen={isOpen} />
      </div>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
          >
            <div className="pt-4 text-sm sm:text-base text-neutral-400 leading-relaxed font-normal">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────
//  Main Component
// ─────────────────────────────────────────────────────
export default function FAQ() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setOpenIndex(null); // Reset accordion state when changing tabs
  };

  const activeFAQs = FAQ_DATA[activeTab] || [];

  return (
    <section
      id="faq"
      className="bg-[#09090b] text-white py-16 md:py-24 border-t border-[#111115] relative overflow-hidden"
    >
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/5 rounded-full blur-[130px] pointer-events-none" />

      <div className="container max-w-4xl mx-auto px-5 relative z-10 flex flex-col items-center">
        {/* Badge */}
        <div className="px-6 py-2 rounded-full bg-[#292929] flex items-center justify-center gap-3 w-fit border-2 border-[#3f3f3f] mb-4">
          <div className="w-3 h-3 bg-[#3c3b3b] rounded-full" />
          <p className="text-foreground text-sm font-medium">FAQ</p>
        </div>

        {/* Title */}
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-white leading-tight text-center mb-16 text-balance">
          Answers to the questions
          that come up most.
        </h2>

        {/* Dynamic Tabs Switched Bar */}
        <div className="flex items-center justify-center gap-4 sm:gap-10 mb-12 flex-wrap">
          {TABS.map((tab) => {
            const isActive = tab === activeTab;
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`relative py-2.5 text-sm sm:text-base font-medium transition-colors duration-300 outline-none select-none w-full lg:w-auto ${isActive ? "border-2 border-white/20 rounded-full px-6" : ""}`}
              >
                <span
                  className={`relative z-10 transition-colors duration-300 ${
                    isActive ? "text-white " : "text-neutral-400 hover:text-neutral-200"
                  }`}
                >
                  {tab}
                </span>

                {/* Sliding marker line underneath active tab */}
                {isActive && (
                  <motion.div
                    layoutId="activeFaqTabUnderline"
                    className="absolute bottom-0 left-0 right-0 bg-white rounded-full hidden md:block"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Accordion List Container */}
        <div className="w-full flex flex-col gap-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-4 w-full"
            >
              {activeFAQs.map((faq, idx) => (
                <FAQCard
                  key={faq.question}
                  question={faq.question}
                  answer={faq.answer}
                  isOpen={openIndex === idx}
                  onToggle={() => handleToggle(idx)}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
