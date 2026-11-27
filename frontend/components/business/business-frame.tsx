"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/theme-context";
import { Navbar } from "@/components/NewLanding/components/Navbar";

/**
 * The business landing is a self-contained page under /business-site/.
 * This frame keeps the shared navbar and passes theme plus the API origin
 * through to its demo form.
 */
export function BusinessFrame() {
  const { theme } = useTheme();
  const [hash, setHash] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const handleLoad = useCallback(() => {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    const update = () => setScrolled(frameWindow.scrollY > 50);
    frameWindow.addEventListener("scroll", update, { passive: true });
    update();
  }, []);

  return (
    <div className="h-dvh bg-background">
      <Navbar scrolled={scrolled} />
      <iframe
        ref={frameRef}
        key={theme}
        src={`/business-site/index.html?theme=${theme}&api=${encodeURIComponent(apiUrl)}${hash}`}
        title="Colab Platforms AI for Business"
        onLoad={handleLoad}
        className="block h-full w-full border-0"
      />
    </div>
  );
}
