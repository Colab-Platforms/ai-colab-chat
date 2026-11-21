"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { MessageBubble, type MessageTemplate } from "./message-bubble";
import { ModelAvatar } from "./model-avatar";
import { SelectionContextTooltip } from "./selection-context-tooltip";
import { VideoCard, type GeneratedVideo } from "./video-card";

interface Message {
  id: number;
  role: string;
  content: string;
  createdAt: string;
  editedFromId?: number | null;
  attachments?: any[];
  modelResponses?: any[];
  sourceChatId?: number;
  sourceChatTitle?: string | null;
}

interface MessageListProps {
  messages: Message[];
  activeModelTabs: Record<number, number>;
  onModelTabChange: (messageId: number, modelId: number) => void;
  onRegenerate?: (messageId: number, modelId: number) => void;
  onFeedback?: (responseId: number, isLiked: boolean | null) => void;
  onEditMessage?: (messageId: number, newContent: string) => void;
  editVersionIndices?: Record<number, number>;
  onEditVersionChange?: (rootMessageId: number, versionIndex: number) => void;
  onFollowUpClick?: (question: string) => void;
  showSelectionTooltip?: boolean;
  sharedView?: boolean;
  onToggleStar?: (responseId: number, isStarred: boolean) => void;
  bottomAnchorId?: string;
  forceScrollToBottom?: boolean;
  scrollContainerId?: string;
  onContinue?: (messageId: number, modelId: number) => void;
  onRetryAssistantResponse?: (assistantMessageId: number, modelId: number) => void;
  onSwitchToFreeModel?: (assistantMessageId: number, modelId: number) => void;
  /**
   * Generated videos aren't tied to any Message row (video generation is a
   * standalone async job, not a chat.stream.ts turn see modules/video on
   * the backend), so they can't come through `messages`. They're merged
   * into the render list here purely by createdAt, so a video appears
   * inline exactly where it was generated in the conversation instead of
   * being segregated into a separate strip.
   */
  videos?: GeneratedVideo[];
  onVideoDeleted?: (id: number) => void;
  /** The website template this chat started from — shown on its first user message. */
  websiteTemplate?: MessageTemplate | null;
}

/**
 * Processes messages into a display list that handles edit versioning.
 * 
 * Each user message that has siblings (same editedFromId root) gets grouped.
 * Only the active version and its paired assistant response are shown.
 */
function processMessagesWithVersions(
  messages: Message[],
  editVersionIndices: Record<number, number>
) {
  // Step 1: Build version groups (rootId → ordered user messages)
  const versionGroups: Record<number, Message[]> = {};
  
  for (const msg of messages) {
    if (msg.role !== "USER") continue;
    const rootId = msg.editedFromId || msg.id;
    if (!versionGroups[rootId]) versionGroups[rootId] = [];
    versionGroups[rootId].push(msg);
  }
  
  // Sort each group by createdAt
  for (const key of Object.keys(versionGroups)) {
    versionGroups[Number(key)].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  // Step 2: Build a map of userId → next assistant message
  const userToAssistant: Record<number, Message> = {};
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "USER" && i + 1 < messages.length && messages[i + 1].role === "ASSISTANT") {
      userToAssistant[messages[i].id] = messages[i + 1];
    }
  }

  // Step 3: Build display list
  const processedRoots = new Set<number>();
  const skipIds = new Set<number>(); // IDs to skip (non-active versions + their assistants)
  const result: {
    message: Message;
    editVersions?: Message[];
    editVersionIndex?: number;
  }[] = [];

  for (const msg of messages) {
    if (skipIds.has(msg.id)) continue;

    if (msg.role === "USER") {
      const rootId = msg.editedFromId || msg.id;
      
      if (processedRoots.has(rootId)) continue;
      processedRoots.add(rootId);
      
      const versions = versionGroups[rootId] || [msg];
      const activeIdx = Math.max(0, Math.min(
        versions.length - 1,
        editVersionIndices[rootId] ?? (versions.length - 1)
      ));
      const activeVersion = versions[activeIdx];
      
      // Mark ALL assistants for this version group to be skipped later in the main loop
      // and mark non-active versions as skip
      for (const v of versions) {
        const pairedAssistant = userToAssistant[v.id];
        if (pairedAssistant) skipIds.add(pairedAssistant.id);

        if (v.id !== activeVersion.id) {
          skipIds.add(v.id);
        }
      }
      
      // Add the active user version
      result.push({
        message: activeVersion,
        editVersions: versions.length > 1 ? versions : undefined,
        editVersionIndex: versions.length > 1 ? activeIdx : undefined,
      });
      
      // Add the active version's paired assistant
      const activeAssistant = userToAssistant[activeVersion.id];
      if (activeAssistant) {
        result.push({ message: activeAssistant });
      }
    } else {
      // Standalone assistant (not paired with any versioned user)
      result.push({ message: msg });
    }
  }
  
  return result;
}

/** Discriminated render item how `messages` and `videos` merge into one timeline. */
type RenderItem =
  | { kind: "message"; createdAt: string; message: Message; editVersions?: Message[]; editVersionIndex?: number }
  | { kind: "video"; createdAt: string; video: GeneratedVideo }
  | { kind: "model-switch"; createdAt: string; model: { id: number; name: string; externalId?: string } };

/**
 * The model shown for a message, when it's a single-model (non-compare)
 * assistant reply with exactly one responding model — compare-mode replies
 * (multiple models answering the same turn) aren't a "switch", so they're
 * left out of switch detection.
 */
function singleModelOf(message: Message) {
  const responses = message.modelResponses || [];
  const modelIds = new Set(responses.map((r) => r.model?.id));
  if (modelIds.size !== 1) return null;
  return responses[0]?.model ?? null;
}

/**
 * Inserts a "Switched to <model>" marker wherever the active model changes
 * between consecutive assistant replies. The marker is placed above the user
 * message that started the turn whose reply switched models (not between
 * that user message and its reply), so it reads as "from here on, this
 * model answers" rather than as part of the reply itself.
 */
function insertModelSwitches(items: RenderItem[]): RenderItem[] {
  const result: RenderItem[] = [];
  let lastModelId: number | null = null;
  let lastUserIdx = -1;

  for (const item of items) {
    if (item.kind === "message" && item.message.role === "USER") {
      result.push(item);
      lastUserIdx = result.length - 1;
      continue;
    }

    if (item.kind === "message" && item.message.role === "ASSISTANT") {
      const model = singleModelOf(item.message);
      if (model) {
        if (lastModelId !== null && lastModelId !== model.id) {
          const marker: RenderItem = { kind: "model-switch", createdAt: item.message.createdAt, model };
          if (lastUserIdx !== -1) {
            result.splice(lastUserIdx, 0, marker);
            lastUserIdx = -1;
          } else {
            result.push(marker);
          }
        }
        lastModelId = model.id;
      }
    }

    result.push(item);
  }

  return result;
}

/**
 * Stable merge by createdAt both inputs already arrive in ascending
 * order, so this is a linear merge rather than a full sort, and ties keep
 * the message before the video (arbitrary but deterministic).
 */
function mergeWithVideos(
  processed: { message: Message; editVersions?: Message[]; editVersionIndex?: number }[],
  videos: GeneratedVideo[],
): RenderItem[] {
  const merged: RenderItem[] = [];
  let mi = 0;
  let vi = 0;

  while (mi < processed.length || vi < videos.length) {
    const nextMessage = processed[mi];
    const nextVideo = videos[vi];

    if (!nextVideo || (nextMessage && new Date(nextMessage.message.createdAt).getTime() <= new Date(nextVideo.createdAt || 0).getTime())) {
      merged.push({ kind: "message", createdAt: nextMessage.message.createdAt, ...nextMessage });
      mi++;
    } else {
      merged.push({ kind: "video", createdAt: nextVideo.createdAt || "", video: nextVideo });
      vi++;
    }
  }

  return merged;
}

export function MessageList({
  messages, activeModelTabs, onModelTabChange, onRegenerate, onFeedback,
  onEditMessage, editVersionIndices = {}, onEditVersionChange, onFollowUpClick,
  showSelectionTooltip = true, sharedView = false, onToggleStar, bottomAnchorId, forceScrollToBottom = false, scrollContainerId, onContinue, onRetryAssistantResponse,
  onSwitchToFreeModel, videos = [], onVideoDeleted, websiteTemplate
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const isStreaming = messages.some(m => m.modelResponses?.some(mr => mr.status === "STREAMING"));

  useEffect(() => {
    // Scroll to bottom when a new message is sent OR when streaming finishes
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  useEffect(() => {
    if (!forceScrollToBottom || !containerRef.current) return;
    requestAnimationFrame(() => {
      if (!containerRef.current) return;
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    });
  }, [forceScrollToBottom, messages.length]);

  const processed = processMessagesWithVersions(messages, editVersionIndices);
  const merged = insertModelSwitches(mergeWithVideos(processed, videos));
  // The template was attached to the message that started the chat.
  const firstUserIdx = merged.findIndex((e) => e.kind === "message" && e.message.role === "USER");

  return (
    <>
      {showSelectionTooltip && <SelectionContextTooltip />}
      <div id={scrollContainerId} ref={containerRef} className="flex-1 overflow-y-auto">
        <div className="py-4">
          {merged.map((entry, idx) =>
            entry.kind === "video" ? (
              <div key={`video-${entry.video.id}`} className="mx-auto mb-4 w-full max-w-3xl px-4">
                <VideoCard video={entry.video} onDeleted={onVideoDeleted} />
              </div>
            ) : entry.kind === "model-switch" ? (
              <div
                key={`model-switch-${entry.model.id}-${entry.createdAt}`}
                className="mx-auto mb-4 flex w-full max-w-3xl items-center justify-center gap-2 px-4"
              >
                <div className="h-px flex-1 bg-border" />
                <div className="flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  <ModelAvatar externalId={entry.model.externalId} name={entry.model.name} size={14} />
                  <span>Switched to {entry.model.name}</span>
                  <Check className="h-3 w-3 text-emerald-500" />
                </div>
                <div className="h-px flex-1 bg-border" />
              </div>
            ) : (
              <MessageBubble
                key={entry.message.id}
                message={entry.message}
                template={idx === firstUserIdx ? websiteTemplate : undefined}
                activeModelTab={activeModelTabs[entry.message.id]}
                onModelTabChange={(modelId) => onModelTabChange(entry.message.id, modelId)}
                onRegenerate={onRegenerate}
                onFeedback={onFeedback}
                onEditMessage={onEditMessage}
                editVersions={entry.editVersions}
                editVersionIndex={entry.editVersionIndex}
                onEditVersionChange={onEditVersionChange}
                isLastMessage={idx === merged.length - 1}
                onFollowUpClick={onFollowUpClick}
                sharedView={sharedView}
                onToggleStar={onToggleStar}
                onContinue={onContinue}
                onRetryAssistantResponse={onRetryAssistantResponse}
                onSwitchToFreeModel={onSwitchToFreeModel}
              />
            ),
          )}
          <div id={bottomAnchorId} ref={bottomRef} />
        </div>
      </div>
    </>
  );
}
