import type { ReactNode } from "react";
import { noindexMetadata } from "@/lib/seo";
import { ChatSegmentLayout } from "./chat-segment-layout";

export const metadata = noindexMetadata;

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <ChatSegmentLayout>{children}</ChatSegmentLayout>;
}
