"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { notFound, useParams } from "next/navigation";
import { chatService, modelService, messageService, assistantService, folderService } from "@/lib/services";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { ProjectBanner } from "@/components/chat/project-banner";
import { VideoGenerateDialog, type VideoGenerateParams } from "@/components/chat/video-generate-dialog";
import { videoService } from "@/lib/services";
import type { GeneratedVideo } from "@/components/chat/video-card";
import { toast } from "@/lib/toast";
import { createSmoothRevealer } from "@/lib/smoothReveal";
import * as LucideIcons from "lucide-react";
import { Bot, Sparkles, MessageSquare } from "lucide-react";

const SUGGESTED_PROMPTS = [
  { text: "Brainstorm ideas for...", value: "Brainstorm ideas for ", icon: Sparkles, className: "w-3.5 h-3.5 inline mr-2" },
  { text: "Help me write a...", value: "Help me write a ", icon: MessageSquare, className: "w-3.5 h-3.5 inline mr-2" },
  { text: "Explain how...", value: "Explain how ", icon: MessageSquare, className: "w-3.5 h-3.5 inline mr-2 inline-block transform scale-x-[-1]" },
];

interface Model {
  id: number;
  name: string;
  description: string | null;
  externalId?: string;
  isDefault?: boolean;
  defaultForCapabilities?: string[];
  isFreeModel?: boolean;
}

const DEFAULT_FREE_MODEL_NAME = "Nemotron 3 Nano Omni (Free)";

function findDefaultFreeModel(models: Model[]): Model | undefined {
  return (
    models.find((m) => m.isFreeModel && m.name === DEFAULT_FREE_MODEL_NAME) ||
    models.find((m) => m.isFreeModel)
  );
}

interface Message {
  id: number;
  role: string;
  content: string;
  createdAt: string;
  editedFromId?: number | null;
  attachments?: any[];
  modelResponses?: any[];
  chatType?: string;
}

export default function ChatPage() {
  const params = useParams();
  const chatId = Number(params.id);
  const [shouldForceScrollFromStarred, setShouldForceScrollFromStarred] = useState(false);

  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = sessionStorage.getItem(`pending_chat_${chatId}`);
      if (!raw) return [];
      const { content, attachmentObjects } = JSON.parse(raw);
      return [{
        id: -1,
        role: "USER",
        content,
        createdAt: new Date().toISOString(),
        attachments: attachmentObjects || [],
      }];
    } catch {
      return [];
    }
  });
  const [models, setModels] = useState<Model[]>([]);
  const modelsRef = useRef<Model[]>([]);
  const [selectedModels, setSelectedModels] = useState<number[]>([]);
  const selectedModelsRef = useRef<number[]>([]);
  const [activeModelTabs, setActiveModelTabs] = useState<Record<number, number>>({});
  const [isSending, setIsSending] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [editVersionIndices, setEditVersionIndices] = useState<Record<number, number>>({});
  const [isNotFound, setIsNotFound] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState("");
  const [assistant, setAssistant] = useState<{ id: number; name: string; description?: string | null; icon: string } | null>(null);
  const [folder, setFolder] = useState<{ name: string; description?: string | null } | null>(null);
  const folderIdRef = useRef<number | null>(null);
  const firstMessageSent = useRef(false);
  const isStreamingRef = useRef(false);
  const fetchChatInFlightRef = useRef<Promise<void> | null>(null);
  const lastFetchChatAtRef = useRef(0);
  const modelsRestoredRef = useRef(false);
  const streamAbortControllersRef = useRef<AbortController[]>([]);
  const stopRequestedRef = useRef(false);
  const [chatCapability, setChatCapability] = useState<any>("STANDARD");
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videos, setVideos] = useState<GeneratedVideo[]>([]);

  useEffect(() => {
    let cancelled = false;
    videoService
      .list({ chatId: String(chatId) })
      .then((res) => {
        if (!cancelled && res.data?.data?.items) setVideos(res.data.data.items);
      })
      .catch(() => {
        /* no videos yet, or a transient failure — either way, start empty */
      });
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  const handleGenerateVideo = useCallback(
    async (params: VideoGenerateParams) => {
      const res = await videoService.create({ ...params, chatId });
      if (res.data?.data) setVideos((prev) => [...prev, res.data.data]);
    },
    [chatId],
  );

  const handleVideoDeleted = useCallback((id: number) => {
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }, []);
  const [maxModels, setMaxModels] = useState<number>(1); // 1 = single mode (default)

  useEffect(() => {
    selectedModelsRef.current = selectedModels;
  }, [selectedModels]);

  // Single / Multiple mode toggle listener
  useEffect(() => {
    const handleModeChange = (e: Event) => {
      const mode = (e as CustomEvent).detail?.mode;
      if (mode === "single") setMaxModels(1);
      else if (mode === "multiple") setMaxModels(-1);
    };
    window.addEventListener("ai-colab:mode-change", handleModeChange);
    return () => window.removeEventListener("ai-colab:mode-change", handleModeChange);
  }, []);

  const clearStreamAbortControllers = useCallback(() => {
    streamAbortControllersRef.current = [];
  }, []);

  const createStreamAbortController = useCallback(() => {
    const controller = new AbortController();
    streamAbortControllersRef.current.push(controller);
    if (stopRequestedRef.current) {
      controller.abort();
    }
    return controller;
  }, []);

  const isAbortError = (error: any) =>
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR" ||
    String(error?.message || "").toLowerCase().includes("aborted");

  const stopStreaming = useCallback(() => {
    stopRequestedRef.current = true;
    streamAbortControllersRef.current.forEach((controller) => controller.abort());
    toast.info("Generation stopped");
  }, []);

  const fetchChat = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastFetchChatAtRef.current < 1200) {
      return;
    }
    if (!force && fetchChatInFlightRef.current) {
      await fetchChatInFlightRef.current;
      return;
    }

    const run = async () => {
    try {
      const res = await chatService.getById(chatId);
      const chat = res.data.data;

      if (chat.assistantId) {
        try {
          const aRes = await assistantService.getById(chat.assistantId);
          setAssistant(aRes.data.data);
        } catch { /* ignore */ }
      } else {
        setAssistant(null);
      }

      if (chat.folderId) {
        if (folderIdRef.current !== chat.folderId) {
          folderIdRef.current = chat.folderId;
          try {
            const fRes = await folderService.getById(chat.folderId);
            setFolder(fRes.data.data);
          } catch {
            setFolder(null);
          }
        }
      } else if (folderIdRef.current !== null) {
        folderIdRef.current = null;
        setFolder(null);
      }

      setMessages((prev) => {
        if (isStreamingRef.current) return prev;
        const incoming = chat.messages || [];
        if (incoming.length === 0) return prev;
        const cleanPrev = prev.filter(m => m.id !== -1);
        if (cleanPrev.length === 0) return incoming;

        return incoming.map((bm: Message) => {
          const existing = cleanPrev.find((pm) => pm.id === bm.id);
          if (existing) {
            return { ...existing, ...bm };
          }
          return bm;
        });
      });

      const tabs: Record<number, number> = {};
      (chat.messages || []).forEach((msg: Message) => {
        if (msg.modelResponses && msg.modelResponses.length > 0) {
          tabs[msg.id] = msg.modelResponses[0].model.id;
        }
      });
      
      setActiveModelTabs((prev) => {
        if (isStreamingRef.current) return prev;
        // Check if deep equal to avoid re-renders
        const changed = Object.keys(tabs).some(k => tabs[Number(k)] !== prev[Number(k)]);
        if (!changed && Object.keys(tabs).length === Object.keys(prev).length) return prev;
        return tabs;
      });

      if (!isStreamingRef.current) {
        modelsRestoredRef.current = true; // Mark as restored as soon as we have the chat object
        if (chat.modelIds && chat.modelIds.length > 0) {
          setSelectedModels(chat.modelIds);
        }
        if (chat.capability) {
           localStorage.setItem("preferredChatType", chat.capability);
           setChatCapability(chat.capability);
        }
      }
    } catch (error: any) {
      if (error?.response?.status === 404) {
        setIsNotFound(true);
      }
    }
    };

    lastFetchChatAtRef.current = now;
    const p = run().finally(() => {
      if (fetchChatInFlightRef.current === p) {
        fetchChatInFlightRef.current = null;
      }
    });
    fetchChatInFlightRef.current = p;
    await p;
  }, [chatId]);

  const syncChatAfterStop = useCallback(() => {
    window.setTimeout(() => {
      fetchChat(true);
    }, 500);
  }, [fetchChat]);

  const fetchModels = useCallback(async () => {
    try {
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
      modelsRef.current = activeModels;
      
      // Only apply default model logic if:
      // 1. Models haven't been restored from DB yet (for new chats)
      // 2. OR we have no selections yet AND we are sure we are not waiting for fetchChat
      if (activeModels.length > 0 && selectedModelsRef.current.length === 0 && !modelsRestoredRef.current) {
        const storedModelId = localStorage.getItem("preferredModelId");
        const parsedId = storedModelId ? Number(storedModelId) : null;
        
        let resolvedModelIds: number[];
        if (parsedId && activeModels.find((m: any) => m.id === parsedId)) {
          resolvedModelIds = [parsedId];
        } else {
          const defaultModels = activeModels.filter((m: any) => m.defaultForCapabilities?.includes("STANDARD"));
          resolvedModelIds = defaultModels.length > 0
            ? defaultModels.map((m: any) => m.id)
            : [activeModels[0].id];
        }
        setSelectedModels(resolvedModelIds);

        if (!firstMessageSent.current) {
          const raw = sessionStorage.getItem(`pending_chat_${chatId}`);
          if (raw) {
            firstMessageSent.current = true;
            sessionStorage.removeItem(`pending_chat_${chatId}`);
            try {
              const { content, modelIds, chatType, attachmentIds, attachmentObjects } = JSON.parse(raw);
              const targetIds = Array.isArray(modelIds) && modelIds.length > 0 ? modelIds : resolvedModelIds;
              setSelectedModels(targetIds);
              void (async () => {
                const pendingCtx = localStorage.getItem("pending_new_chat_context_ids");
                if (pendingCtx) {
                  try {
                    const parsed = JSON.parse(pendingCtx);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                      const contextIds = parsed
                        .map((id: unknown) => Number(id))
                        .filter((id: number) => !Number.isNaN(id));
                      if (contextIds.length > 0) {
                        try {
                          await chatService.replaceContexts(chatId, contextIds);
                          localStorage.removeItem("pending_new_chat_context_ids");
                        } catch {
                          /* still send; stream may apply default contexts */
                        }
                      }
                    }
                  } catch {
                    /* ignore malformed localStorage */
                  }
                }
                sendMessage(content, attachmentIds, targetIds, chatType, attachmentObjects);
              })();
            } catch { /* ignore */ }
          }
        }
      }
    } catch { /* ignore */ }
  }, [chatId]);

  const handleModelChange = async (ids: number[]) => {
    setSelectedModels(ids);
    const currentCapability = localStorage.getItem("preferredChatType") || "STANDARD";
    try {
      await chatService.update(chatId, { modelIds: ids, capability: currentCapability });
    } catch { /* ignore */ }
    
    if (ids.length > 0) {
      localStorage.setItem("preferredModelId", String(ids[0]));
    }
  };

  const handleCapabilityChange = async (type: string) => {
    setChatCapability(type);
    try {
      await chatService.update(chatId, { capability: type });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const openedFromStarredChatId = sessionStorage.getItem("open_chat_from_starred");
    if (openedFromStarredChatId === String(chatId)) {
      setShouldForceScrollFromStarred(true);
      sessionStorage.removeItem("open_chat_from_starred");
    } else {
      setShouldForceScrollFromStarred(false);
    }
  }, [chatId]);

  useEffect(() => {
    fetchModels();
    fetchChat(true);
  }, [fetchModels, fetchChat]);

  useEffect(() => {
    const handleRefreshModels = () => fetchModels();
    window.addEventListener("refresh-models", handleRefreshModels);
    return () => window.removeEventListener("refresh-models", handleRefreshModels);
  }, [fetchModels]);

  useEffect(() => {
    if (!shouldForceScrollFromStarred) return;
    let attempt = 0;
    const maxAttempts = 8;
    const scrollToBottom = () => {
      const container = document.getElementById("chat-scroll-container");
      const anchor = document.getElementById("chat-bottom-anchor");
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
      anchor?.scrollIntoView({ behavior: "auto", block: "end" });
      if (attempt < maxAttempts) {
        attempt += 1;
        setTimeout(scrollToBottom, 80);
      }
    };
    scrollToBottom();
  }, [shouldForceScrollFromStarred, messages.length]);

  const FAILED_GENERATION_COPY = "Failed to generate a response. Please try again.";

  const streamSingleModel = (
    mid: number,
    streamingMsgId: number,
    token: string,
    apiUrl: string,
    content: string,
    chatType: string | undefined,
    userMessageId: number,
    assistantMessageId: number,
    attachmentIds?: number[],
    signal?: AbortSignal,
    tempUserMsgId?: number,
    replaceModelId?: number,
  ) => {
    return fetch(`${apiUrl}/chats/${chatId}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        content,
        modelId: mid,
        chatType,
        userMessageId,
        assistantMessageId,
        ...(attachmentIds && attachmentIds.length > 0 ? { attachmentIds } : {}),
        ...(replaceModelId ? { replaceModelId } : {}),
      }),
      signal,
    }).then(async (response) => {
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const err: any = new Error(errData.message || "Failed to send message");
        err.code = errData.code;
        throw err;
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      let currentMsgId = streamingMsgId;
      let lastDonePayload: any = null;
      let streamEndedWithError = false;
      const revealer = createSmoothRevealer({
        disabled: chatType === "IMAGE_GENERATION",
        onUpdate: (text) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === currentMsgId
                ? {
                    ...msg,
                    modelResponses: msg.modelResponses?.map((mr: any) =>
                      mr.model.id === mid
                        ? { ...mr, content: text, status: "STREAMING" }
                        : mr
                    ),
                  }
                : msg
            )
          );
        },
      });
      try {
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const chunkStr of lines) {
            const line = chunkStr.trim();
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "message_id") {
                const { userMessageId: uId, assistantMessageId: aId } = parsed;
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (tempUserMsgId && msg.id === tempUserMsgId) return { ...msg, id: uId };
                    if (msg.id === currentMsgId) return { ...msg, id: aId };
                    return msg;
                  })
                );
                setActiveModelTabs((prev) => {
                  const next = { ...prev };
                  if (next[currentMsgId]) {
                    next[aId] = next[currentMsgId];
                    delete next[currentMsgId];
                  }
                  return next;
                });
                currentMsgId = aId;
              } else if (parsed.type === "token") {
                accumulated += parsed.content;
                revealer.push(accumulated);
              } else if (parsed.type === "error") {
                streamEndedWithError = true;
                revealer.stop();
                const errorMessage = parsed.message || FAILED_GENERATION_COPY;
                const insufficientBalance = parsed.code === "INSUFFICIENT_BALANCE";
                const planRestricted = parsed.code === "PLAN_RESTRICTED";
                accumulated = errorMessage;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === currentMsgId
                      ? {
                          ...msg,
                          modelResponses: msg.modelResponses?.map((mr: any) =>
                            mr.model.id === mid
                              ? { ...mr, content: errorMessage, status: "FAILED", insufficientBalance, planRestricted }
                              : mr
                          ),
                        }
                      : msg
                  )
                );
                toast.error(
                  `${modelsRef.current.find((m) => m.id === mid)?.name || "Model"}: ${errorMessage}`,
                );
              } else if (parsed.type === "document_started") {
                // Generation outlives this SSE connection, so we only attach a
                // PENDING placeholder here — DocumentCard polls it to completion
                // on its own, leaving the user free to keep chatting.
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === currentMsgId
                      ? {
                          ...msg,
                          modelResponses: msg.modelResponses?.map((mr: any) =>
                            mr.model.id === mid
                              ? {
                                  ...mr,
                                  generatedDocuments: [
                                    ...(mr.generatedDocuments || []).filter(
                                      (d: any) => d.id !== parsed.documentId,
                                    ),
                                    {
                                      id: parsed.documentId,
                                      status: "PENDING",
                                      format: parsed.format || "PDF",
                                      title: parsed.title || "Document",
                                    },
                                  ],
                                }
                              : mr,
                          ),
                        }
                      : msg,
                  ),
                );
              } else if (parsed.type === "done") {
                // Capture final usage/meta; actual state update happens after stream ends.
                lastDonePayload = parsed;
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      if (streamEndedWithError) {
        return;
      }

      // Let the smooth reveal catch up to the fully received text before
      // finalizing status, so the tail of the response doesn't jump-cut in.
      await revealer.finish();

      // After the stream ends, decide how to finalize based on accumulated content.
      const trimmed = accumulated.trim();
      const modelName = modelsRef.current.find((m) => m.id === mid)?.name || "Model";

      if (!trimmed) {
        const failureMessage = FAILED_GENERATION_COPY;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentMsgId
              ? {
                  ...msg,
                  modelResponses: msg.modelResponses?.map((mr: any) =>
                    mr.model.id === mid
                      ? {
                          ...mr,
                          content: failureMessage,
                          status: "FAILED",
                        }
                      : mr
                  ),
                }
              : msg
          )
        );
        toast.error(`${modelName}: ${failureMessage}`);
        return;
      }

      // Normal successful completion path.
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === currentMsgId
            ? {
                ...msg,
                modelResponses: msg.modelResponses?.map((mr: any) =>
                  mr.model.id === mid
                    ? { 
                        ...mr, 
                        id: (mr.id && typeof mr.id === "number" ? mr.id : lastDonePayload?.modelResponseId) || mr.id,
                        content: accumulated, 
                        status: "COMPLETED", 
                      }
                    : mr
                ),
              }
            : msg
        )
      );
      } finally {
        revealer.stop();
      }
    });
  };

  // Regenerates a failed assistant response, optionally switching to a
  // different model (e.g. the free fallback). `oldModelId` is unpersisted
  // (see below) when the original attempt failed before the turn's
  // messages were ever created server-side (the pre-stream balance check),
  // in which case we must resend as a brand-new turn rather than retry
  // in place against ids the backend has never heard of.
  const regenerateWithModel = async (assistantMessageId: number, oldModelId: number, newModelId: number) => {
    if (isSending) return;
    const idx = messages.findIndex((m) => m.id === assistantMessageId);
    if (idx <= 0) return;
    const userMsg = messages[idx - 1];
    if (userMsg.role !== "USER") return;
    const assistantRow = messages[idx];
    const failedResp = assistantRow.modelResponses?.find((mr: any) => mr.model.id === oldModelId);
    const isUnpersisted = Boolean((failedResp as any)?.unpersisted);

    stopRequestedRef.current = false;
    clearStreamAbortControllers();
    setIsSending(true);
    setIsStreaming(true);
    isStreamingRef.current = true;

    const newModelMeta = modelsRef.current.find((m) => m.id === newModelId);

    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === assistantMessageId
          ? {
              ...msg,
              modelResponses: msg.modelResponses?.map((mr: any) =>
                mr.model.id === oldModelId
                  ? {
                      ...mr,
                      model: newModelMeta ? { id: newModelMeta.id, name: newModelMeta.name } : mr.model,
                      content: "",
                      status: "STREAMING",
                      tokensUsed: null,
                      insufficientBalance: false,
                      planRestricted: false,
                      unpersisted: false,
                    }
                  : mr
              ),
            }
          : msg
      )
    );

    const token = localStorage.getItem("token") || "";
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    const chatType =
      assistantRow?.chatType ||
      (typeof window !== "undefined"
        ? localStorage.getItem("preferredChatType") || undefined
        : undefined);
    const attachmentIds =
      userMsg.attachments
        ?.map((a: any) => a.id)
        .filter((id: unknown) => typeof id === "number" && !Number.isNaN(id)) || undefined;

    try {
      const controller = createStreamAbortController();
      if (isUnpersisted) {
        // Nothing was ever saved for this turn — resend fresh, reusing the
        // same local bubble ids so the UI doesn't jump.
        await streamSingleModel(
          newModelId,
          assistantMessageId,
          token,
          apiUrl,
          userMsg.content,
          chatType,
          0,
          0,
          attachmentIds,
          controller.signal,
          userMsg.id,
        );
      } else {
        await streamSingleModel(
          newModelId,
          assistantMessageId,
          token,
          apiUrl,
          userMsg.content,
          chatType,
          userMsg.id,
          assistantMessageId,
          attachmentIds,
          controller.signal,
          undefined,
          oldModelId,
        );
      }
      window.setTimeout(() => fetchChat(true), 2000);
    } catch (err: any) {
      if (isAbortError(err) || stopRequestedRef.current) {
        syncChatAfterStop();
      } else if (err.code === "INSUFFICIENT_BALANCE" || err.code === "PLAN_RESTRICTED") {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  modelResponses: msg.modelResponses?.map((mr: any) =>
                    mr.model.id === newModelId
                      ? {
                          ...mr,
                          status: "FAILED",
                          content: err.message || "Insufficient balance.",
                          insufficientBalance: err.code === "INSUFFICIENT_BALANCE",
                          planRestricted: err.code === "PLAN_RESTRICTED",
                          unpersisted: isUnpersisted,
                        }
                      : mr
                  ),
                }
              : msg
          )
        );
      } else {
        toast.error(err.message || "Retry failed");
      }
    } finally {
      clearStreamAbortControllers();
      isStreamingRef.current = false;
      setIsSending(false);
      setIsStreaming(false);
      stopRequestedRef.current = false;
    }
  };

  const retryFailedAssistant = (assistantMessageId: number, modelId: number) =>
    regenerateWithModel(assistantMessageId, modelId, modelId);

  const handleSwitchToFreeModel = (assistantMessageId: number, oldModelId: number) => {
    const freeModel = findDefaultFreeModel(modelsRef.current);
    if (!freeModel) {
      toast.error("No free model is currently available");
      return;
    }
    // Carry the switch forward: make the free model the chat's active
    // selection so the next message doesn't hit the same paid model and
    // re-trigger this same prompt.
    if (selectedModelsRef.current.length <= 1 || selectedModelsRef.current.includes(oldModelId)) {
      handleModelChange([freeModel.id]);
    }
    regenerateWithModel(assistantMessageId, oldModelId, freeModel.id);
  };

  const sendMessage = async (content: string, attachmentIds?: number[], modelIds?: number[], chatType?: string, attachmentObjects?: any[]) => {
    if (isSending) return;
    stopRequestedRef.current = false;
    clearStreamAbortControllers();
    setIsSending(true);
    setIsStreaming(true);
    isStreamingRef.current = true;
    const targetModelIds = modelIds && modelIds.length > 0 ? modelIds : [...selectedModels];
    if (targetModelIds.length === 0) {
      toast.error("Please select a model");
      setIsSending(false);
      setIsStreaming(false);
      return;
    }
    if (chatType) {
      setChatCapability(chatType);
    }
    // Do not block streaming on metadata update.
    chatService
      .update(chatId, { modelIds: targetModelIds, capability: chatType || "STANDARD" })
      .catch(() => { /* ignore */ });
    const tempUserMsgId = Date.now();
    setMessages((prev) => [...prev.filter(m => m.id !== -1), {
      id: tempUserMsgId,
      role: "USER",
      content,
      createdAt: new Date().toISOString(),
      attachments: attachmentObjects || [],
    }]);
    const streamingMsgId = Date.now() + 1;
    setMessages((prev) => [...prev, {
      id: streamingMsgId,
      role: "ASSISTANT",
      content: "",
      createdAt: new Date().toISOString(),
      chatType,
      modelResponses: targetModelIds.map((mid) => ({
        id: mid,
        model: { id: mid, name: modelsRef.current.find((m) => m.id === mid)?.name || "AI" },
        content: "",
        status: "STREAMING",
        tokensUsed: null,
      })),
    }]);
    setActiveModelTabs((prev) => ({ ...prev, [streamingMsgId]: targetModelIds[0] }));
    const token = localStorage.getItem("token") || "";
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    try {
      if (targetModelIds.length === 1) {
        const controller = createStreamAbortController();
        await streamSingleModel(targetModelIds[0], streamingMsgId, token, apiUrl, content, chatType, 0, 0, attachmentIds, controller.signal, tempUserMsgId);
      } else {
        const prepRes = await fetch(`${apiUrl}/chats/${chatId}/prepare-multi`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ content, attachmentIds }),
        });
        if (!prepRes.ok) {
          const errData = await prepRes.json().catch(() => ({}));
          throw new Error(errData.message || "Failed to prepare messages");
        }
        const prepData = await prepRes.json();
        const { userMessageId, assistantMessageId } = prepData.data;
        
        // Update local state with real IDs immediately
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === tempUserMsgId) return { ...msg, id: userMessageId };
            if (msg.id === streamingMsgId) return { ...msg, id: assistantMessageId };
            return msg;
          })
        );
        setActiveModelTabs((prev) => {
          const next = { ...prev };
          if (next[streamingMsgId]) {
            next[assistantMessageId] = next[streamingMsgId];
            delete next[streamingMsgId];
          }
          return next;
        });

        const responses = await Promise.allSettled(
          targetModelIds.map((mid) =>
            streamSingleModel(mid, assistantMessageId, token, apiUrl, content, chatType, userMessageId, assistantMessageId, attachmentIds, createStreamAbortController().signal)
          )
        );
        responses.forEach((result, idx) => {
          if (result.status !== "rejected") return;
          const mid = targetModelIds[idx];
          if (isAbortError(result.reason) || stopRequestedRef.current) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === streamingMsgId
                  ? {
                      ...msg,
                      modelResponses: msg.modelResponses?.map((mr: any) =>
                        mr.model.id === mid ? { ...mr, status: "FAILED", content: mr.content || "Generation stopped by user.", finishReason: "user_aborted" } : mr
                      ),
                    }
                  : msg
              )
            );
            return;
          }
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === streamingMsgId
                ? {
                    ...msg,
                    modelResponses: msg.modelResponses?.map((mr: any) =>
                      mr.model.id === mid
                        ? {
                            ...mr,
                            status: "FAILED",
                            content: result.reason?.message || "Failed",
                            insufficientBalance: result.reason?.code === "INSUFFICIENT_BALANCE",
                            planRestricted: result.reason?.code === "PLAN_RESTRICTED",
                          }
                        : mr
                    ),
                  }
                : msg
            )
          );
          toast.error(`${modelsRef.current.find((m) => m.id === mid)?.name || "Model"}: ${result.reason?.message || "Failed"}`);
        });
      }
      isStreamingRef.current = false;
      // Defer full chat sync so send/stream path stays responsive.
      window.setTimeout(() => {
        fetchChat(true);
      }, 2000);
      window.dispatchEvent(
        new CustomEvent("refresh-chats", {
          detail: { immediate: false, refreshFolders: false },
        }),
      );
    } catch (err: any) {
      if (isAbortError(err) || stopRequestedRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMsgId
              ? {
                  ...msg,
                  modelResponses: msg.modelResponses?.map((mr: any) =>
                    mr.status === "STREAMING" ? { ...mr, status: "FAILED", content: mr.content || "Generation stopped by user.", finishReason: "user_aborted" } : mr
                  ),
                }
              : msg
          )
        );
        isStreamingRef.current = false;
        syncChatAfterStop();
      } else if (err.code === "INSUFFICIENT_BALANCE" || err.code === "PLAN_RESTRICTED") {
        // Nothing was persisted server-side yet (the balance check runs
        // before the turn's messages are created) — keep the local bubble
        // so the user can still choose to switch to a free model or upgrade.
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === streamingMsgId
              ? {
                  ...msg,
                  modelResponses: msg.modelResponses?.map((mr: any) => ({
                    ...mr,
                    status: "FAILED",
                    content: err.message || "Insufficient balance.",
                    insufficientBalance: err.code === "INSUFFICIENT_BALANCE",
                    planRestricted: err.code === "PLAN_RESTRICTED",
                    unpersisted: true,
                  })),
                }
              : msg
          )
        );
      } else {
        toast.error(err.message || "Failed to send message");
        setMessages((prev) => prev.filter((m) => m.id !== tempUserMsgId && m.id !== streamingMsgId));
      }
    } finally {
      clearStreamAbortControllers();
      isStreamingRef.current = false;
      setIsSending(false);
      setIsStreaming(false);
      stopRequestedRef.current = false;
    }
  };

  const handleRegenerate = async (messageId: number, modelId: number) => {
    if (isSending) return;
    stopRequestedRef.current = false;
    clearStreamAbortControllers();
    setIsSending(true);
    setIsStreaming(true);
    isStreamingRef.current = true;
    const targetMsg = messages.find(m => m.id === messageId);
    if (!targetMsg || targetMsg.role !== "ASSISTANT") {
      toast.error("Can only regenerate assistant messages");
      setIsSending(false);
      setIsStreaming(false);
      return;
    }
    const streamingRespId = Date.now();
    setMessages((prev) => prev.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          chatType: msg.chatType || localStorage.getItem("preferredChatType") || "STANDARD",
          modelResponses: [
            ...(msg.modelResponses || []),
            {
              id: streamingRespId,
              model: { id: modelId, name: modelsRef.current.find((m) => m.id === modelId)?.name || "AI" },
              content: "",
              status: "STREAMING",
              tokensUsed: null,
            }
          ]
        };
      }
      return msg;
    }));
    setActiveModelTabs((prev) => ({ ...prev, [messageId]: modelId }));
    let revealer: ReturnType<typeof createSmoothRevealer> | null = null;
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
      const controller = createStreamAbortController();
      const response = await fetch(`${apiUrl}/chats/${chatId}/messages/${messageId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ modelId, chatType: localStorage.getItem("preferredChatType") || "STANDARD" }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const err: any = new Error(errData.message || "Failed to regenerate message");
        err.code = errData.code;
        throw err;
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      revealer = createSmoothRevealer({
        disabled: localStorage.getItem("preferredChatType") === "IMAGE_GENERATION",
        onUpdate: (text) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId
                ? {
                    ...msg,
                    modelResponses: msg.modelResponses?.map((mr: any) =>
                      mr.id === streamingRespId ? { ...mr, content: text, status: "STREAMING" } : mr
                    ),
                  }
                : msg
            )
          );
        },
      });
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const chunkStr of lines) {
            const line = chunkStr.trim();
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "message_id") {
                // In regeneration, IDs should already be stable, but we sync just in case
                const { userMessageId: uId, assistantMessageId: aId } = parsed;
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id === messageId) return { ...msg, id: aId };
                    return msg;
                  })
                );
                setActiveModelTabs((prev) => {
                  const next = { ...prev };
                  if (next[messageId]) {
                    next[aId] = next[messageId];
                    if (aId !== messageId) delete next[messageId];
                  }
                  return next;
                });
              } else if (parsed.type === "token") {
                accumulated += parsed.content;
                revealer.push(accumulated);
              } else if (parsed.type === "error") {
                revealer.stop();
                const errorMessage = parsed.message || "Generation failed";
                accumulated = errorMessage;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          modelResponses: msg.modelResponses?.map((mr: any) =>
                            mr.id === streamingRespId
                              ? {
                                  ...mr,
                                  content: errorMessage,
                                  status: "FAILED",
                                  insufficientBalance: parsed.code === "INSUFFICIENT_BALANCE",
                                  planRestricted: parsed.code === "PLAN_RESTRICTED",
                                }
                              : mr
                          ),
                        }
                      : msg
                  )
                );
                toast.error(errorMessage);
              } else if (parsed.type === "done") {
                await revealer.finish();
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          modelResponses: msg.modelResponses?.map((mr: any) =>
                            mr.id === streamingRespId
                              ? {
                                  ...mr,
                                  id: parsed.modelResponseId || mr.id,
                                  content: accumulated,
                                  status: "COMPLETED",
                                  finishReason: parsed.finishReason,
                                  tokensUsed: parsed.totalTokens,
                                }
                              : mr
                          ),
                        }
                      : msg
                  )
                );
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
      isStreamingRef.current = false;
      fetchChat(); // Perform silent background sync
    } catch (err: any) {
      if (isAbortError(err) || stopRequestedRef.current) {
        setMessages((prev) => prev.map(msg => {
          if (msg.id !== messageId) return msg;
          return {
            ...msg,
            modelResponses: msg.modelResponses?.map((mr: any) =>
              mr.id === streamingRespId ? { ...mr, status: "FAILED", content: mr.content || "Generation stopped by user.", finishReason: "user_aborted" } : mr
            )
          };
        }));
        isStreamingRef.current = false;
        syncChatAfterStop();
      } else {
        toast.error(err.message || "Failed to regenerate message");
        setMessages((prev) => prev.map(msg => {
          if (msg.id === messageId) {
            return { ...msg, modelResponses: msg.modelResponses?.filter((mr: any) => mr.id !== streamingRespId) };
          }
          return msg;
        }));
      }
    } finally {
      revealer?.stop();
      clearStreamAbortControllers();
      isStreamingRef.current = false;
      setIsSending(false);
      setIsStreaming(false);
      stopRequestedRef.current = false;
    }
  };

  const handleFeedback = async (responseId: number, isLiked: boolean | null) => {
    try {
      setMessages((prev) => prev.map(msg => ({
        ...msg,
        modelResponses: msg.modelResponses?.map((mr: any) => mr.id === responseId ? { ...mr, isLiked } : mr)
      })));
      await chatService.feedback(chatId, responseId, isLiked);
    } catch {
      toast.error("Failed to submit feedback");
      fetchChat();
    }
  };

  const handleModelTabChange = (messageId: number, modelId: number) => {
    setActiveModelTabs((prev) => ({ ...prev, [messageId]: modelId }));
  };

  const handleToggleStar = async (responseId: number, isStarred: boolean) => {
    setMessages((prev) =>
      prev.map((msg) => ({
        ...msg,
        modelResponses: msg.modelResponses?.map((mr: any) => mr.id === responseId ? { ...mr, isStarred } : mr),
      }))
    );
    try {
      await messageService.starResponse(responseId, isStarred);
    } catch {
      toast.error("Failed to update starred state");
      fetchChat();
    }
  };

  const handleEnhancePrompt = async (prompt: string) => {
    const res = await messageService.enhancePrompt(prompt);
    return res.data.data;
  };

  const handleEditVersionChange = (rootMessageId: number, versionIndex: number) => {
    setEditVersionIndices((prev) => ({ ...prev, [rootMessageId]: versionIndex }));
  };

  const handleEditMessage = async (messageId: number, newContent: string) => {
    if (isSending) return;
    stopRequestedRef.current = false;
    clearStreamAbortControllers();
    setIsSending(true);
    setIsStreaming(true);
    isStreamingRef.current = true;
    const originalIdx = messages.findIndex(m => m.id === messageId);
    let pairedAssistantMsg = null;
    if (originalIdx !== -1 && originalIdx + 1 < messages.length && messages[originalIdx + 1].role === "ASSISTANT") {
      pairedAssistantMsg = messages[originalIdx + 1];
    }
    const targetModelIds = pairedAssistantMsg?.modelResponses?.map((mr: any) => mr.model.id) || [...selectedModels];
    if (targetModelIds.length === 0) {
      toast.error("No models found to edit with.");
      setIsSending(false);
      setIsStreaming(false);
      return;
    }
    const token = localStorage.getItem("token") || "";
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
    const chatType = localStorage.getItem("preferredChatType") || "STANDARD";
    const originalMsg = messages[originalIdx];
    const rootId = originalMsg?.editedFromId || messageId;
    const tempUserMsgId = Date.now();
    const tempAssistantMsgId = Date.now() + 1;
    setEditVersionIndices((prev) => ({ ...prev, [rootId]: 999 }));
    setMessages((prev) => {
      const keptMessages = prev.filter((m, idx) => {
        if (idx <= originalIdx) return true;
        if (m.role === "USER" && (m.editedFromId === rootId || m.id === rootId)) return true;
        if (m.role === "ASSISTANT") {
          const prevUserIdx = prev.findIndex((pm, pi) => pi < idx && pm.role === "USER" && (pm.editedFromId === rootId || pm.id === rootId) && pi > originalIdx);
          if (prevUserIdx !== -1) return true;
        }
        return false;
      });
      return [
        ...keptMessages,
        { id: tempUserMsgId, role: "USER", content: newContent, createdAt: new Date().toISOString(), editedFromId: rootId },
        {
          id: tempAssistantMsgId, role: "ASSISTANT", content: "", createdAt: new Date().toISOString(), chatType,
          modelResponses: targetModelIds.map((mid) => ({
            id: mid, model: { id: mid, name: models.find((m) => m.id === mid)?.name || "AI" }, content: "", status: "STREAMING", tokensUsed: null,
          })),
        },
      ];
    });
    try {
      const prepRes = await fetch(`${apiUrl}/chats/${chatId}/messages/${messageId}/edit-prepare-multi`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: newContent }),
      });
      if (!prepRes.ok) {
        const errData = await prepRes.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to prepare edit");
      }
      const prepData = await prepRes.json();
      const userMsgId = prepData.data.userMessageId;
      const assistantMsgId = prepData.data.assistantMessageId;
      setMessages((prev) => prev.map(msg => {
        if (msg.id === tempUserMsgId) return { ...msg, id: userMsgId };
        if (msg.id === tempAssistantMsgId) return { ...msg, id: assistantMsgId };
        return msg;
      }));
      const responses = await Promise.allSettled(
        targetModelIds.map((mid) =>
          streamSingleModel(mid, assistantMsgId, token, apiUrl, newContent, chatType, userMsgId, assistantMsgId, undefined, createStreamAbortController().signal, tempUserMsgId)
        )
      );
      responses.forEach((res, idx) => {
        if (res.status === "rejected") {
          const mid = targetModelIds[idx];
          if (isAbortError(res.reason) || stopRequestedRef.current) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? {
                      ...msg,
                      modelResponses: msg.modelResponses?.map((mr: any) =>
                        mr.model.id === mid ? { ...mr, content: mr.content || "Generation stopped by user.", status: "FAILED", finishReason: "user_aborted" } : mr
                      ),
                    }
                  : msg
              )
            );
            return;
          }
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    modelResponses: msg.modelResponses?.map((mr: any) =>
                      mr.model.id === mid
                        ? {
                            ...mr,
                            content: res.reason.message || "Failed",
                            status: "FAILED",
                            insufficientBalance: res.reason?.code === "INSUFFICIENT_BALANCE",
                            planRestricted: res.reason?.code === "PLAN_RESTRICTED",
                          }
                        : mr
                    ),
                  }
                : msg
            )
          );
          toast.error(`${models.find(m => m.id === mid)?.name || "Model"}: ${res.reason.message}`);
        }
      });
      isStreamingRef.current = false;
      fetchChat(); // Perform silent background sync
    } catch (err: any) {
      if (isAbortError(err) || stopRequestedRef.current) {
        isStreamingRef.current = false;
        syncChatAfterStop();
      } else {
        toast.error(err.message || "Failed to edit message");
      }
    } finally {
      clearStreamAbortControllers();
      isStreamingRef.current = false;
      setIsSending(false);
      setIsStreaming(false);
      stopRequestedRef.current = false;
    }
  };

  const handleContinueGeneration = async (messageId: number, modelId: number) => {
    if (isSending) return;
    stopRequestedRef.current = false;
    clearStreamAbortControllers();
    setIsSending(true);
    setIsStreaming(true);
    isStreamingRef.current = true;
    const targetMsg = messages.find(m => m.id === messageId);
    if (!targetMsg || targetMsg.role !== "ASSISTANT") {
      toast.error("Can only continue assistant messages");
      setIsSending(false);
      setIsStreaming(false);
      return;
    }
    const mr = targetMsg.modelResponses?.find((r: any) => r.model.id === modelId);
    const existingContent = mr?.content || "";
    setMessages((prev) => prev.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          modelResponses: msg.modelResponses?.map((r: any) => r.model.id === modelId ? { ...r, status: "STREAMING" } : r)
        };
      }
      return msg;
    }));
    setActiveModelTabs((prev) => ({ ...prev, [messageId]: modelId }));
    let revealer: ReturnType<typeof createSmoothRevealer> | null = null;
    try {
      const token = localStorage.getItem("token");
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
      const controller = createStreamAbortController();
      const response = await fetch(`${apiUrl}/chats/${chatId}/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "text/event-stream", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messageId, modelId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const err: any = new Error(errData.message || "Failed to continue message");
        err.code = errData.code;
        throw err;
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      revealer = createSmoothRevealer({
        initialShown: existingContent,
        disabled: localStorage.getItem("preferredChatType") === "IMAGE_GENERATION",
        onUpdate: (text) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === messageId
                ? {
                    ...msg,
                    modelResponses: msg.modelResponses?.map((r: any) =>
                      r.model.id === modelId ? { ...r, content: text, status: "STREAMING" } : r
                    ),
                  }
                : msg
            )
          );
        },
      });
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";
          for (const chunkStr of lines) {
            const line = chunkStr.trim();
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "message_id") {
                const { userMessageId: uId, assistantMessageId: aId } = parsed;
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (msg.id === messageId) return { ...msg, id: aId };
                    return msg;
                  })
                );
                setActiveModelTabs((prev) => {
                  const next = { ...prev };
                  if (next[messageId]) {
                    next[aId] = next[messageId];
                    if (aId !== messageId) delete next[messageId];
                  }
                  return next;
                });
              } else if (parsed.type === "token") {
                accumulated += parsed.content;
                revealer.push(existingContent + accumulated);
              } else if (parsed.type === "error") {
                revealer.stop();
                const errorMessage = parsed.message || "Generation failed";
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          modelResponses: msg.modelResponses?.map((r: any) =>
                            r.model.id === modelId
                              ? {
                                  ...r,
                                  content: existingContent + accumulated,
                                  status: "FAILED",
                                  insufficientBalance: parsed.code === "INSUFFICIENT_BALANCE",
                                  planRestricted: parsed.code === "PLAN_RESTRICTED",
                                }
                              : r
                          ),
                        }
                      : msg
                  )
                );
                toast.error(errorMessage);
              } else if (parsed.type === "done") {
                await revealer.finish();
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === messageId
                      ? {
                          ...msg,
                          modelResponses: msg.modelResponses?.map((r: any) =>
                            r.model.id === modelId
                              ? {
                                  ...r,
                                  content: existingContent + accumulated,
                                  status: "COMPLETED",
                                  finishReason: parsed.finishReason,
                                  tokensUsed: (r.tokensUsed || 0) + (parsed.completionTokens || 0),
                                }
                              : r
                          ),
                        }
                      : msg
                  )
                );
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }
      isStreamingRef.current = false;
      fetchChat(); // Perform silent background sync
    } catch (err: any) {
      if (isAbortError(err) || stopRequestedRef.current) {
        setMessages((prev) => prev.map(msg => {
          if (msg.id !== messageId) return msg;
          return { ...msg, modelResponses: msg.modelResponses?.map((r: any) => r.model.id === modelId ? { ...r, status: "FAILED", finishReason: "user_aborted" } : r) };
        }));
        isStreamingRef.current = false;
        syncChatAfterStop();
      } else {
        toast.error(err.message || "Failed to continue message");
        const insufficientBalance = err.code === "INSUFFICIENT_BALANCE";
        const planRestricted = err.code === "PLAN_RESTRICTED";
        setMessages((prev) => prev.map(msg => {
          if (msg.id === messageId) {
             return {
               ...msg,
               modelResponses: msg.modelResponses?.map((r: any) =>
                 r.model.id === modelId
                   ? { ...r, status: "FAILED", content: (insufficientBalance || planRestricted) ? err.message : r.content, insufficientBalance, planRestricted }
                   : r
               ),
             };
          }
          return msg;
        }));
      }
    } finally {
      revealer?.stop();
      clearStreamAbortControllers();
      isStreamingRef.current = false;
      setIsSending(false);
      setIsStreaming(false);
      stopRequestedRef.current = false;
    }
  };

  if (isNotFound) {
    notFound();
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      {folder && <ProjectBanner name={folder.name} />}
      <MessageList
        messages={messages}
        activeModelTabs={activeModelTabs}
        onModelTabChange={handleModelTabChange}
        onRegenerate={handleRegenerate}
        onFeedback={handleFeedback}
        onEditMessage={handleEditMessage}
        editVersionIndices={editVersionIndices}
        onEditVersionChange={handleEditVersionChange}
        onFollowUpClick={setInitialPrompt}
        onToggleStar={handleToggleStar}
        onContinue={handleContinueGeneration}
        onRetryAssistantResponse={retryFailedAssistant}
        onSwitchToFreeModel={handleSwitchToFreeModel}
        bottomAnchorId="chat-bottom-anchor"
        forceScrollToBottom={shouldForceScrollFromStarred}
        scrollContainerId="chat-scroll-container"
        videos={videos}
        onVideoDeleted={handleVideoDeleted}
      />
      <VideoGenerateDialog
        open={videoDialogOpen}
        onOpenChange={setVideoDialogOpen}
        onSubmit={handleGenerateVideo}
      />
      <ChatInput
        models={models}
        selectedModels={selectedModels}
        onModelChange={handleModelChange}
        maxModels={maxModels}
        onSend={(content, attachmentIds, chatType, attachmentObjects) => sendMessage(content, attachmentIds, undefined, chatType, attachmentObjects)}
        onGenerateVideoClick={() => setVideoDialogOpen(true)}
        onEnhancePrompt={handleEnhancePrompt}
        isSending={isSending}
        onStopStreaming={stopStreaming}
        initialPrompt={initialPrompt}
        onPromptClear={() => setInitialPrompt("")}
        onCapabilityChange={handleCapabilityChange}
        chatType={chatCapability}
        draftStorageKey={`chat_draft_${chatId}`}
      />
    </div>
  );
}
