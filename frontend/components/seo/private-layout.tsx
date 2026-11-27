import type { ReactNode } from "react";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata;

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return children;
}
