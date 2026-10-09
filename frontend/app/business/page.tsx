"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/theme-context";
import { Navbar } from "@/components/NewLanding/components/Navbar";

/**
 * "Colab AI for Business" — a standalone public landing page (no app shell,
 * no sign-in needed), under the same floating navbar as the main landing page.
 * The page itself is a self-contained site served unchanged from
 * /business-site/ (its own header removed), so it is embedded rather than
 * re-implemented. It follows the current theme via ?theme= and scrolls to
 * #sections in this page's URL (e.g. the navbar's "Book a demo" → #demo).
 * Its demo form submits to the backend (POST /demo-requests); admins review
 * the leads at /admin/demo-requests.
 */
export default function BusinessPage() {
  const { theme } = useTheme();
  const [hash, setHash] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The embedded page is static, so it is told where the API lives (its demo
  // form posts to {api}/demo-requests).
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

  useEffect(() => {
    const read = () => setHash(window.location.hash);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  // The content scrolls inside the frame (same origin), so mirror its scroll
  // position into the navbar: transparent at the top, floating pill once scrolled.
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
        title="Colab AI for Business"
        onLoad={handleLoad}
        className="block h-full w-full border-0"
      />
    </div>
  );
}
