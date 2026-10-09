"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Loader2, LifeBuoy, Mail } from "lucide-react";
import { toast } from "@/lib/toast";
import { useAuth } from "@/context/auth-context";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TICKET_CATEGORIES = [
  "Billing & Subscription",
  "Account & Login",
  "Bug Report",
  "Feature Request",
  "Other",
];

const getErrorMessage = (err: unknown, fallback: string) => {
  if (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof err.response === "object" &&
    err.response !== null &&
    "data" in err.response &&
    typeof err.response.data === "object" &&
    err.response.data !== null &&
    "message" in err.response.data &&
    typeof err.response.data.message === "string"
  ) {
    return err.response.data.message;
  }
  return fallback;
};

function TicketForm() {
  const { user } = useAuth();
  const [name, setName] = useState(
    user ? `${user.firstName} ${user.lastName}`.trim() : "",
  );
  const [email, setEmail] = useState(user?.email || "");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/support/ticket", {
        name,
        email,
        category,
        subject,
        message,
      });
      toast.success("Ticket submitted — our team will get back to you shortly.");
      setSubject("");
      setMessage("");
      setCategory("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to submit ticket. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="ticket-name" className="text-sm font-medium text-black dark:text-white">Name</label>
          <Input
            id="ticket-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="ticket-email" className="text-sm font-medium text-black dark:text-white">Email</label>
          <Input
            id="ticket-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ticket-category" className="text-sm font-medium text-black dark:text-white">Category</label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger id="ticket-category" className="w-full">
            <SelectValue placeholder="Select a category (optional)" />
          </SelectTrigger>
          <SelectContent>
            {TICKET_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ticket-subject" className="text-sm font-medium text-black dark:text-white">Subject</label>
        <Input
          id="ticket-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Briefly summarize the issue"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ticket-message" className="text-sm font-medium text-black dark:text-white">Describe the issue</label>
        <Textarea
          id="ticket-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what happened, steps to reproduce, and what you expected..."
          rows={5}
          required
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Submit Ticket
      </Button>
    </form>
  );
}

function ContactForm() {
  const { user } = useAuth();
  const [name, setName] = useState(
    user ? `${user.firstName} ${user.lastName}`.trim() : "",
  );
  const [email, setEmail] = useState(user?.email || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/support/contact", { name, email, subject, message });
      toast.success("Message sent — we'll respond to your message soon.");
      setSubject("");
      setMessage("");
    } catch (err) {
      toast.error(getErrorMessage(err, "Failed to send message. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="contact-name" className="text-sm font-medium text-black dark:text-white">Name</label>
          <Input
            id="contact-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="contact-email" className="text-sm font-medium text-black dark:text-white">Email</label>
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-subject" className="text-sm font-medium text-black dark:text-white">Subject</label>
        <Input
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What's this about?"
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="contact-message" className="text-sm font-medium text-black dark:text-white">Message</label>
        <Textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write your message..."
          rows={5}
          required
        />
      </div>

      <Button type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Send Message
      </Button>
    </form>
  );
}

type SupportMode = "ticket" | "contact";

const MODES: { key: SupportMode; label: string; icon: typeof LifeBuoy; description: string }[] = [
  { key: "ticket", label: "Raise a Ticket", icon: LifeBuoy, description: "For bugs, billing issues, or account problems." },
  { key: "contact", label: "Contact Us", icon: Mail, description: "General questions, feedback, or partnership inquiries." },
];

export default function SupportPage() {
  const [mode, setMode] = useState<SupportMode>("ticket");
  const active = MODES.find((m) => m.key === mode)!;

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
        <h1 className="text-3xl sm:text-4xl font-bold text-balance">Support &amp; Help</h1>
        <p className="text-muted-foreground text-sm mt-2">
          Raise a support ticket for account or product issues, or send us a general
          message — we usually respond within 1–2 business days.
        </p>

        {/* Toggle */}
        <div className="mt-8 inline-flex p-1 rounded-full bg-muted/60 border border-border/60 relative">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`relative z-10 flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                mode === m.key ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === m.key && (
                <motion.span
                  layoutId="support-toggle-pill"
                  className="absolute inset-0 -z-10 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <m.icon className="w-4 h-4" />
              {m.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <active.icon className="w-5 h-5 text-primary" />
                    {active.label}
                  </CardTitle>
                  <CardDescription>{active.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  {mode === "ticket" ? <TicketForm /> : <ContactForm />}
                </CardContent>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
