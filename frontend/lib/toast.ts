"use client";

import type { ReactNode } from "react";
import { toast as baseToast } from "@/components/ui/toast";

/**
 * react-toastify-style facade over the shadcn/Base UI toast manager, so call
 * sites keep using `toast.success("...")` / `toast.error("...")` unchanged.
 */

type ToastKind = "success" | "error" | "warning" | "info";

interface ToastExtra {
  description?: ReactNode;
  /** ms before auto-dismiss; maps to Base UI's `timeout`. `0` disables it. */
  duration?: number;
  id?: string;
}

function show(type: ToastKind, message: ReactNode, extra?: ToastExtra) {
  // Creating a toast during render or inside an effect can warn about updating
  // another component mid-render (e.g. chat-input's attachment fallback), so
  // always defer to a microtask.
  queueMicrotask(() => {
    baseToast.add({
      id: extra?.id,
      title: message,
      description: extra?.description,
      timeout: extra?.duration,
      type,
      priority: type === "error" ? "high" : "low",
    });
  });
}

export const toast = {
  success: (message: ReactNode, extra?: ToastExtra) => show("success", message, extra),
  error: (message: ReactNode, extra?: ToastExtra) => show("error", message, extra),
  info: (message: ReactNode, extra?: ToastExtra) => show("info", message, extra),
  warning: (message: ReactNode, extra?: ToastExtra) => show("warning", message, extra),
  warn: (message: ReactNode, extra?: ToastExtra) => show("warning", message, extra),
  dismiss: (id?: string) => baseToast.close(id),
};
