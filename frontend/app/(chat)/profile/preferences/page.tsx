"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Compass, AudioLines } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="space-y-8">
      {/* ── AI Suggestions ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold">AI Suggestions</h2>
        </div>

        <Card className="border-border/30 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">
                  Suggested Follow-up Questions
                </p>
                <p className="text-xs text-muted-foreground">
                  Automatically generate 4 context-aware questions at the end of
                  each AI response.
                </p>
              </div>
              <Switch
                checked={followUpEnabled}
                onCheckedChange={handleToggleFollowUp}
                disabled={togglingFollowUp || loadingPrefs}
                id="follow-up-toggle"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Voice ── */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <AudioLines className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold">Voice</h2>
        </div>

        <Card className="border-border/30 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Assistant Voice</p>
                <p className="text-xs text-muted-foreground">
                  Choose the voice ColabAI speaks with during voice calls.
                </p>
              </div>
              <Select
                value={selectedVoiceId || "default"}
                onValueChange={handleVoiceChange}
                disabled={savingVoice || loadingPrefs}
              >
                <SelectTrigger className="w-40">
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
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold">Startup Guide</h2>
        </div>

        <Card className="border-border/30 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                Interactive onboarding walkthrough
              </p>
              <p className="text-xs text-muted-foreground">
                Re-run the guide anytime to learn chat basics, capabilities,
                multi-model flow, contexts, assistants, enhancer, files, and
                mic.
              </p>
            </div>
            <Button onClick={handleStartGuide} className="sm:self-start">
              Start Guide
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
