"use client";

import type { ElementType } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTheme } from "@/context/theme-context";
import { getAssistantLook } from "./assistant-theme";

/** Where each floating tile sits, as an offset from the centre icon (px). */
const SLOTS = [
  { dx: -234, dy: 0, size: 48 },
  { dx: 234, dy: 0, size: 48 },
  { dx: -289, dy: 60, size: 38 },
  { dx: 291, dy: 60, size: 38 },
  { dx: -244, dy: 114, size: 32 },
  { dx: 246, dy: 114, size: 32 },
];

/** Readable accent in dark mode: the light-mode colour lifted towards white. */
export const lift = (color: string, dark: boolean) =>
  dark ? `color-mix(in srgb, ${color} 55%, white)` : color;

/**
 * An assistant's start-screen header: its icon in an accent-tinted tile,
 * six small icons floating around it, then the name and description.
 * The page background is the normal chat background — only these tiles carry
 * the assistant's colour.
 */
export function AssistantHero({
  assistant,
  Icon,
}: {
  assistant: { name: string; description?: string | null; bgVia?: string | null; bgFrom?: string | null; bgTo?: string | null };
  Icon: ElementType;
}) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();
  const dark = theme === "dark";
  const look = getAssistantLook(assistant);
  const color = lift(look.color, dark);

  return (
    <div className="relative mx-auto w-full max-w-[640px] text-center">
      {/* Floating icons — decorative, wide screens only (they extend ~310px each side) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 hidden h-0 lg:block" aria-hidden="true">
        {SLOTS.map((slot, i) => {
          const Float = look.icons[i];
          if (!Float) return null;
          return (
            <motion.span
              key={i}
              className="absolute flex items-center justify-center rounded-xl border border-border bg-surface shadow-cl"
              style={{
                left: `calc(50% + ${slot.dx}px)`,
                top: 26 + slot.dy,
                width: slot.size,
                height: slot.size,
                marginLeft: -slot.size / 2,
                marginTop: -slot.size / 2,
                color,
              }}
              animate={reduceMotion ? undefined : { y: [0, -5, 0] }}
              transition={{ duration: 4 + (i % 3), repeat: Infinity, ease: "easeInOut", delay: i * 0.4 }}
            >
              <Float style={{ width: slot.size * 0.42, height: slot.size * 0.42 }} />
            </motion.span>
          );
        })}
      </div>

      <div
        className="relative mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-xl"
        style={{ color, background: `color-mix(in srgb, ${look.color} ${dark ? 22 : 14}%, transparent)` }}
      >
        <Icon className="h-6 w-6" />
      </div>

      <h1 className="mt-3.5 text-[28px] sm:text-[32px] font-semibold leading-tight tracking-tight text-foreground text-balance">
        {assistant.name}
      </h1>
      {assistant.description && (
        <p className="mx-auto mt-2 max-w-[480px] text-[15px] text-muted-foreground text-balance">{assistant.description}</p>
      )}
    </div>
  );
}
