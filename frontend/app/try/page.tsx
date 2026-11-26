import { GuestChat } from "@/components/guest/GuestChat";
import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({
  title: "Try Colab Platforms AI free",
  description:
    "Chat with AI models for free on Colab Platforms AI. No sign-up needed.",
  path: "/try",
});

export default function TryPage() {
  return <GuestChat />;
}
