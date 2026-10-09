"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { motion, type Variants } from "framer-motion";
import { chatService, messageService, modelService, assistantService, folderService, videoService } from "@/lib/services";
import * as LucideIcons from "lucide-react";
import { ChatInput } from "@/components/chat/chat-input";
import { VideoGenerateDialog, type VideoGenerateParams } from "@/components/chat/video-generate-dialog";
import { Sparkles, Folder, Columns2, Globe, Film, ArrowUpRight, type LucideIcon } from "lucide-react";
import { AssistantHero, lift } from "@/components/chat/assistant-hero";
import { getAssistantLook } from "@/components/chat/assistant-theme";
import { useTheme } from "@/context/theme-context";
import { useAuth } from "@/context/auth-context";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

interface Model {
  id: number;
  name: string;
  description: string | null;
  externalId?: string;
  isDefault?: boolean;
  defaultForCapabilities?: string[];
}

export function NewChatPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { theme } = useTheme();

  const [models, setModels] = useState<Model[]>([]);
  const [selectedModels, setSelectedModels] = useState<number[]>([]);
  const [maxModels, setMaxModels] = useState<number>(1); // 1 = single mode (default)
  const [isSending, setIsSending] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  // Lets a suggestion row preselect a capability in the composer.
  const [suggestedType, setSuggestedType] = useState<"STANDARD" | "WEB_SEARCH" | "IMAGE_GENERATION" | "DEEP_RESEARCH" | undefined>(undefined);

  const [assistant, setAssistant] = useState<any | null>(null);
  const [activeFolder, setActiveFolder] = useState<{ name: string; description?: string | null } | null>(null);

  const DEFAULT_SUGGESTIONS: { text: string; hint: string; icon: LucideIcon; onSelect: () => void }[] = [
    {
      text: "Compare models on a hard question",
      hint: "Side by side",
      icon: Columns2,
      onSelect: () => {
        window.dispatchEvent(new CustomEvent("ai-colab:mode-change", { detail: { mode: "multiple" } }));
        setInitialPrompt("Compare models on a hard question: ");
      },
    },
    {
      text: "Research with live web results",
      hint: "Cites sources",
      icon: Globe,
      onSelect: () => {
        setSuggestedType("WEB_SEARCH");
        setInitialPrompt("Research ");
      },
    },
    {
      text: "Make a 5-second product clip",
      hint: "Video Studio",
      icon: Film,
      onSelect: () => setVideoDialogOpen(true),
    },
  ];

  const handleModelChange = (ids: number[]) => {
    setSelectedModels(ids);
    if (ids.length > 0) {
      localStorage.setItem("preferredModelId", String(ids[0]));
    }
  };

  const loadAssistantAndModels = useCallback(async () => {
    let ast: any = null;

    try {
      const savedAssistantId = localStorage.getItem("selectedAssistantId");
      const parsedAssistantId = savedAssistantId ? Number(savedAssistantId) : NaN;
      if (!Number.isNaN(parsedAssistantId)) {
        const res = await assistantService.getById(parsedAssistantId);
        ast = res.data.data;
      }
      setAssistant(ast);

      const modelsCacheKey = "models_cache_v1";
      const modelsCacheTtlMs = 60_000;
      const cachedRaw = sessionStorage.getItem(modelsCacheKey);
      let allModels: any[] = [];
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw);
          if (
            cached &&
            Array.isArray(cached.data) &&
            typeof cached.ts === "number" &&
            Date.now() - cached.ts < modelsCacheTtlMs
          ) {
            allModels = cached.data;
          }
        } catch {
          // ignore malformed cache
        }
      }
      if (allModels.length === 0) {
        const res = await modelService.list({ pageSize: "100" });
        allModels = res.data.data?.data || [];
        sessionStorage.setItem(modelsCacheKey, JSON.stringify({ ts: Date.now(), data: allModels }));
      }
      const activeModels = allModels.filter((m: any) => m.isActive);
      setModels(activeModels);
      
      if (activeModels.length > 0) {
        // If assistant has a default model, use it
        if (ast?.defaultModelId) {
          const m = activeModels.find((model: any) => model.id === ast.defaultModelId);
          if (m) {
            setSelectedModels([m.id]);
            return;
          }
        }

        // New chat: select models that are default for STANDARD capability
        const defaultModels = activeModels.filter((m: any) => m.defaultForCapabilities?.includes("STANDARD"));
        if (defaultModels.length > 0) {
          setSelectedModels(defaultModels.map((m: any) => m.id));
          localStorage.setItem("preferredModelId", String(defaultModels[0].id));
        } else {
          setSelectedModels([activeModels[0].id]);
          localStorage.setItem("preferredModelId", String(activeModels[0].id));
        }
      }
    } catch {
      setAssistant(null);
    }
  }, []);

  const loadActiveFolder = useCallback(async () => {
    try {
      const rawFolderId = localStorage.getItem("pending_new_chat_folder_id");
      const folderId = rawFolderId ? Number(rawFolderId) : null;
      if (!folderId || Number.isNaN(folderId)) {
        setActiveFolder(null);
        return;
      }
      const res = await folderService.getById(folderId);
      setActiveFolder(res.data.data);
    } catch {
      setActiveFolder(null);
    }
  }, []);

  useEffect(() => {
    loadAssistantAndModels();
    loadActiveFolder();
  }, [loadAssistantAndModels, loadActiveFolder]);

  useEffect(() => {
    const handleEvents = () => {
      loadAssistantAndModels();
    };
    const handleFolderEvents = () => {
      loadActiveFolder();
    };
    const handleModeChange = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode;
      if (mode === "single") setMaxModels(1);
      else if (mode === "multiple") setMaxModels(-1);
    };
    window.addEventListener("assistant-selected", handleEvents);
    window.addEventListener("refresh-models", handleEvents);
    window.addEventListener("pending-new-chat-folder-updated", handleFolderEvents);
    window.addEventListener("ai-colab:mode-change", handleModeChange);
    return () => {
      window.removeEventListener("assistant-selected", handleEvents);
      window.removeEventListener("refresh-models", handleEvents);
      window.removeEventListener("pending-new-chat-folder-updated", handleFolderEvents);
      window.removeEventListener("ai-colab:mode-change", handleModeChange);
    };
  }, [loadAssistantAndModels, loadActiveFolder]);

  const handleSend = async (content: string, attachmentIds?: number[], chatType?: string, attachmentObjects?: any[]) => {
    if (isSending) return;
    setIsSending(true);

    try {
      // Optional folder-scoped new chat support.
      const rawPendingFolderId = localStorage.getItem("pending_new_chat_folder_id");
      const pendingFolderId = rawPendingFolderId ? Number(rawPendingFolderId) : null;
      const validPendingFolderId = pendingFolderId && !Number.isNaN(pendingFolderId) ? pendingFolderId : null;

      const payload: any = { 
        title: content.substring(0, 50),
        modelIds: selectedModels,
        // "CODE" (code-workspace pill) is a one-turn flag, not a capability.
        capability: chatType === "CODE" ? "STANDARD" : chatType || "STANDARD",
      };
      if (validPendingFolderId) {
        payload.folderId = validPendingFolderId;
      }
      if (assistant?.id) {
        payload.assistantId = assistant.id;
      }
      const chatRes = await chatService.create(payload);
      const chatId = chatRes.data.data.id;
      const createdInFolder = Boolean(validPendingFolderId);
      localStorage.removeItem("pending_new_chat_folder_id");
      // Context IDs stay in localStorage; chat page applies them right before the first
      // pending message so navigation is not blocked on replaceContexts.
      window.dispatchEvent(
        new CustomEvent("refresh-chats", {
          detail: { immediate: true, refreshFolders: createdInFolder },
        }),
      );
      // Store pending first message in sessionStorage — never in URL params
      sessionStorage.setItem(
        `pending_chat_${chatId}`,
        JSON.stringify({ content, modelIds: selectedModels, chatType: chatType || "STANDARD", attachmentIds, attachmentObjects })
      );
      router.push(`/c/${chatId}`);
    } catch {
      setIsSending(false);
    }
  };

  /**
   * Video generation has no "pending first message" step the way normal
   * chat does — it's a direct API call, not a chat.stream.ts turn — so this
   * creates the chat, kicks off the video against it, and navigates
   * straight there. The new /c/[id] page fetches that video from the
   * server on mount and interleaves it into the message timeline by
   * createdAt, so nothing needs to be threaded through sessionStorage.
   */
  const handleGenerateVideo = async (params: VideoGenerateParams) => {
    const rawPendingFolderId = localStorage.getItem("pending_new_chat_folder_id");
    const pendingFolderId = rawPendingFolderId ? Number(rawPendingFolderId) : null;
    const validPendingFolderId = pendingFolderId && !Number.isNaN(pendingFolderId) ? pendingFolderId : null;

    const payload: any = {
      title: params.prompt.substring(0, 50),
      capability: "STANDARD",
    };
    if (validPendingFolderId) payload.folderId = validPendingFolderId;
    if (assistant?.id) payload.assistantId = assistant.id;

    const chatRes = await chatService.create(payload);
    const chatId = chatRes.data.data.id;
    localStorage.removeItem("pending_new_chat_folder_id");

    window.dispatchEvent(
      new CustomEvent("refresh-chats", {
        detail: { immediate: true, refreshFolders: Boolean(validPendingFolderId) },
      }),
    );

    await videoService.create({ ...params, chatId });
    router.push(`/c/${chatId}`);
  };

  const handleEnhancePrompt = async (prompt: string) => {
    const res = await messageService.enhancePrompt(prompt);
    return res.data.data;
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  let welcomeTitle = user?.firstName ? `${greeting}, ${user.firstName}` : greeting;
  let welcomeSubtitle = "Ask one model, or compare up to 4 side by side.";
  let ActiveIcon: React.ElementType | null = null;
  let suggestions = DEFAULT_SUGGESTIONS;

  if (assistant) {
    welcomeTitle = assistant.name;
    welcomeSubtitle = assistant.description || "How can I help you today?";
    ActiveIcon = ((LucideIcons as any)[assistant.icon] as React.ElementType) || Sparkles;

    if (assistant.suggestedPrompts && assistant.suggestedPrompts.length > 0) {
      suggestions = assistant.suggestedPrompts.slice(0, 3).map((p: string) => ({
        text: p,
        hint: "",
        icon: ArrowUpRight,
        onSelect: () => setInitialPrompt(p),
      }));
    }
  } else if (activeFolder) {
    // Same hero treatment as an Assistant, driven by the active project instead,
    // so chats started here remember what the project is about.
    welcomeTitle = activeFolder.name;
    welcomeSubtitle = activeFolder.description || "Chats here belong to this project.";
    ActiveIcon = Folder;
  }

  return (
    <div className="relative flex flex-col h-full overflow-y-auto">
      {/* Soft accent wash behind the hero */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: "radial-gradient(60% 45% at 50% 28%, var(--cl-accent-soft), transparent 70%)", opacity: 0.7 }}
      />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-7 px-4 py-10">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          className="text-center space-y-2.5 max-w-xl w-full"
        >
          {assistant && ActiveIcon ? (
            <motion.div variants={fadeUp}>
              <AssistantHero assistant={assistant} Icon={ActiveIcon} />
            </motion.div>
          ) : (
            <>
              <motion.div variants={fadeUp} className="flex items-center justify-center gap-3">
                {ActiveIcon && (
                  <div className="w-10 h-10 shrink-0 bg-accent-soft rounded-xl flex items-center justify-center">
                    <ActiveIcon className="w-5 h-5 text-accent-ink" />
                  </div>
                )}
                <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold tracking-tight text-foreground text-balance">
                  {welcomeTitle}
                </h1>
              </motion.div>

              <motion.p variants={fadeUp} className="text-muted-foreground text-[15px] max-w-md mx-auto text-balance">
                {welcomeSubtitle}
              </motion.p>
            </>
          )}
        </motion.div>

        <div className="relative z-10 w-full max-w-3xl">
          <ChatInput
            models={models}
            selectedModels={selectedModels}
            onModelChange={handleModelChange}
            maxModels={maxModels}
            onSend={handleSend}
            onGenerateVideoClick={() => setVideoDialogOpen(true)}
            onEnhancePrompt={handleEnhancePrompt}
            isSending={isSending}
            supportsCodeMode={Boolean(assistant?.supportsCodeMode)}
            forceReset={true}
            chatType={suggestedType}
            onCapabilityChange={setSuggestedType}
            // With an assistant selected, the Chat / Web search / Image / Video pills
            // (and the Assistants link) are hidden; only its own Code pill remains.
            compact={Boolean(assistant)}
            placeholder={assistant ? `Message ${assistant.name}\u2026` : undefined}
            assistantChip={
              assistant && ActiveIcon
                ? {
                    name: assistant.name,
                    Icon: ActiveIcon,
                    color: lift(getAssistantLook(assistant).color, theme === "dark"),
                    onClear: () => {
                      // Same reset the sidebar's "New chat" does: leave the assistant.
                      localStorage.removeItem("selectedAssistantId");
                      window.dispatchEvent(new Event("assistant-selected"));
                    },
                  }
                : undefined
            }
            onAssistantsClick={assistant ? undefined : () => window.dispatchEvent(new Event("ai-colab:open-assistants"))}
            initialPrompt={initialPrompt}
            onPromptClear={() => setInitialPrompt(undefined)}
            draftStorageKey="chat_draft_new"
          />

          {suggestions.length > 0 && (
            <motion.ul
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className="mx-4 mt-2 border-t border-border"
            >
              {suggestions.map((item, i) => {
                const Icon = item.icon;
                return (
                  <li key={i} className="border-b border-border">
                    <button
                      type="button"
                      onClick={item.onSelect}
                      className="w-full flex items-center gap-3 px-3 py-3 text-left text-[13.5px] text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer"
                    >
                      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{item.text}</span>
                      {item.hint && <span className="text-xs text-faint shrink-0">{item.hint}</span>}
                    </button>
                  </li>
                );
              })}
            </motion.ul>
          )}
        </div>
      </div>
      <VideoGenerateDialog
        open={videoDialogOpen}
        onOpenChange={setVideoDialogOpen}
        onSubmit={handleGenerateVideo}
      />
    </div>
  );
}
