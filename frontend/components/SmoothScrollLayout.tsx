"use client";

import { useEffect } from "react";
import Lenis from "lenis";

interface SmoothScrollLayoutProps {
  children: React.ReactNode;
}

export default function SmoothScrollLayout({ children }: SmoothScrollLayoutProps) {
  useEffect(() => {
    // Touch devices and users who asked for less motion already get native,
    // GPU-composited scrolling; layering Lenis on top makes fixed elements
    // (the navbar) jitter when the mobile URL bar collapses or on rotation.
    const skip =
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (skip) return;

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
    });

    let rafId: number;

    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
