import type { ReactNode } from "react";
import { noindexMetadata } from "@/lib/seo";

export const metadata = {
  ...noindexMetadata,
  title: { absolute: "Create account | Colab Platforms AI" },
  description: "Create a Colab Platforms AI account.",
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children;
}
