import type { Metadata } from "next";
import { GuestChat } from "@/components/guest/GuestChat";

export const metadata: Metadata = {
  title: "Try Colab AI free",
  description: "Chat with AI models for free. No sign-up needed.",
};

export default function TryPage() {
  return <GuestChat />;
}
