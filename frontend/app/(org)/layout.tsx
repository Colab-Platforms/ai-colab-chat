import type { ReactNode } from "react";
import { noindexMetadata } from "@/lib/seo";

export const metadata = noindexMetadata;

export default function OrgGroupLayout({ children }: { children: ReactNode }) {
  return children;
}
