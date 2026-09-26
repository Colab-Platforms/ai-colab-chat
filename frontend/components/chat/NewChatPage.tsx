"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { motion, type Variants } from "framer-motion";
import { chatService, messageService, modelService, assistantService, folderService, videoService } from "@/lib/services";
import * as LucideIcons from "lucide-react";
import { ChatInput } from "@/components/chat/chat-input";
import { VideoGenerateDialog, type VideoGenerateParams } from "@/components/chat/video-generate-dialog";
import { MessageSquare, Sparkles, Folder } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { ChatHyperspeedBackground } from "@/components/chat/ChatHyperspeedBackground";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

const wordContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } },
};

const wordFadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const } },
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

  const [models, setModels] = useState<Model[]>([]);
  const [selectedModels, setSelectedModels] = useState<number[]>([]);
  const [maxModels, setMaxModels] = useState<number>(1); // 1 = single mode (default)
  const [isSending, setIsSending] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState<string | undefined>(undefined);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);

  const [assistant, setAssistant] = useState<any | null>(null);
  const [activeFolder, setActiveFolder] = useState<{ name: string; description?: string | null } | null>(null);

  const SUGGESTED_PROMPTS = [
    { text: "Brainstorm ideas for...", value: "Brainstorm ideas for ", icon: Sparkles, className: "w-3.5 h-3.5 inline mr-2" },
    { text: "Help me write a...", value: "Help me write a ", icon: MessageSquare, className: "w-3.5 h-3.5 inline mr-2" },
    { text: "Explain how...", value: "Explain how ", icon: MessageSquare, className: "w-3.5 h-3.5 inline mr-2 inline-block transform scale-x-[-1]" },
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
        capability: chatType || "STANDARD",
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

  let welcomeTitle = user?.firstName ? `Hi ${user.firstName}` : "Hi there";
  let welcomeSubtitle = "What's on your mind today?";
  let ActiveIcon: React.ElementType = Sparkles;
  let activePrompts = SUGGESTED_PROMPTS;

  if (assistant) {
    welcomeTitle = assistant.name;
    welcomeSubtitle = assistant.description || "How can I help you today?";
    const IconComponent = (LucideIcons as any)[assistant.icon] as React.ElementType;
    if (IconComponent) ActiveIcon = IconComponent;

    if (assistant.suggestedPrompts && assistant.suggestedPrompts.length > 0) {
      activePrompts = assistant.suggestedPrompts.map((p: string, i: number) => ({
        text: p,
        value: p,
        icon: MessageSquare,
        className: "w-3.5 h-3.5 inline mr-2",
      }));
    }
  } else if (activeFolder) {
    // Same hero treatment as an Assistant — just driven by the active project
    // instead, so chats started here remember what the project is about.
    welcomeTitle = activeFolder.name;
    welcomeSubtitle = activeFolder.description || "Chats here belong to this project.";
    ActiveIcon = Folder;
  }

  return (
    <div className="relative flex flex-col h-full overflow-y-auto">
      {/* <ChatHyperspeedBackground /> */}

      {/* Ambient glow behind the centered hero + input, à la Gemini's start screen */}
      <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
        <div className="h-[420px] w-[720px] max-w-[90vw] rounded-full bg-primary/10 dark:bg-primary/25 blur-[110px]" />
      </div>

      {/* Center hero + input, grouped so they stay together mid-screen at start */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 p-4">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          className="text-center space-y-4 max-w-xl w-full"
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border/50 bg-background/70 backdrop-blur-sm shadow-sm text-xs font-medium text-muted-foreground"
          >
            <Image src="/black.webp" alt="" width={16} height={16} className="dark:hidden h-4 w-auto opacity-90" />
            <Image src="/white.webp" alt="" width={16} height={16} className="hidden dark:block h-4 w-auto opacity-90" />
            Colab AI · Multi-model AI platform
          </motion.div>

          <motion.div variants={fadeUp} className="flex items-center justify-center gap-3">
            <div className={`w-10 h-10 shrink-0 ${assistant || activeFolder ? "bg-primary/10" : "bg-gradient-to-br from-primary/20 to-primary/5"} rounded-xl flex items-center justify-center shadow-sm`}>
              {assistant || activeFolder ? (
                <ActiveIcon className="w-5 h-5 text-primary/80" />
              ) : (
                <Image src="/icons/Colab Infinite.png" alt="" width={22} height={22} className="w-[22px] h-[22px] object-contain" />
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground text-balance">{welcomeTitle}</h1>
          </motion.div>

          <motion.p
            variants={wordContainer}
            className="text-foreground/70 text-base sm:text-lg font-normal italic max-w-md mx-auto text-balance"
          >
            {welcomeSubtitle.split(" ").map((word, i) => (
              <motion.span key={i} variants={wordFadeUp} className="inline-block mr-[0.28em] last:mr-0">
                {word}
              </motion.span>
            ))}
          </motion.p>

          {activePrompts.length > 0 && (
            <motion.div variants={fadeUp} className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {activePrompts.slice(0, 3).map((prompt, index) => {
                const Icon = prompt.icon;
                return (
                  <motion.button
                    key={index}
                    whileHover={{ scale: 1.03, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setInitialPrompt(prompt.value)}
                    className="px-4 py-2 text-sm bg-background/80 hover:bg-background rounded-full transition-colors text-muted-foreground hover:text-foreground border border-border/40 shadow-[0_2px_12px_-3px_hsl(var(--primary)/0.25),0_0_0_1px_hsl(var(--primary)/0.06)] dark:shadow-[0_2px_14px_-3px_hsl(var(--primary)/0.35),0_0_0_1px_hsl(var(--primary)/0.12)] cursor-pointer"
                  >
                    <Icon className={prompt.className} />
                    {prompt.text}
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </motion.div>

        <div className="relative z-10 w-full max-w-2xl">
          <ChatInput
            models={models}
            selectedModels={selectedModels}
            onModelChange={handleModelChange}
            maxModels={maxModels}
            onSend={handleSend}
            onGenerateVideoClick={() => setVideoDialogOpen(true)}
            onEnhancePrompt={handleEnhancePrompt}
            isSending={isSending}
            forceReset={true}
            initialPrompt={initialPrompt}
            onPromptClear={() => setInitialPrompt(undefined)}
            draftStorageKey="chat_draft_new"
          />
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
