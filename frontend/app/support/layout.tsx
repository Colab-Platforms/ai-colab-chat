import { publicMetadata } from "@/lib/seo";

export const metadata = publicMetadata({
  title: "Support & Help | Colab Platforms AI",
  description:
    "Raise a support ticket for account or product issues, or send Colab Platforms AI a general message. The team usually responds within 1–2 business days.",
  path: "/support",
});

export default function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
