"use client";

import { useEffect, useState } from "react";
import { autoModelService } from "@/lib/services";
import { toast } from "@/lib/toast";

/**
 * "Auto" model mode. It's a per-browser switch (like the single/multi toggle),
 * while *how* Auto chooses (Economy / Balanced / Quality) is an account
 * preference saved on the server. The model itself is picked per message by
 * POST /auto-model/resolve and then sent through the normal send path.
 */
const STORAGE_KEY = "ai-colab:auto-model";
const CHANGE_EVENT = "ai-colab:auto-model-changed";

export function isAutoModelEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAutoModelEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAutoModel(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const sync = () => setEnabled(isAutoModelEnabled());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [enabled, setAutoModelEnabled];
}

/**
 * Asks the server which model should answer this message. Returns the model id
 * or null if Auto couldn't decide (network error, nothing available), in which
 * case the caller falls back to the manually selected model. Tells the user
 * when Auto moved the chat to a different model.
 */
export async function resolveAutoModelId(params: {
  content: string;
  chatId?: number;
  chatType?: string;
  attachmentIds?: number[];
}): Promise<number | null> {
  try {
    const res = await autoModelService.resolve(params);
    const data = res?.data?.data;
    if (!data?.modelId) return null;
    if (data.switched) toast.info(`Auto switched to ${data.modelName}: ${data.reason}`);
    return data.modelId as number;
  } catch (err: any) {
    console.error("[auto-model] resolve failed", err);
    toast.error("Auto couldn't pick a model, so your selected model was used.");
    return null;
  }
}
