"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Compass, Sun, Moon, Columns2, Focus } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import {
  SectionLabel,
  Segmented,
  SettingRow,
  SettingsCard,
  SettingsHeader,
} from "@/components/settings/settings-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  userPreferenceService,
  voiceService,
} from "@/lib/services";
import { toast } from "@/lib/toast";

export default function PreferencesPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  // Multi-model layout lives in localStorage — the chat view reads the same key.
  const [multiView, setMultiView] = useState<"columns" | "focus">("columns");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai-colab:multi-view");
      if (saved === "columns" || saved === "focus") setMultiView(saved);
    } catch { /* storage unavailable */ }
  }, []);
  const changeMultiView = (mode: "columns" | "focus") => {
    setMultiView(mode);
    try { localStorage.setItem("ai-colab:multi-view", mode); } catch { /* storage unavailable */ }
  };
  // ── Preferences state ────────────────────────────────────────────────────
  const [followUpEnabled, setFollowUpEnabled] = useState(false);
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [togglingFollowUp, setTogglingFollowUp] = useState(false);

  // ── Voice preference state ───────────────────────────────────────────────
  const [voiceOptions, setVoiceOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>("");
  const [savingVoice, setSavingVoice] = useState(false);

  // ── Fetch ─────────────────────────────────────────────────────────────────

  const fetchPreferences = useCallback(async () => {
    try {
      const res = await userPreferenceService.getPreferences();
      const prefs = res?.data?.data;
      setFollowUpEnabled(prefs?.enableFollowUpQuestions ?? false);
      setSelectedVoiceId(prefs?.voiceId ?? "");
    } catch {
      setFollowUpEnabled(false);
    } finally {
      setLoadingPrefs(false);
    }
  }, []);

  const fetchVoiceOptions = useCallback(async () => {
    try {
      const res = await voiceService.listOptions();
      setVoiceOptions(res?.data?.data ?? []);
    } catch {
      setVoiceOptions([]);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
    fetchVoiceOptions();
  }, [fetchPreferences, fetchVoiceOptions]);

  // ── Preferences handlers ──────────────────────────────────────────────────

  const handleToggleFollowUp = async (val: boolean) => {
    setTogglingFollowUp(true);
    try {
      await userPreferenceService.updatePreferences({
        enableFollowUpQuestions: val,
      });
      setFollowUpEnabled(val);
    } catch {
      toast.error("Failed to update preference");
    } finally {
      setTogglingFollowUp(false);
    }
  };

  const handleVoiceChange = async (val: string) => {
    const nextVoiceId = val === "default" ? null : val;
    setSavingVoice(true);
    try {
      await userPreferenceService.updatePreferences({ voiceId: nextVoiceId });
      setSelectedVoiceId(nextVoiceId ?? "");
    } catch {
      toast.error("Failed to update voice");
    } finally {
      setSavingVoice(false);
    }
  };

  const handleStartGuide = () => {
    if (typeof window === "undefined") return;

    localStorage.setItem("ai_colab_startup_guide_replay", "1");
    window.dispatchEvent(new Event("ai-colab:start-guide"));

    const lastPath = localStorage.getItem("last_chat_path") || "/home";
    router.push(lastPath);
    toast.info("Interactive startup guide started.");
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <SettingsHeader title="Preferences" description="How Colab AI looks, answers and talks to you." />

      <SectionLabel>Appearance</SectionLabel>
      <SettingsCard>
        <SettingRow title="Theme" description="Applies to every screen.">
          <Segmented
            value={theme}
            onChange={(v) => {
              if (v !== theme) toggleTheme();
            }}
            options={[
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
            ]}
          />
        </SettingRow>
      </SettingsCard>

      <SectionLabel>Chat</SectionLabel>
      <SettingsCard>
        <SettingRow
          title="Suggested follow-up questions"
          description="Add 4 context-aware questions at the end of each AI response."
        >
          <Switch
            checked={followUpEnabled}
            onCheckedChange={handleToggleFollowUp}
            disabled={togglingFollowUp || loadingPrefs}
            id="follow-up-toggle"
          />
        </SettingRow>
        <SettingRow title="Multi-model answers" description="How answers appear when you ask more than one model.">
          <Segmented
            value={multiView}
            onChange={changeMultiView}
            options={[
              { value: "columns", label: "Columns", icon: Columns2 },
              { value: "focus", label: "Focus", icon: Focus },
            ]}
          />
        </SettingRow>
      </SettingsCard>

      <SectionLabel>Voice</SectionLabel>
      <SettingsCard>
        <SettingRow title="Assistant voice" description="The voice Colab AI speaks with during voice chats.">
          <Select
            value={selectedVoiceId || "default"}
            onValueChange={handleVoiceChange}
            disabled={savingVoice || loadingPrefs}
          >
            <SelectTrigger className="w-40 rounded-xl">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              {voiceOptions.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingsCard>

      <SectionLabel>Help</SectionLabel>
      <SettingsCard>
        <SettingRow
          title="Startup guide"
          description="Re-run the walkthrough of chat basics, multi-model answers, contexts, assistants, the prompt enhancer, files and voice."
        >
          <Button variant="outline" onClick={handleStartGuide} className="gap-2 rounded-xl">
            <Compass className="h-4 w-4" /> Start guide
          </Button>
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
