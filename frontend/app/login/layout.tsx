import type { ReactNode } from "react";
import { noindexMetadata } from "@/lib/seo";

export const metadata = {
  ...noindexMetadata,
  title: { absolute: "Sign in | Colab Platforms AI" },
  description: "Sign in to Colab Platforms AI.",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
