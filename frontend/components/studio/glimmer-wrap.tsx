"use client";

import { type ReactNode, useMemo } from "react";
import { cn } from "@/lib/utils";

type Glint = {
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
  dx: number;
  dy: number;
  peak: number;
};

/**
 * A field of fine glints drifting past, flashing as they catch the light —
 * a lightweight re-creation of reactbits' "Glimmer Wrap" effect, built with
 * plain CSS animations so it's cheap enough to run in small thumbnails too.
 */
function useGlints(count: number, seed: number) {
  return useMemo(() => {
    let state = seed;
    const rand = () => {
      // Deterministic per-card so the pattern doesn't reshuffle on re-render.
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return (state / 0x7fffffff);
    };
    return Array.from({ length: count }, (): Glint => ({
      left: rand() * 100,
      top: rand() * 100,
      size: 1 + rand() * 2.5,
      duration: 1.8 + rand() * 2.6,
      delay: rand() * 4,
      dx: (rand() - 0.5) * 24,
      dy: (rand() - 0.5) * 24,
      peak: 0.5 + rand() * 0.5,
    }));
  }, [count, seed]);
}

export function GlimmerWrap({
  children,
  className,
  density = 46,
  seed = 1,
}: {
  children?: ReactNode;
  className?: string;
  density?: number;
  seed?: number;
}) {
  const glints = useGlints(density, seed);

  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden bg-[linear-gradient(135deg,#1b1a23,#2a2135_55%,#3a2a44)]",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,rgba(140,107,255,0.18),transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0">
        {glints.map((glint, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-white"
            style={{
              left: `${glint.left}%`,
              top: `${glint.top}%`,
              width: glint.size,
              height: glint.size,
              boxShadow: "0 0 6px 1px rgba(255,255,255,0.8)",
              animation: `glimmer-twinkle ${glint.duration}s ease-in-out ${glint.delay}s infinite, glimmer-drift ${glint.duration * 2.4}s ease-in-out ${glint.delay}s infinite alternate`,
              ["--glimmer-peak" as string]: glint.peak,
              ["--glimmer-dx" as string]: `${glint.dx}px`,
              ["--glimmer-dy" as string]: `${glint.dy}px`,
            }}
          />
        ))}
      </div>
      {children ? <div className="relative z-10">{children}</div> : null}
    </div>
  );
}
