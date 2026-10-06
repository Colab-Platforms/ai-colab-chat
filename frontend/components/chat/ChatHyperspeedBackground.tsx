"use client";

import dynamic from "next/dynamic";
import { useTheme } from "@/context/theme-context";
import { hyperspeedPresets } from "@/components/HyperSpeedPresets";

// Three.js touches window/document at module load time - must never run on the server.
const Hyperspeed = dynamic(() => import("@/components/Hyperspeed"), {
  ssr: false,
});

/**
 * Dark-mode-only Hyperspeed background for the pre-chat empty state.
 * Mount this only where "no conversation started yet" is true (e.g. NewChatPage) -
 * it disappears naturally once that page unmounts after the first message is sent.
 */
export function ChatHyperspeedBackground() {
  const { theme } = useTheme();

  if (theme !== "dark") return null;

  return (
    <div
      className="absolute inset-0 z-0 overflow-hidden"
      aria-hidden="true"
    >
      <Hyperspeed effectOptions={hyperspeedPresets.six} />
    </div>
  );
}
