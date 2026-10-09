"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Copy, ThumbsUp, ThumbsDown, Share2, RefreshCw,
  ChevronLeft, ChevronRight, Check, Loader2, Pencil, X,
  FileText, File, Image as ImageIcon, Star, FileSpreadsheet,
  Columns2, Focus, CornerUpLeft
} from "lucide-react";
import { ModelAvatar } from "./model-avatar";
import { useResponseLatency } from "./use-response-latency";
import { MarkdownRenderer } from "./markdown-renderer";
import { DocumentCard, type GeneratedDocument } from "./document-card";
import {
  CodeProjectCard,
  GenerationSteps,
  codeTurnFromResponse,
  type CodeTurnInfo,
  type CodeVersionOnResponse,
} from "@/features/code-workspace";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { PhotoProvider, PhotoView } from "react-photo-view";
import "react-photo-view/dist/react-photo-view.css";

interface ModelResponse {
  id: number;
  content: string | null;
  status: string;
  tokensUsed: number | null;
  model: { id: number; name: string; externalId?: string };
  createdAt?: string;
  completedAt?: string | null;
  isLiked?: boolean | null;
  isStarred?: boolean;
  finishReason?: string | null;
  // Attached per response, not per message: in compare mode each model's
  // answer produces its own document.
  generatedDocuments?: GeneratedDocument[];
  /** Code workspace turn — live while streaming (codeTurn), from the API after (codeVersions). */
  codeTurn?: CodeTurnInfo;
  codeVersions?: CodeVersionOnResponse[];
  insufficientBalance?: boolean;
  planRestricted?: boolean;
}

// Historical FAILED responses (loaded from DB after a refresh) don't carry
// the live `insufficientBalance` flag, so fall back to matching the known
// backend copy for this failure mode.
function isInsufficientBalanceFailure(resp?: ModelResponse | null): boolean {
  if (!resp || resp.status !== "FAILED") return false;
  if (resp.insufficientBalance) return true;
  const text = (resp.content || "").toLowerCase();
  // Older rows saved an empty-image result (usually a provider safety block)
  // with a misleading "insufficient tokens" copy - that's not a balance issue.
  if (text.includes("image generation")) return false;
  return (
    text.includes("insufficient tokens") ||
    text.includes("insufficient balance") ||
    text.includes("token limit exceeded")
  );
}

// A hard plan restriction (free-tier picked a paid model, or a plan without
// image/video generation) — unlike insufficient balance, switching to a free
// model can't fix this, so it gets a different recovery action.
function isPlanRestrictedFailure(resp?: ModelResponse | null): boolean {
  if (!resp || resp.status !== "FAILED") return false;
  return Boolean(resp.planRestricted);
}

function isImageGenerationMessage(message: Message): boolean {
  return (
    message.chatType === "IMAGE_GENERATION" ||
    (typeof window !== "undefined" &&
      localStorage.getItem("preferredChatType") === "IMAGE_GENERATION")
  );
}

// A user-initiated stop mid-stream is marked FAILED (there's no separate
// "stopped" status), but it isn't an error — whatever text had streamed in
// should stay on screen as-is, not flip to the destructive/retry UI.
function isStoppedByUser(resp?: ModelResponse | null): boolean {
  if (!resp || resp.status !== "FAILED") return false;
  return resp.finishReason === "user_aborted";
}

function parseFollowUpQuestions(text: string, isStreaming: boolean = false): { cleanText: string; questions: string[] } {
  if (!text) return { cleanText: "", questions: [] };
  
  // Optimization: Only search for follow-up questions in the last 1500 characters
  // since they always appear at the end of the response and regex on huge strings is slow.
  const searchLength = 1500;
  const startIndex = Math.max(0, text.length - searchLength);
  const searchString = text.substring(startIndex);
  
  const arrayRegex = /(?:```(?:json|JSON)?\s*|(?:\bjson\b|\bJSON\b)\s*)?(\[\s*"(?:[^"\\]|\\.)*"(?:\s*,\s*"(?:[^"\\]|\\.)*")*\s*\])(?:\s*```)?/gi;
  
  const matches = Array.from(searchString.matchAll(arrayRegex));
  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    const fullMatch = lastMatch[0];
    const jsonContent = lastMatch[1];
    
    // Check if what follows the match is just whitespace, newlines, or citations/punctuation
    const trailingText = searchString.slice(lastMatch.index! + fullMatch.length);
    const isAtEnd = /^(\s|\[\d+\]|,|\.|-)*$/.test(trailingText);
    
    if (isAtEnd) {
      try {
        const parsed = JSON.parse(jsonContent);
        if (Array.isArray(parsed)) {
          const questions = parsed.filter(q => typeof q === "string").slice(0, 4);
          if (questions.length > 0) {
            // Reconstruct clean text safely using exact index
            const globalIndex = startIndex + lastMatch.index!;
            const cleanText = text.substring(0, globalIndex) + text.substring(globalIndex + fullMatch.length);
            return {
              cleanText: cleanText.replace(/[\s`\-]+$/, ""),
              questions
            };
          }
        }
      } catch (e) {
        // Fallback if JSON is malformed
      }
    }
  }
  
  // While the response is still streaming in, the "```json" fence for follow-up
  // questions (see the backend prompt instruction) arrives char-by-char before the
  // array closes and matches the regex above. Left alone, the markdown renderer
  // draws that unclosed fence as a raw code block. Hide everything from the fence
  // onward until it's either complete (handled above) or the stream finishes.
  if (isStreaming) {
    const openFenceRegex = /```(?:json|JSON)/g;
    let lastFenceIndex = -1;
    let fenceMatch: RegExpExecArray | null;
    while ((fenceMatch = openFenceRegex.exec(searchString)) !== null) {
      lastFenceIndex = fenceMatch.index;
    }
    if (lastFenceIndex !== -1) {
      const afterFence = searchString.slice(lastFenceIndex + "```json".length);
      if (!afterFence.includes("```")) {
        const globalIndex = startIndex + lastFenceIndex;
        return {
          cleanText: text.substring(0, globalIndex).replace(/[\s`\-]+$/, ""),
          questions: [],
        };
      }
    }
  }

  return { cleanText: text.replace(/[\s`\-]+$/, ""), questions: [] };
}

function FollowUpTabs({ questions, onClick }: { questions: string[], onClick: (q: string) => void }) {
  if (!questions || questions.length === 0) return null;
  return (
    <>
      <p className="text-xs text-muted-foreground px-2 pt-2">Suggested follow-up questions:</p>
      <div className="flex flex-wrap gap-2 mt-4 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => onClick(q)}
          className="group relative flex items-center gap-2 text-xs px-4 py-2 rounded-2xl border border-border/90 bg-muted/30 text-foreground/70 hover:text-foreground transition-colors duration-200 text-left cursor-pointer max-w-full sm:max-w-[48%]"
        >
          <span className="">
            {q}
          </span>
          <ChevronRight className="w-3.5 h-3.5 opacity-0 -ml-1 group-hover:opacity-100 group-hover:ml-0 transition-all duration-200 flex-shrink-0" />
        </button>
      ))}
    </div>
    </>
  );
}

interface Message {
  id: number;
  role: string;
  content: string;
  createdAt: string;
  editedFromId?: number | null;
  attachments?: { id: number; fileName: string; fileUrl: string; mimeType: string }[];
  modelResponses?: ModelResponse[];
  sourceChatId?: number;
  sourceChatTitle?: string | null;
  chatType?: string;
}

interface MessageBubbleProps {
  message: Message;
  activeModelTab?: number;
  onModelTabChange?: (modelId: number) => void;
  onRegenerate?: (messageId: number, modelId: number) => void;
  onFeedback?: (responseId: number, isLiked: boolean | null) => void;
  onEditMessage?: (messageId: number, newContent: string) => void;
  // Version navigation props
  editVersions?: Message[];
  editVersionIndex?: number;
  onEditVersionChange?: (rootMessageId: number, versionIndex: number) => void;
  isLastMessage?: boolean;
  onFollowUpClick?: (question: string) => void;
  sharedView?: boolean;
  onToggleStar?: (responseId: number, isStarred: boolean) => void;
  onContinue?: (messageId: number, modelId: number) => void;
  onRetryAssistantResponse?: (assistantMessageId: number, modelId: number) => void;
  onSwitchToFreeModel?: (assistantMessageId: number, modelId: number) => void;
}

export const MessageBubble = React.memo(function MessageBubble({
  message, activeModelTab, onModelTabChange, onRegenerate, onFeedback,
  onEditMessage, editVersions, editVersionIndex, onEditVersionChange,
  isLastMessage, onFollowUpClick, sharedView = false, onToggleStar, onContinue, onRetryAssistantResponse,
  onSwitchToFreeModel
}: MessageBubbleProps) {
  const isUser = message.role === "USER";
  const responses = message.modelResponses || [];
  const hasSourceChat = Boolean(message.sourceChatId);
  const sourceChatTitle = message.sourceChatTitle || "New Chat";
  const sourceChatLabel =
    sourceChatTitle.length > 15 ? `${sourceChatTitle.substring(0, 15)}...` : sourceChatTitle;
  const sourceChatUrl = message.sourceChatId ? `/c/${message.sourceChatId}` : null;
  const markStarredNavigation = () => {
    if (!message.sourceChatId || typeof window === "undefined") return;
    sessionStorage.setItem("open_chat_from_starred", String(message.sourceChatId));
  };

  // Group responses by model
  const responsesByModel = responses.reduce((acc, resp) => {
    if (!acc[resp.model.id]) acc[resp.model.id] = [];
    acc[resp.model.id].push(resp);
    return acc;
  }, {} as Record<number, ModelResponse[]>);

  const uniqueModels = Object.values(responsesByModel).map(arr => arr[0].model);
  const isMultiModel = uniqueModels.length > 1;

  // Version navigation per model
  const [versionIndices, setVersionIndices] = useState<Record<number, number>>({});
  const handleVersionChange = (modelId: number, dir: 1 | -1) => {
    const list = responsesByModel[modelId] || [];
    const cur = versionIndices[modelId] ?? (list.length - 1);
    setVersionIndices(prev => ({ ...prev, [modelId]: Math.max(0, Math.min(list.length - 1, cur + dir)) }));
  };

  // Edit state — two-phase for smooth open/close
  const [showEdit, setShowEdit] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const startEditing = () => {
    setEditText(message.content);
    setIsClosing(false);
    setShowEdit(true);
  };

  const cancelEditing = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowEdit(false);
      setIsClosing(false);
      setEditText("");
    }, 200);
  };

  const saveEdit = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === message.content) {
      cancelEditing();
      return;
    }
    onEditMessage?.(message.id, trimmed);
    setShowEdit(false);
    setIsClosing(false);
    setEditText("");
  };

  // Auto-resize textarea
  useEffect(() => {
    if (showEdit && !isClosing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
      textareaRef.current.focus();
    }
  }, [showEdit, isClosing, editText]);

  // Handle Ctrl+Enter to save
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      saveEdit();
    }
    if (e.key === "Escape") {
      cancelEditing();
    }
  };

  // Multi-model layout: every answer side by side, or one at a time.
  const [viewMode, setViewMode] = useState<"columns" | "focus">("columns");
  const [focusModelId, setFocusModelId] = useState<number | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ai-colab:multi-view");
      if (saved === "columns" || saved === "focus") setViewMode(saved);
    } catch { /* storage unavailable */ }
  }, []);
  const changeViewMode = (mode: "columns" | "focus") => {
    setViewMode(mode);
    try { localStorage.setItem("ai-colab:multi-view", mode); } catch { /* storage unavailable */ }
  };

  // Single model setup
  const singleResps = !isMultiModel && uniqueModels[0] ? responsesByModel[uniqueModels[0].id] || [] : [];
  const singleVerIdx = !isMultiModel && uniqueModels[0] ? (versionIndices[uniqueModels[0].id] ?? (singleResps.length - 1)) : 0;
  const singleResp = singleResps[singleVerIdx] || singleResps[0];

  // Version info
  const hasVersions = editVersions && editVersions.length > 1;
  const versionCount = editVersions?.length || 1;
  const currentVersionIdx = editVersionIndex ?? 0;

  // ── User message ─────────────────────────────────────────────────────────
  if (isUser) {
    return (
      <div className={`mx-auto w-full max-w-3xl px-4 py-3 ${!isMounted ? "animate-in fade-in-0 slide-in-from-bottom-2 duration-300" : ""} sm:-mb-3 ${showEdit ? "flex" : "flex justify-end"}`}>
        <div className={showEdit ? "w-full" : "max-w-[95%] sm:max-w-[85%]"}>
          <Attachments message={message} isUser={true} />
          {showEdit ? (
            // Edit mode
            <div className={`bg-sunken rounded-2xl px-4 py-3 border border-border space-y-2 transition-all duration-200 ${
              isClosing
                ? "opacity-0 scale-95 translate-x-2"
                : "opacity-100 scale-100 translate-x-0 animate-in fade-in-0 zoom-in-95 slide-in-from-right-2 duration-200"
            }`}>
              <textarea
                ref={textareaRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent text-sm text-foreground resize-none outline-none min-h-[60px] max-h-[300px] transition-all duration-200"
                rows={1}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditing}
                  className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={saveEdit}
                  disabled={!editText.trim() || editText.trim() === message.content}
                  className="h-7 px-3 text-xs"
                >
                  Send
                </Button>
              </div>
            </div>
          ) : (
            // Display mode
            <div className="group/user relative">
              <div className="bg-sunken text-foreground rounded-2xl px-4 py-3 break-words">
                <p data-message-text="true" className="text-[14.5px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
              </div>
              
              {/* Action buttons below the message - left aligned */}
              {!sharedView && (
                <div className="flex items-center gap-1 mt-1 justify-end">
                {/* Version navigation */}
                {hasVersions && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full mr-1 opacity-100 sm:opacity-0 group-hover/user:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEditVersionChange?.(editVersions![0].editedFromId || editVersions![0].id, currentVersionIdx - 1)}
                      disabled={currentVersionIdx === 0}
                      className="hover:text-foreground disabled:opacity-30 p-0.5"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-medium tabular-nums">{currentVersionIdx + 1}/{versionCount}</span>
                    <button
                      onClick={() => onEditVersionChange?.(editVersions![0].editedFromId || editVersions![0].id, currentVersionIdx + 1)}
                      disabled={currentVersionIdx === versionCount - 1}
                      className="hover:text-foreground disabled:opacity-30 p-0.5"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Copy button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted/80 opacity-100 sm:opacity-0 group-hover/user:opacity-100 transition-opacity"
                  onClick={() => { navigator.clipboard.writeText(message.content); toast.success("Copied"); }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>

                {/* Edit button */}
                {onEditMessage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-muted-foreground hover:bg-muted/80 opacity-100 sm:opacity-0 group-hover/user:opacity-100 transition-opacity"
                    onClick={startEditing}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Assistant: single model ───────────────────────────────────────────────
  if (!isMultiModel) {
    const singleModel = uniqueModels[0];
    return (
      <div className={`mx-auto w-full max-w-3xl px-4 py-3 ${!isMounted ? "animate-in fade-in-0 slide-in-from-bottom-2 duration-300" : ""}`}>
        <div className="w-full space-y-2.5 min-w-0">
          <div className="flex items-center gap-2">
            <ModelAvatar externalId={singleModel?.externalId} name={singleModel?.name} size={22} />
            <span className="text-[13px] font-medium text-foreground">{singleModel?.name || "AI"}</span>
            <LatencyLabel resp={singleResp} />
            {hasSourceChat && sourceChatUrl && (
              <Link
                href={sourceChatUrl}
                onClick={markStarredNavigation}
                className="ml-auto inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                title={sourceChatTitle}
              >
                <span className="truncate max-w-[140px]">{sourceChatLabel}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>

          {/* break-words and overflow-hidden prevent horizontal scrolling on long continuous strings */}
          <div className="break-words overflow-hidden w-full text-[15px]">
            <ResponseBody
              resp={singleResp}
              message={message}
              modelId={singleModel?.id}
              sharedView={sharedView}
              isLastMessage={isLastMessage}
              onFollowUpClick={onFollowUpClick}
              onRetryAssistantResponse={onRetryAssistantResponse}
              onSwitchToFreeModel={onSwitchToFreeModel}
            />
          </div>

          {singleResp?.status === "COMPLETED" && singleResp.content && (
            <CardActions
              resp={singleResp}
              modelId={singleModel?.id}
              messageId={message.id}
              modelResps={singleResps}
              verIdx={singleVerIdx}
              onVersionChange={(d) => singleModel && handleVersionChange(singleModel.id, d)}
              onFeedback={onFeedback}
              sharedView={sharedView}
              onToggleStar={onToggleStar}
              onRegenerate={(msgId, mid) => {
                setVersionIndices(prev => { const n = { ...prev }; delete n[mid]; return n; });
                onRegenerate?.(msgId, mid);
              }}
              onContinue={onContinue}
              isLastMessage={isLastMessage}
            />
          )}
        </div>
        <Attachments message={message} />
      </div>
    );
  }

  // ── Assistant: multi-model ───────────────────────────────────────────────
  const latestFor = (modelId: number) => {
    const list = responsesByModel[modelId] || [];
    return list[versionIndices[modelId] ?? list.length - 1] || list[0];
  };
  const settled = uniqueModels.every((m) => {
    const s = latestFor(m.id)?.status;
    return s === "COMPLETED" || s === "FAILED";
  });
  const focusModel = uniqueModels.find((m) => m.id === focusModelId) ?? uniqueModels[0];
  const shownModels = viewMode === "focus" ? [focusModel] : uniqueModels;
  const gridCols =
    uniqueModels.length >= 4
      ? "md:grid-cols-2 2xl:grid-cols-4"
      : uniqueModels.length === 3
        ? "lg:grid-cols-3"
        : "md:grid-cols-2";

  return (
    <div className={`mx-auto w-full max-w-[1320px] px-4 sm:px-6 py-3 min-w-0 ${!isMounted ? "animate-in fade-in-0 slide-in-from-bottom-2 duration-300" : ""}`}>
      <div className="w-full space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            {!settled && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
            <span>
              {settled
                ? `${uniqueModels.length} models answered${sharedView ? "" : " · pick one to continue from"}`
                : `Comparing ${uniqueModels.length} models…`}
            </span>
          </div>
          <div className="inline-flex items-center rounded-lg border border-border bg-sunken p-0.5">
            {([
              { id: "columns", label: "Columns", Icon: Columns2 },
              { id: "focus", label: "Focus", Icon: Focus },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => changeViewMode(id)}
                className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors cursor-pointer ${
                  viewMode === id
                    ? "border-border bg-surface text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {viewMode === "focus" && (
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {uniqueModels.map((model) => {
              const active = model.id === focusModel.id;
              const status = latestFor(model.id)?.status;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setFocusModelId(model.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? "border-border bg-surface text-foreground shadow-sm"
                      : "border-transparent bg-sunken text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ModelAvatar externalId={model.externalId} name={model.name} size={16} />
                  <span className="truncate max-w-[110px]">{model.name}</span>
                  {(status === "STREAMING" || status === "PENDING") && <Loader2 className="w-3 h-3 animate-spin" />}
                  {status === "COMPLETED" && <Check className="w-3 h-3 text-ok" />}
                </button>
              );
            })}
          </div>
        )}

        <div className={viewMode === "focus" ? "mx-auto max-w-3xl w-full" : `grid grid-cols-1 gap-4 ${gridCols}`}>
          {shownModels.map((model) => {
            const mResps = responsesByModel[model.id] || [];
            const verIdx = versionIndices[model.id] ?? (mResps.length - 1);
            const resp = mResps[verIdx] || mResps[0];

            return (
              <div
                key={model.id}
                className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface break-words"
              >
                <div className="flex min-w-0 items-center gap-2 border-b border-border px-4 py-3">
                  <ModelAvatar externalId={model.externalId} name={model.name} size={22} />
                  <span className="truncate text-[13.5px] font-semibold text-foreground">{model.name}</span>
                  <LatencyLabel resp={resp} />
                  {(resp?.status === "STREAMING" || resp?.status === "PENDING") && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary shrink-0" />
                  )}
                  {hasSourceChat && sourceChatUrl && (
                    <Link
                      href={sourceChatUrl}
                      onClick={markStarredNavigation}
                      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      title={sourceChatTitle}
                    >
                      <span className="truncate max-w-[100px]">{sourceChatLabel}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                  <div className="flex-1" />
                  {!sharedView && resp?.status === "COMPLETED" && resp.content && (
                    <button
                      type="button"
                      onClick={() => window.dispatchEvent(new CustomEvent("ai-colab:use-model", { detail: { modelId: model.id } }))}
                      title="Continue the conversation with this model only"
                      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-colors hover:border-line-strong hover:bg-sidebar-accent cursor-pointer"
                    >
                      <CornerUpLeft className="w-3.5 h-3.5" />
                      Use this
                    </button>
                  )}
                </div>

                <div className={`flex-1 min-w-0 px-4 py-4 text-[14.5px] overflow-y-auto scrollbar-thin ${viewMode === "focus" ? "" : "max-h-[560px]"}`}>
                  <ResponseBody
                    resp={resp}
                    message={message}
                    modelId={model.id}
                    sharedView={sharedView}
                    isLastMessage={isLastMessage}
                    onFollowUpClick={onFollowUpClick}
                    onRetryAssistantResponse={onRetryAssistantResponse}
                    onSwitchToFreeModel={onSwitchToFreeModel}
                    compact
                  />
                </div>

                {resp?.status === "COMPLETED" && resp.content && (
                  <div className="mt-auto border-t border-border px-3 py-1.5">
                    <CardActions
                      resp={resp}
                      modelId={model.id}
                      messageId={message.id}
                      modelResps={mResps}
                      verIdx={verIdx}
                      onVersionChange={(d) => handleVersionChange(model.id, d)}
                      onFeedback={onFeedback}
                      sharedView={sharedView}
                      onToggleStar={onToggleStar}
                      onRegenerate={(msgId, mid) => {
                        setVersionIndices(prev => { const n = { ...prev }; delete n[mid]; return n; });
                        onRegenerate?.(msgId, mid);
                      }}
                      onContinue={onContinue}
                      isLastMessage={isLastMessage}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Attachments message={message} />
    </div>
  );
}, (prev, next) => {
  if (prev.activeModelTab !== next.activeModelTab) return false;
  if (prev.isLastMessage !== next.isLastMessage) return false;
  if (prev.editVersionIndex !== next.editVersionIndex) return false;
  if (prev.sharedView !== next.sharedView) return false;
  
  const pMsg = prev.message;
  const nMsg = next.message;
  if (pMsg.id !== nMsg.id) return false;
  if (pMsg.content !== nMsg.content) return false;
  if (pMsg.sourceChatId !== nMsg.sourceChatId) return false;
  if (pMsg.chatType !== nMsg.chatType) return false;
  
  const pResps = pMsg.modelResponses || [];
  const nResps = nMsg.modelResponses || [];
  if (pResps.length !== nResps.length) return false;
  for (let i = 0; i < pResps.length; i++) {
    const pr = pResps[i];
    const nr = nResps[i];
    if (pr.id !== nr.id || pr.status !== nr.status || pr.content !== nr.content || pr.isLiked !== nr.isLiked || pr.isStarred !== nr.isStarred || pr.insufficientBalance !== nr.insufficientBalance || pr.planRestricted !== nr.planRestricted || pr.finishReason !== nr.finishReason || pr.completedAt !== nr.completedAt) {
      return false;
    }
  }

  if (pMsg.attachments?.length !== nMsg.attachments?.length) return false;
  if (prev.editVersions?.length !== next.editVersions?.length) return false;

  if (prev.onRetryAssistantResponse !== next.onRetryAssistantResponse) return false;
  if (prev.onSwitchToFreeModel !== next.onSwitchToFreeModel) return false;

  return true;
});

// ── Response rendering shared by single and multi layouts ───────────────────

function LatencyLabel({ resp }: { resp?: ModelResponse | null }) {
  const latency = useResponseLatency(resp);
  if (!latency) return null;
  return <span className="font-mono text-[11.5px] text-faint shrink-0">{latency}</span>;
}

/**
 * The body of one model's answer: failure states, markdown (with streaming
 * cursor), typing indicator, then generated documents / code project /
 * follow-up suggestions. `compact` is the multi-model card variant, which
 * has never shown the code-generation steps inline.
 */
function ResponseBody({
  resp, message, modelId, sharedView, isLastMessage, onFollowUpClick,
  onRetryAssistantResponse, onSwitchToFreeModel, compact = false,
}: {
  resp?: ModelResponse | null;
  message: Message;
  modelId?: number;
  sharedView: boolean;
  isLastMessage?: boolean;
  onFollowUpClick?: (question: string) => void;
  onRetryAssistantResponse?: (assistantMessageId: number, modelId: number) => void;
  onSwitchToFreeModel?: (assistantMessageId: number, modelId: number) => void;
  compact?: boolean;
}) {
  const parsed = parseFollowUpQuestions(resp?.content || "", resp?.status === "STREAMING");
  const codeTurn = resp && !compact ? codeTurnFromResponse(resp) : null;
  const isImageMode =
    message.chatType === "IMAGE_GENERATION" ||
    (typeof window !== "undefined" && localStorage.getItem("preferredChatType") === "IMAGE_GENERATION");

  let body: React.ReactNode;
  if (!resp) {
    // An assistant turn with no saved response yet is still generating on the
    // server (e.g. the user left the page and came back) — show progress, not a blank.
    body =
      parsed.cleanText || message.content ? (
        <p className="text-sm whitespace-pre-wrap">{parsed.cleanText || message.content}</p>
      ) : message.role === "ASSISTANT" ? (
        <TypingIndicator isImageMode={isImageMode} />
      ) : null;
  } else if (resp.status === "FAILED" && !isStoppedByUser(resp)) {
    if (isPlanRestrictedFailure(resp)) {
      body = (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            {resp.content?.trim() || "This isn't included in your current plan."}
          </p>
          {!sharedView && (
            <Button variant="outline" size="sm" className="h-8 text-xs" type="button" asChild>
              <Link href="/profile/subscription">Upgrade your plan</Link>
            </Button>
          )}
        </div>
      );
    } else if (isInsufficientBalanceFailure(resp)) {
      body = (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            {isImageGenerationMessage(message)
              ? "You have insufficient balance for the image generation model."
              : "You have insufficient balance. Do you want to switch to free models?"}
          </p>
          {!isImageGenerationMessage(message) && !sharedView && onSwitchToFreeModel && modelId !== undefined ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              type="button"
              onClick={() => onSwitchToFreeModel(message.id, modelId)}
            >
              Yes
            </Button>
          ) : null}
        </div>
      );
    } else {
      body = (
        <div className="space-y-2">
          <p className="text-sm text-destructive">
            {resp.content?.trim() || "Failed to generate a response. Please try again."}
          </p>
          {!sharedView && onRetryAssistantResponse && modelId !== undefined ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              type="button"
              onClick={() => onRetryAssistantResponse(message.id, modelId)}
            >
              Try again
            </Button>
          ) : null}
        </div>
      );
    }
  } else if (parsed.cleanText) {
    body = (
      <div data-message-text="true" className="w-full max-w-full prose-pre:max-w-full prose-pre:overflow-x-auto">
        <MarkdownRenderer content={parsed.cleanText} />
        {resp.status === "STREAMING" && <span className="inline-block w-1.5 h-4 bg-foreground/70 ml-0.5 animate-pulse" />}
      </div>
    );
  } else if (codeTurn) {
    body = null;
  } else {
    body = <TypingIndicator isImageMode={isImageMode} />;
  }

  return (
    <>
      {codeTurn && !sharedView && <GenerationSteps turn={codeTurn} />}
      {body}

      {resp?.generatedDocuments?.map((generatedDocument) => (
        <DocumentCard key={generatedDocument.id} document={generatedDocument} className={compact ? "max-w-full" : undefined} />
      ))}

      {codeTurn && !sharedView && (
        <div className="px-4">
          <CodeProjectCard turn={codeTurn} />
        </div>
      )}

      {isLastMessage && resp?.status === "COMPLETED" && parsed.questions.length > 0 && onFollowUpClick && (
        <div className={compact ? "pt-2" : undefined}>
          <FollowUpTabs questions={parsed.questions} onClick={onFollowUpClick} />
        </div>
      )}
    </>
  );
}

// ── Shared action bar ────────────────────────────────────────────────────────
function CardActions({
  resp, modelId, messageId, modelResps, verIdx, onVersionChange, onFeedback, onRegenerate, sharedView = false, onToggleStar, onContinue, isLastMessage
}: {
  resp: ModelResponse;
  modelId: number;
  messageId: number;
  modelResps: ModelResponse[];
  verIdx: number;
  onVersionChange: (dir: 1 | -1) => void;
  onFeedback?: (responseId: number, isLiked: boolean | null) => void;
  onRegenerate?: (messageId: number, modelId: number) => void;
  sharedView?: boolean;
  onToggleStar?: (responseId: number, isStarred: boolean) => void;
  onContinue?: (messageId: number, modelId: number) => void;
  isLastMessage?: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 flex-wrap text-muted-foreground">
      {modelResps.length > 1 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground bg-sunken px-2 py-0.5 rounded-full mr-1">
          <button onClick={() => onVersionChange(-1)} disabled={verIdx === 0} className="hover:text-foreground disabled:opacity-30 p-0.5">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-medium tabular-nums">{verIdx + 1}/{modelResps.length}</span>
          <button onClick={() => onVersionChange(1)} disabled={verIdx === modelResps.length - 1} className="hover:text-foreground disabled:opacity-30 p-0.5">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        onClick={() => { navigator.clipboard.writeText(resp.content!); toast.success("Copied"); }}>
        <Copy className="w-3.5 h-3.5" />
      </Button>
      {!sharedView && (
        <Button
          variant="ghost"
          size="icon"
          className={`h-7 w-7 rounded-md ${resp.isStarred ? "text-warn bg-sidebar-accent" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}
          onClick={() => onToggleStar?.(resp.id, !resp.isStarred)}
        >
          <Star className={`w-3.5 h-3.5 ${resp.isStarred ? "fill-current" : ""}`} />
        </Button>
      )}
      {!sharedView && (
        <Button variant="ghost" size="icon"
          className={`h-7 w-7 rounded-md ${resp.isLiked === true ? "text-ok bg-sidebar-accent" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}
          onClick={() => onFeedback?.(resp.id, resp.isLiked === true ? null : true)}>
          <ThumbsUp className="w-3.5 h-3.5" />
        </Button>
      )}
      {!sharedView && (
        <Button variant="ghost" size="icon"
          className={`h-7 w-7 rounded-md ${resp.isLiked === false ? "text-danger bg-sidebar-accent" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"}`}
          onClick={() => onFeedback?.(resp.id, resp.isLiked === false ? null : false)}>
          <ThumbsDown className="w-3.5 h-3.5" />
        </Button>
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        onClick={async () => {
          if (navigator.share) { try { await navigator.share({ title: "AI Colab", text: resp.content! }); } catch { /**/ } }
          else { navigator.clipboard.writeText(resp.content!); toast.success("Copied for sharing"); }
        }}>
        <Share2 className="w-3.5 h-3.5" />
      </Button>
      {!sharedView && (
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
          onClick={() => onRegenerate?.(messageId, modelId)}>
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      )}
      {!sharedView && isLastMessage && (
        resp.finishReason?.toLowerCase() === "length" || 
        resp.finishReason?.toLowerCase() === "max_tokens" || 
        (resp as any).finish_reason?.toLowerCase() === "length" || 
        (resp as any).finish_reason?.toLowerCase() === "max_tokens"
      ) && (
        <Button variant="outline" size="sm" className="h-7 text-xs rounded-full ml-1"
          onClick={() => onContinue?.(messageId, modelId)}>
          Continue generating
        </Button>
      )}
    </div>
  );
}

// ── Attachments ──────────────────────────────────────────────────────────────

function Attachments({ message, isUser }: { message: Message; isUser?: boolean }) {
  if (!message.attachments?.length) return null;

  const getAttachmentCategory = (fileName: string, mimeType: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "";
    const lowerMime = mimeType.toLowerCase();
    if (lowerMime.startsWith("image/")) return "image";
    if (lowerMime === "application/pdf" || ext === "pdf") return "pdf";
    if (
      lowerMime.includes("spreadsheet") ||
      lowerMime.includes("excel") ||
      ext === "csv" ||
      ext === "xls" ||
      ext === "xlsx" ||
      ext === "xlsm"
    ) {
      return "spreadsheet";
    }
    if (
      lowerMime.includes("msword") ||
      lowerMime.includes("wordprocessingml") ||
      ext === "doc" ||
      ext === "docx"
    ) {
      return "word";
    }
    if (
      lowerMime.includes("powerpoint") ||
      lowerMime.includes("presentationml") ||
      ext === "ppt" ||
      ext === "pptx"
    ) {
      return "presentation";
    }
    if (lowerMime === "text/markdown" || lowerMime === "text/x-markdown" || ext === "md") {
      return "markdown";
    }
    if (lowerMime.startsWith("text/") || ext === "txt") return "text";
    return "other";
  };

  const getAttachmentVisual = (fileName: string, mimeType: string) => {
    const category = getAttachmentCategory(fileName, mimeType);
    switch (category) {
      case "image":
        return {
          icon: <ImageIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />,
          chipClass:
            "bg-violet-50/90 border-violet-200/80 text-violet-900 dark:bg-violet-500/10 dark:border-violet-400/30 dark:text-violet-100",
          iconWrapClass: "bg-violet-100/80 dark:bg-violet-500/20",
        };
      case "pdf":
        return {
          icon: <FileText className="w-4 h-4 text-pink-700 dark:text-pink-300" />,
          chipClass:
            "bg-pink-50/90 border-pink-200/80 text-pink-900 dark:bg-pink-500/10 dark:border-pink-400/30 dark:text-pink-100",
          iconWrapClass: "bg-pink-100/90 dark:bg-pink-500/20",
        };
      case "spreadsheet":
        return {
          icon: <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />,
          chipClass:
            "bg-emerald-50/90 border-emerald-200/80 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-100",
          iconWrapClass: "bg-emerald-100/80 dark:bg-emerald-500/20",
        };
      case "word":
        return {
          icon: <span className="text-[10px] font-extrabold leading-none text-black dark:text-white">W</span>,
          chipClass:
            "bg-slate-100/90 border-slate-300/80 text-slate-900 dark:bg-slate-800/50 dark:border-slate-600/50 dark:text-slate-100",
          iconWrapClass: "bg-white border border-black/20 dark:bg-black dark:border-white/25",
        };
      case "presentation":
        return {
          icon: <span className="text-[10px] font-extrabold leading-none text-black dark:text-white">P</span>,
          chipClass:
            "bg-fuchsia-50/90 border-fuchsia-200/80 text-fuchsia-900 dark:bg-fuchsia-500/10 dark:border-fuchsia-400/30 dark:text-fuchsia-100",
          iconWrapClass: "bg-white border border-black/20 dark:bg-black dark:border-white/25",
        };
      case "markdown":
        return {
          icon: <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
          chipClass:
            "bg-emerald-50/90 border-emerald-200/80 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-100",
          iconWrapClass: "bg-emerald-100/80 dark:bg-emerald-500/20",
        };
      case "text":
        return {
          icon: <FileText className="w-4 h-4 text-cyan-700 dark:text-cyan-400" />,
          chipClass:
            "bg-cyan-50/90 border-cyan-200/80 text-cyan-900 dark:bg-cyan-500/10 dark:border-cyan-400/30 dark:text-cyan-100",
          iconWrapClass: "bg-cyan-100/80 dark:bg-cyan-500/20",
        };
      default:
        return {
          icon: <File className="w-4 h-4 text-muted-foreground" />,
          chipClass: "bg-muted/80 border-border/50 text-foreground",
          iconWrapClass: "bg-primary/10",
        };
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 px-0 ${isUser ? 'mb-2 justify-end' : 'mt-2 justify-start'}`}>
      <PhotoProvider>
        {message.attachments.map((att) => {
          const isImage = att.mimeType.startsWith("image/");
          const visual = getAttachmentVisual(att.fileName, att.mimeType);
          
          if (isImage) {
            return (
              <PhotoView key={att.id} src={att.fileUrl}>
                <div className="group relative flex items-center gap-2 px-3 py-2 bg-muted/80 hover:bg-muted border border-border/50 rounded-xl text-xs transition-all duration-200 overflow-hidden cursor-pointer">
                  <div className="w-8 h-8 flex-shrink-0 rounded bg-muted-foreground/10 overflow-hidden relative">
                    <img src={att.fileUrl} alt={att.fileName} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-medium text-foreground truncate max-w-[120px] sm:max-w-[180px]">
                      {att.fileName}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase">
                      {att.mimeType.split("/")[1] || "IMAGE"}
                    </span>
                  </div>
                </div>
              </PhotoView>
            );
          }

          const downloadUrl = `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api"}/attachments/${att.id}/download`;
          return (
            <a
              key={att.id}
              href={downloadUrl}
              download={att.fileName}
              className={`group relative flex items-center gap-2 px-3 py-2 border rounded-xl text-xs transition-all duration-200 overflow-hidden ${visual.chipClass}`}
            >
              <div className={`w-8 h-8 flex-shrink-0 rounded flex items-center justify-center ${visual.iconWrapClass}`}>
                {visual.icon}
              </div>
              <div className="flex flex-col min-w-0 pr-2">
                <span className="font-medium text-foreground truncate max-w-[120px] sm:max-w-[180px]">
                  {att.fileName}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase">
                  {att.mimeType.split("/")[1] || "FILE"}
                </span>
              </div>
            </a>
          );
        })}
      </PhotoProvider>
    </div>
  );
}

// ── Typing indicator ──────────────────────────────────────────────────────────
function TypingIndicator({ isImageMode }: { isImageMode?: boolean }) {
  if (isImageMode) {
    return (
      <div className="w-full h-40 bg-muted-foreground/10 rounded-xl flex items-center justify-center border border-dashed border-muted-foreground/20 my-1">
        <div className="flex flex-col items-center gap-2 text-muted-foreground/60">
          <RefreshCw className="w-6 h-6 animate-spin" />
          <span className="text-sm font-medium">Generating image…</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 py-2">
      <div className="relative w-16 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/40 to-transparent w-full animate-[shimmer_1.4s_infinite]" 
             style={{ 
               backgroundSize: '200% 100%',
               animation: 'shimmer 1.5s infinite linear'
             }} />
      </div>
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
