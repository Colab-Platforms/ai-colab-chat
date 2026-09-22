"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIONS,
  EVENTS,
  Joyride,
  STATUS,
  type EventData,
  type Step,
} from "react-joyride";
import { userService } from "@/lib/services";
import { useAuth } from "@/context/auth-context";

type DeviceType = "mobile" | "tablet" | "desktop";

type GuideStep = Step & {
  id: string;
  devices?: DeviceType[];
};

const GUIDE_VERSION = "v4";
const REPLAY_FLAG_KEY = "ai_colab_startup_guide_replay";

function stateKey(userId: number | null) {
  return `ai_colab_startup_guide_state_${GUIDE_VERSION}_${userId ?? "anon"}`;
}

function getDeviceType(width: number): DeviceType {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

// Steps: Welcome → Message Box → Capability+Model → Sidebar → Settings → Done
const BASE_STEPS: GuideStep[] = [
  {
    id: "welcome",
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "👋 Welcome to AI Colab Chat",
    content:
      "Let's take a quick tour so you feel right at home. We'll highlight each key area and explain what it does — click Next to begin.",
  },
  {
    id: "message-box",
    // Target the whole chat input container so the spotlight covers the full bar
    target: '[data-guide="chat-input-area"]',
    placement: "top",
    skipBeacon: true,
    title: "💬 Message Box",
    content:
      "This is your main workspace. Type your message, attach files with the + button, hit Enhance ✨ to auto-improve your prompt, use the 🎤 mic for voice input, and press Send ↑ when you're ready.",
  },
  {
    id: "capability-model",
    // Default: highlight the trigger button from above
    target: '[data-guide="model-capability-trigger"]',
    placement: "top" as const,
    skipBeacon: true,
    title: "⚡ Capability & Model",
    content:
      "Choose how AI responds. Pick Standard Chat, Web Search, or Image Generation — then select the model that fits your task. Click this selector to explore options.",
  },
  {
    id: "sidebar",
    target: '[data-guide="sidebar"]',
    placement: "right",
    skipBeacon: true,
    title: "🗂️ Sidebar",
    content:
      "Your command centre on the left. Switch between Projects, Assistants (role-specific AI styles), Chat history, and Starred chats — all in one panel.",
    devices: ["tablet", "desktop"],
  },
  {
    id: "sidebar-mobile",
    target: '[data-guide="mobile-menu"]',
    placement: "bottom",
    skipBeacon: true,
    title: "🗂️ Sidebar",
    content:
      "Tap this icon to open the sidebar. Inside you'll find Projects, Assistants, Chat history, and Starred chats.",
    devices: ["mobile"],
  },
  {
    id: "settings-menu",
    target: '[data-guide="profile-menu"]',
    placement: "right",
    skipBeacon: true,
    title: "⚙️ Settings & Account",
    content:
      "Click your avatar or menu here to access Token Usage, My Account, Preferences, and your Subscription details — everything you need to manage your profile.",
  },
  {
    id: "done",
    target: "body",
    placement: "center",
    skipBeacon: true,
    title: "🚀 You're good to go!",
    content:
      "That's everything! Send your first message and see what AI Colab Chat can do. You can replay this tour anytime from Settings → Preferences → Startup Guide.",
  },
];

export function StartupGuide({
  userId,
  isGuideTaken = false,
}: {
  userId?: number;
  isGuideTaken?: boolean;
}) {
  const { refreshUser } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [isCapabilityMenuOpen, setIsCapabilityMenuOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  // Track navigation direction so TARGET_NOT_FOUND skips the right way
  const navDirectionRef = useRef<"forward" | "backward">("forward");
  const isGuideTakenRef = useRef(Boolean(isGuideTaken));

  const numericUserId = typeof userId === "number" ? userId : null;
  const device = useMemo(() => getDeviceType(viewportWidth), [viewportWidth]);

  useEffect(() => {
    isGuideTakenRef.current = Boolean(isGuideTaken);
  }, [isGuideTaken]);

  const steps = useMemo(() => {
    const filtered = BASE_STEPS.filter(
      (step) => !step.devices || step.devices.includes(device),
    );

    // Capability dropdown open → spotlight shifts to open dropdown menu, tooltip to the right
    if (isCapabilityMenuOpen) {
      return filtered.map((step) =>
        step.id === "capability-model"
          ? {
              ...step,
              target: '[data-guide="capability-menu"]',
              placement: "right" as const,
              offset: 12,
            }
          : step,
      );
    }

    if (isMobileSidebarOpen) {
      return filtered.map((step) =>
        step.id === "sidebar-mobile"
          ? {
              ...step,
              target: '[data-guide="sidebar-user-menu"]',
              placement: "top" as const,
              offset: 8,
              title: "🗂️ Sidebar — Explore!",
              content:
                "Scroll up to find Projects, Assistants, Chat history, and Starred chats. Tap Next when done.",
            }
          : step,
      );
    }

    return filtered;
  }, [device, isCapabilityMenuOpen, isMobileSidebarOpen]);

  const finishGuide = useCallback(() => {
    setRun(false);
    setStepIndex(0);
    localStorage.removeItem(REPLAY_FLAG_KEY);
    sessionStorage.removeItem(stateKey(numericUserId));

    if (!numericUserId || isGuideTakenRef.current) {
      return;
    }

    isGuideTakenRef.current = true;

    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser) as Record<string, unknown>;
        localStorage.setItem(
          "user",
          JSON.stringify({ ...parsed, isGuideTaken: true }),
        );
      } catch {
        // Ignore malformed cached user payload.
      }
    }

    void userService
      .updateGuideStatus(true)
      .then(() => refreshUser())
      .catch(() => {
        // Ignore transient failures; backend value will sync on next profile refresh.
      });
  }, [numericUserId, refreshUser]);

  const startGuide = useCallback(
    (index = 0) => {
      setStepIndex(Math.max(0, Math.min(index, Math.max(steps.length - 1, 0))));
      setRun(true);
    },
    [steps.length],
  );

  useEffect(() => {
    setIsMounted(true);
    const updateWidth = () => setViewportWidth(window.innerWidth);
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, []);

  useEffect(() => {
    if (!isMounted || !numericUserId) return;

    // 1. Strict block: Wait if the free plan prompt is pending handling so modals don't overlap.
    const pendingSignup =
      localStorage.getItem("signup_free_plan_prompt_pending") === "1";
    const seenSignup =
      localStorage.getItem("signup_free_plan_prompt_seen") === "1";
    if (pendingSignup && !seenSignup) {
      return;
    }

    // 2. Now safe to evaluate if we should restore or start the guide
    const replayRequested = localStorage.getItem(REPLAY_FLAG_KEY) === "1";
    const savedStateRaw = sessionStorage.getItem(stateKey(numericUserId));

    if (savedStateRaw) {
      try {
        const parsed = JSON.parse(savedStateRaw) as {
          running?: boolean;
          stepIndex?: number;
        };
        if (parsed.running) {
          startGuide(
            typeof parsed.stepIndex === "number" ? parsed.stepIndex : 0,
          );
          return;
        }
      } catch {
        sessionStorage.removeItem(stateKey(numericUserId));
      }
    }

    if (replayRequested || !isGuideTakenRef.current) {
      startGuide(0);
    }
  }, [isMounted, numericUserId, startGuide]);

  // Listen for when the plan popup is handled (either closed or silently dismissed)
  useEffect(() => {
    if (!isMounted || !numericUserId) return;
    const onPlanPopupHandled = () => {
      if (!isGuideTakenRef.current) {
        startGuide(0);
      }
    };
    window.addEventListener("ai-colab:plan-popup-handled", onPlanPopupHandled);
    return () =>
      window.removeEventListener(
        "ai-colab:plan-popup-handled",
        onPlanPopupHandled,
      );
  }, [isMounted, numericUserId, startGuide]);

  useEffect(() => {
    if (!isMounted) return;

    const onStartGuide = () => {
      localStorage.setItem(REPLAY_FLAG_KEY, "1");
      startGuide(0);
    };

    window.addEventListener("ai-colab:start-guide", onStartGuide);
    return () =>
      window.removeEventListener("ai-colab:start-guide", onStartGuide);
  }, [isMounted, startGuide]);

  // Listen for the capability dropdown open/close to dynamically reposition the guide
  useEffect(() => {
    if (!isMounted) return;
    const onOpen = () => setIsCapabilityMenuOpen(true);
    const onClose = () => setIsCapabilityMenuOpen(false);
    window.addEventListener("ai-colab:capability-menu-opened", onOpen);
    window.addEventListener("ai-colab:capability-menu-closed", onClose);
    return () => {
      window.removeEventListener("ai-colab:capability-menu-opened", onOpen);
      window.removeEventListener("ai-colab:capability-menu-closed", onClose);
    };
  }, [isMounted]);

  // Listen for mobile sidebar open/close to dynamically shift the guide spotlight
  useEffect(() => {
    if (!isMounted) return;
    const onSidebarOpen = () => setIsMobileSidebarOpen(true);
    const onSidebarClose = () => setIsMobileSidebarOpen(false);
    window.addEventListener("ai-colab:mobile-sidebar-opened", onSidebarOpen);
    window.addEventListener("ai-colab:mobile-sidebar-closed", onSidebarClose);
    return () => {
      window.removeEventListener(
        "ai-colab:mobile-sidebar-opened",
        onSidebarOpen,
      );
      window.removeEventListener(
        "ai-colab:mobile-sidebar-closed",
        onSidebarClose,
      );
    };
  }, [isMounted]);

  useEffect(() => {
    if (!run || !numericUserId) return;
    sessionStorage.setItem(
      stateKey(numericUserId),
      JSON.stringify({ running: true, stepIndex }),
    );
  }, [run, stepIndex, numericUserId]);

  const handleJoyrideCallback = useCallback(
    (data: EventData) => {
      const { action, index, status, type } = data;

      const terminalAction =
        action === ACTIONS.CLOSE ||
        action === ACTIONS.SKIP ||
        action === ACTIONS.STOP ||
        action === ACTIONS.RESET ||
        action === ACTIONS.COMPLETE;

      if (
        status === STATUS.FINISHED ||
        status === STATUS.SKIPPED ||
        type === EVENTS.TOUR_END ||
        terminalAction
      ) {
        finishGuide();
        return;
      }

      // Skip in the direction the user was navigating so back-navigation
      // doesn't get stuck in a forward loop when a target isn't in the DOM yet.
      if (type === EVENTS.TARGET_NOT_FOUND) {
        if (navDirectionRef.current === "backward") {
          setStepIndex((prev) => Math.max(prev - 1, 0));
        } else {
          setStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
        }
        return;
      }

      if (type === EVENTS.STEP_AFTER) {
        const isLastStep = index >= steps.length - 1;
        const currentStepId = steps[index]?.id;
        const nextIndex = Math.max(index - 1, 0);
        const nextStepId = steps[nextIndex]?.id;

        if (action === ACTIONS.PREV) {
          navDirectionRef.current = "backward";

          // Going back from sidebar-mobile → close sidebar so previous step is visible
          if (currentStepId === "sidebar-mobile" && isMobileSidebarOpen) {
            window.dispatchEvent(new Event("ai-colab:close-mobile-sidebar"));
          }
          // Going back from settings-menu on mobile → open sidebar so profile-menu is accessible
          if (currentStepId === "settings-menu" && device === "mobile") {
            window.dispatchEvent(new Event("ai-colab:open-mobile-sidebar"));
          }
          // Going back to settings-menu from any later step on mobile → open sidebar
          if (nextStepId === "settings-menu" && device === "mobile") {
            window.dispatchEvent(new Event("ai-colab:open-mobile-sidebar"));
          }

          setStepIndex(Math.max(index - 1, 0));
          return;
        }

        if (action === ACTIONS.NEXT) {
          navDirectionRef.current = "forward";
          if (isLastStep) {
            finishGuide();
            return;
          }
          // Keep sidebar open when going Next from sidebar-mobile step
          // (next step — settings-menu — targets profile-menu inside the open sidebar)
          setStepIndex(Math.min(index + 1, steps.length - 1));
        }
      }
    },
    [finishGuide, steps, isMobileSidebarOpen, device],
  );

  if (!isMounted || !run || steps.length === 0) {
    return null;
  }

  return (
    <Joyride
      run={run}
      steps={steps}
      stepIndex={stepIndex}
      onEvent={handleJoyrideCallback}
      continuous
      scrollToFirstStep
      options={{
        showProgress: true,
        buttons: ["back", "close", "primary", "skip"],
        // Allow clicking the highlighted target so popups open naturally
        overlayClickAction: false,
        blockTargetInteraction: false,
        dismissKeyAction: "close",
        scrollDuration: 250,
        spotlightRadius: 14,
        spotlightPadding: 10,
        // When mobile sidebar is open: drop below sidebar z-50 so sidebar is naturally highlighted
        // otherwise sit at 9000 above all page content and dropdowns
        zIndex: isMobileSidebarOpen ? 45 : 9000,
        overlayColor: "rgba(8, 12, 22, 0.50)",
        primaryColor: "var(--landing-primary-color)",
        textColor: "var(--foreground)",
        backgroundColor: "var(--background)",
      }}
      styles={{
        tooltip: {
          borderRadius: 16,
          boxShadow: "0 20px 45px rgba(2, 6, 23, 0.20)",
          maxWidth: 400,
          border: "1px solid var(--border)",
          backgroundColor: "var(--background)",
          color: "var(--foreground)",
          opacity: 1,
          padding: 15,
        },
        floater: {
          filter: "none",
          opacity: 1,
          // Tooltip floater sits above the overlay AND above dropdowns (z-9500)
          zIndex: 9600,
        },
        tooltipContainer: {
          textAlign: "left",
          padding: "18px 18px 14px",
          backgroundColor: "var(--background)",
          opacity: 1,
        },
        tooltipTitle: {
          fontSize: "1.1rem",
          fontWeight: 700,
          color: "var(--foreground)",
          lineHeight: 1.3,
          marginBottom: 8,
        },
        tooltipContent: {
          color: "var(--muted-foreground)",
          fontSize: "0.93rem",
          lineHeight: 1.65,
          marginBottom: 2,
        },
        tooltipFooter: {
          marginTop: 14,
          borderTop: "1px solid var(--border)",
          paddingTop: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        },
        tooltipFooterSpacer: {
          flex: 1,
        },
        buttonPrimary: {
          backgroundColor: "var(--landing-primary-color)",
          color: "#ffffff",
          borderRadius: 999,
          fontWeight: 700,
          fontSize: "0.84rem",
          lineHeight: 1,
          padding: "10px 16px",
          minHeight: 36,
          whiteSpace: "nowrap",
          border: "none",
          boxShadow: "0 8px 20px rgba(134, 16, 67, 0.25)",
        },
        buttonBack: {
          color: "var(--muted-foreground)",
          fontWeight: 600,
          borderRadius: 999,
          fontSize: "0.85rem",
          lineHeight: 1,
          padding: "9px 12px",
          minHeight: 34,
          marginRight: 8,
        },
        buttonSkip: {
          color: "var(--muted-foreground)",
          fontWeight: 600,
          borderRadius: 999,
          fontSize: "0.85rem",
          lineHeight: 1,
          padding: "9px 10px",
          minHeight: 34,
        },
        buttonClose: {
          color: "var(--muted-foreground)",
          margin: 10,
        },
        overlay: {
          backdropFilter: "none",
        },
      }}
      locale={{
        back: "Back",
        close: "Close",
        last: "Done",
        next: "Next →",
        skip: "Skip tour",
      }}
    />
  );
}
