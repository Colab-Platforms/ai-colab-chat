"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import { SelectionContextTooltip } from "./selection-context-tooltip";
import { VideoCard, type GeneratedVideo } from "./video-card";
import { VideoSequenceCard, type VideoSequence } from "./video-sequence-card";

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
   * standalone async job, not a chat.stream.ts turn — see modules/video on
   * the backend), so they can't come through `messages`. They're merged
   * into the render list here purely by createdAt, so a video appears
   * inline exactly where it was generated in the conversation instead of
   * being segregated into a separate strip.
   */
  videos?: GeneratedVideo[];
  onVideoDeleted?: (id: number) => void;
  /** In-flight or failed image sequences — a finished one shows up as a regular entry in `videos`. */
  sequences?: VideoSequence[];
  onSequenceCompleted?: (sequenceId: number, video: GeneratedVideo) => void;
  onSequenceDeleted?: (sequenceId: number) => void;
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

/** Discriminated render item — how `messages` and `videos` merge into one timeline. */
type RenderItem =
  | { kind: "message"; createdAt: string; message: Message; editVersions?: Message[]; editVersionIndex?: number }
  | { kind: "video"; createdAt: string; video: GeneratedVideo }
  | { kind: "sequence"; createdAt: string; sequence: VideoSequence };

type TimelineExtra =
  | { kind: "video"; createdAt: string; video: GeneratedVideo }
  | { kind: "sequence"; createdAt: string; sequence: VideoSequence };

/**
 * Stable merge by createdAt — both inputs already arrive in ascending
 * order, so this is a linear merge rather than a full sort, and ties keep
 * the message before the video (arbitrary but deterministic).
 */
function mergeWithVideos(
  processed: { message: Message; editVersions?: Message[]; editVersionIndex?: number }[],
  videos: TimelineExtra[],
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
      merged.push(nextVideo);
      vi++;
    }
  }

  return merged;
}

export function MessageList({
  messages, activeModelTabs, onModelTabChange, onRegenerate, onFeedback,
  onEditMessage, editVersionIndices = {}, onEditVersionChange, onFollowUpClick,
  showSelectionTooltip = true, sharedView = false, onToggleStar, bottomAnchorId, forceScrollToBottom = false, scrollContainerId, onContinue, onRetryAssistantResponse,
  onSwitchToFreeModel, videos = [], onVideoDeleted, sequences = [], onSequenceCompleted, onSequenceDeleted
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
  const extras: TimelineExtra[] = [
    ...videos.map((video): TimelineExtra => ({ kind: "video", createdAt: video.createdAt || "", video })),
    ...sequences.map((sequence): TimelineExtra => ({ kind: "sequence", createdAt: sequence.createdAt, sequence })),
  ].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  const merged = mergeWithVideos(processed, extras);

  return (
    <>
      {showSelectionTooltip && <SelectionContextTooltip />}
      <div id={scrollContainerId} ref={containerRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-4">
          {merged.map((entry, idx) =>
            entry.kind === "sequence" ? (
              <div key={`sequence-${entry.sequence.id}`} className="mb-4">
                <VideoSequenceCard
                  sequence={entry.sequence}
                  onCompleted={onSequenceCompleted}
                  onDeleted={onSequenceDeleted}
                />
              </div>
            ) : entry.kind === "video" ? (
              <div key={`video-${entry.video.id}`} className="mb-4">
                <VideoCard video={entry.video} onDeleted={onVideoDeleted} />
              </div>
            ) : (
              <MessageBubble
                key={entry.message.id}
                message={entry.message}
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
