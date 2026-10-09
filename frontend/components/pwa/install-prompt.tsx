"use client";

import { useEffect, useState } from "react";
import { X, Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Keep in sync with the `duration-300` exit classes on the card.
const EXIT_MS = 300;

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // Don't show if already installed or dismissed this session
    const wasDismissed = sessionStorage.getItem("pwa-prompt-dismissed");
    if (wasDismissed) return;

    // Detect iOS (Safari doesn't fire beforeinstallprompt)
    const ios =
      /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) &&
      !(navigator.userAgent as string).includes("CriOS");
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

    if (isStandalone) return; // Already installed

    if (ios) {
      setIsIos(true);
      // Show iOS hint after 3 s
      setTimeout(() => setShow(true), 3000);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Small delay so the page settles before the prompt appears
      setTimeout(() => setShow(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Play the exit animation before unmounting.
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      setShow(false);
      setDismissed(true);
    }, EXIT_MS);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      close();
    }
  };

  const handleDismiss = () => {
    // Persist immediately so a reload mid-animation still respects the dismissal.
    sessionStorage.setItem("pwa-prompt-dismissed", "1");
    close();
  };

  if (!show || dismissed) return null;

  return (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 md:left-auto md:right-6 md:translate-x-0 z-[999] w-[calc(100%-2rem)] max-w-sm"
      role="dialog"
      aria-label="Install AI Colab Chat"
    >
      <div
        className={cn(
          "relative rounded-2xl border border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl p-4 flex items-start gap-3",
          "ease-out motion-reduce:animate-none",
          // Mobile slides up from the bottom; desktop slides in from the right
          // edge. The `*-bottom-0` overrides zero out the vertical component so
          // the desktop motion stays purely horizontal.
          closing
            ? "animate-out fade-out slide-out-to-bottom-4 md:slide-out-to-bottom-0 md:slide-out-to-right duration-300 fill-mode-forwards"
            : "animate-in fade-in slide-in-from-bottom-4 md:slide-in-from-bottom-0 md:slide-in-from-right duration-300 md:duration-500",
        )}
      >
        {/* App icon */}
        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-primary/25 to-primary/10 flex items-center justify-center border border-primary/20">
          <Smartphone className="w-6 h-6 text-primary" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">
            Install AI Colab Chat
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {isIos
              ? 'Tap the share icon below, then "Add to Home Screen" for faster access.'
              : "Add to your home screen for a faster, app-like experience."}
          </p>

          {/* iOS share hint */}
          {isIos && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/60 rounded-lg px-2.5 py-1.5">
              <span>Tap</span>
              <ShareIcon />
              <span>→ Add to Home Screen</span>
            </div>
          )}

          {/* Install button for browsers that support it */}
          {!isIos && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 text-xs px-4 rounded-lg gap-1.5"
                onClick={handleInstall}
              >
                <Download className="w-3.5 h-3.5" />
                Install
              </Button>
              <button
                onClick={handleDismiss}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Not now
              </button>
            </div>
          )}
        </div>

        {/* Close */}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// Inline SVG of iOS share icon so we depend on nothing extra
function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-3.5 h-3.5 inline"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
