import type { ReactNode } from "react";
import { noindexMetadata } from "@/lib/seo";

export const metadata = {
  ...noindexMetadata,
  title: { absolute: "Forgot password | Colab Platforms AI" },
  description: "Reset your Colab Platforms AI password.",
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
