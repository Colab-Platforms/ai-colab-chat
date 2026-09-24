"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import imageCompression from "browser-image-compression";
import {
  Loader2,
  ArrowUp,
  Search,
  X,
  Sparkles,
  Image as ImageIcon,
  MessageSquare,
  Square,
  FileText,
  File,
  Upload,
  FileSpreadsheet,
  Camera,
  Paperclip,
  Maximize2,
  Minimize2,
  AudioLines,
  Film,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { getModelIcon } from "@/lib/model-icons";
import { attachmentService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { ModelsModal } from "@/components/chat/models-modal";

// Dynamically imported so react-speech-recognition never runs on the server
const MicButton = dynamic(
  () =>
    import("@/components/chat/mic-button").then((m) => ({
      default: m.MicButton,
    })),
  { ssr: false, loading: () => null },
);

// Dynamically imported so the Pipecat/WebRTC client never runs on the server
const VoiceModal = dynamic(
  () =>
    import("@/components/chat/voice-modal").then((m) => ({
      default: m.VoiceModal,
    })),
  { ssr: false, loading: () => null },
);

interface Model {
  id: number;
  name: string;
  description: string | null;
  capabilities?: string[];
  externalId?: string;
  defaultForCapabilities?: string[];
  tokenMultiplier?: number;
}

/** A file that has been uploaded to the backend (Cloudinary) */
interface UploadedAttachment {
  id: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  /** local object URL for image thumbnail preview (before upload completes) */
  previewUrl?: string;
  uploading?: boolean;
}

interface ChatInputProps {
  models: Model[];
  selectedModels: number[];
  onModelChange: (ids: number[]) => void;
  maxModels: number;
  onSend: (
    content: string,
    attachmentIds?: number[],
    chatType?: ChatType,
    attachmentObjects?: UploadedAttachment[],
  ) => void;
  onEnhancePrompt?: (content: string) => Promise<{
    enhancedPrompt: string;
  }>;
  isSending: boolean;
  onStopStreaming?: () => void;
  forceReset?: boolean;
  initialPrompt?: string;
  onPromptClear?: () => void;
  draftStorageKey?: string;
  onCapabilityChange?: (type: ChatType) => void;
  chatType?: ChatType;
  /**
   * Video generation is deliberately NOT a ChatType — it doesn't route
   * through chat.stream.ts's capability/model-switching machinery the way
   * IMAGE_GENERATION does, it's a standalone async job (see modules/video on
   * the backend). This just opens the caller's own video dialog; it never
   * touches chatType/handleChatTypeChange.
   */
  onGenerateVideoClick?: () => void;
}

type ChatType =
  | "STANDARD"
  | "DEEP_RESEARCH"
  | "IMAGE_GENERATION"
  | "WEB_SEARCH";

const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
];
const ACCEPT_TYPES = "image/*,.pdf,.doc,.docx,.txt,.md,.ppt,.pptx";

const CAPABILITY_PATTERNS: Record<Exclude<ChatType, "STANDARD">, RegExp[]> = {
  IMAGE_GENERATION: [
    /\b(generate|create|make|design|draw|render)\b.{0,40}\b(creative|image|picture|photo|art|illustration|logo|icon|poster|banner)\b/i,
    /\b(image|picture|photo|art|illustration|logo|icon|poster|banner)\b.{0,40}\b(generate|create|make|design|draw|render)\b/i,
    /\b(text to image|text-to-image|image generation|generate an image|create an image)\b/i,
    /\b(img|pic|pics|wallpaper|thumbnail|avatar|sticker|sketch|concept art|cover art|mockup)\b/i,
    /\b(make|create|generate|design)\b.{0,40}\b(img|pic|photo|wallpaper|thumbnail|avatar|sticker|logo)\b/i,
    /\b(a|an)\s+(image|img|picture|photo|logo|icon|poster|banner)\s+(of|for)\b/i,
    /\b(illustrate|visualize)\b/i,
    /\b(can you|could you|please)\b.{0,30}\b(make|create|generate|design|draw)\b.{0,40}\b(image|img|picture|photo|logo|icon|art)\b/i,
    /\bi need\b.{0,30}\b(image|img|picture|photo|logo|icon|banner|poster)\b/i,
    /\bturn\b.{0,30}\b(this|that|text|idea|prompt)\b.{0,30}\binto\b.{0,30}\b(image|img|picture|art)\b/i,
    /\bshow me\b.{0,30}\b(image|img|visual|mockup|design)\b/i,
  ],
  DEEP_RESEARCH: [
    /\b(deep research|comprehensive research|research thoroughly|investigate deeply|in depth research|detailed report)\b/i,
    /\b(analyze|investigate|evaluate|compare)\b.{0,40}\b(in depth|thoroughly|comprehensively|detailed)\b/i,
    /\b(deep dive|deep-dive|thorough analysis|comprehensive analysis|detailed analysis)\b/i,
    /\b(literature review|systematic review|research paper|whitepaper|thesis)\b/i,
    /\b(citations?|references|sources?)\b.{0,40}\b(required|needed|please|include|with)\b/i,
    /\b(with citations|with references|with sources|cite sources)\b/i,
    /\b(analyse|analyze|compare|evaluate)\b.{0,40}\b(pros and cons|trade[- ]?offs|in detail)\b/i,
    /\bresearch about\b/i,
    /\bthink before answering\b/i,
    /\bthink (deeply|carefully|step by step)\b/i,
    /\b(do|perform)\b.{0,20}\bdeep\b.{0,20}\bresearch\b/i,
    /\b(give|provide)\b.{0,30}\b(detailed|in-depth|thorough)\b.{0,30}\b(answer|analysis|breakdown)\b/i,
    /\bexplain\b.{0,30}\b(step by step|in depth|in detail)\b/i,
  ],
  WEB_SEARCH: [
    /\b(web search|search the web|browse the web|look up|google|find online)\b/i,
    /\b(latest|current|today|recent|news|updated)\b.{0,40}\b(info|information|updates|price|prices|trend|trends|status)\b/i,
    /\b(search online|search internet|look it up|google it|check online|find on the web|browse online)\b/i,
    /\b(search|find|lookup|look up|check|browse)\b.{0,40}\b(web|online|internet|google|website|site)\b/i,
    /\b(web|online|internet|google)\b.{0,40}\b(search|find|lookup|look up|check|browse)\b/i,
    /\b(latest|breaking|current|recent|today|up to date|up-to-date)\b.{0,40}\b(news|price|prices|weather|score|scores|updates?)\b/i,
    /\bwhat('?s| is)\b.{0,30}\b(latest|new|current|today)\b/i,
    /\bcheck\b.{0,30}\b(latest|current|today|recent)\b.{0,30}\b(on|about)\b/i,
    /\b(find|show)\b.{0,30}\b(latest|recent|current)\b.{0,30}\b(news|updates|info|information)\b/i,
    /\bsearch\b.{0,30}\bfor\b/i,
    /\blook\b.{0,30}\bit up\b/i,
  ],
};

function inferChatTypeFromPrompt(prompt: string): ChatType {
  const text = prompt.trim();
  if (!text) return "STANDARD";

  const orderedTypes = [
    "IMAGE_GENERATION",
    "DEEP_RESEARCH",
    "WEB_SEARCH",
  ] as const;
  const scores: Record<(typeof orderedTypes)[number], number> = {
    IMAGE_GENERATION: 0,
    DEEP_RESEARCH: 0,
    WEB_SEARCH: 0,
  };

  for (const type of orderedTypes) {
    if (type === "DEEP_RESEARCH") continue;
    scores[type] = CAPABILITY_PATTERNS[type].reduce((count, pattern) => {
      return count + (pattern.test(text) ? 1 : 0);
    }, 0);
  }

  let bestType: ChatType = "STANDARD";
  let bestScore = 0;
  for (const type of orderedTypes) {
    if (scores[type] > bestScore) {
      bestType = type;
      bestScore = scores[type];
    }
  }

  return bestType;
}

function getAttachmentCategory(fileName: string, mimeType: string) {
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
  if (
    lowerMime === "text/markdown" ||
    lowerMime === "text/x-markdown" ||
    ext === "md"
  ) {
    return "markdown";
  }
  if (lowerMime.startsWith("text/") || ext === "txt") return "text";
  return "other";
}

function getAttachmentVisual(fileName: string, mimeType: string) {
  const category = getAttachmentCategory(fileName, mimeType);
  switch (category) {
    case "image":
      return {
        icon: (
          <ImageIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
        ),
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
        icon: (
          <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
        ),
        chipClass:
          "bg-emerald-50/90 border-emerald-200/80 text-emerald-900 dark:bg-emerald-500/10 dark:border-emerald-400/30 dark:text-emerald-100",
        iconWrapClass: "bg-emerald-100/80 dark:bg-emerald-500/20",
      };
    case "word":
      return {
        icon: (
          <span className="text-[10px] font-extrabold leading-none text-black dark:text-white">
            W
          </span>
        ),
        chipClass:
          "bg-slate-100/90 border-slate-300/80 text-slate-900 dark:bg-slate-800/50 dark:border-slate-600/50 dark:text-slate-100",
        iconWrapClass:
          "bg-white border border-black/20 dark:bg-black dark:border-white/25",
      };
    case "presentation":
      return {
        icon: (
          <span className="text-[10px] font-extrabold leading-none text-black dark:text-white">
            P
          </span>
        ),
        chipClass:
          "bg-fuchsia-50/90 border-fuchsia-200/80 text-fuchsia-900 dark:bg-fuchsia-500/10 dark:border-fuchsia-400/30 dark:text-fuchsia-100",
        iconWrapClass:
          "bg-white border border-black/20 dark:bg-black dark:border-white/25",
      };
    case "markdown":
      return {
        icon: (
          <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        ),
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
        chipClass: "bg-muted border-border/50 text-foreground",
        iconWrapClass: "bg-background/70 dark:bg-muted-foreground/10",
      };
  }
}

export function ChatInput({
  models,
  selectedModels,
  onModelChange,
  maxModels,
  onSend,
  onEnhancePrompt,
  isSending,
  onStopStreaming,
  forceReset,
  initialPrompt,
  onPromptClear,
  draftStorageKey,
  onCapabilityChange,
  chatType: propChatType,
  onGenerateVideoClick,
}: ChatInputProps) {
  const [content, setContent] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [chatType, setChatType] = useState<ChatType>("STANDARD");
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);
  const dragCounterRef = useRef(0);

  // Speech-to-text: track the text that existed before mic was started
  const preExistingTextRef = useRef("");

  const handleSpeechResult = useCallback((transcript: string) => {
    // transcript is the cumulative session text from MicButton
    // Combine with any text that was in the box before recording started
    const prefix = preExistingTextRef.current;
    const separator = prefix && !prefix.endsWith(" ") ? " " : "";
    setContent(prefix + separator + transcript);
  }, []);

  const handleMicStart = useCallback(() => {
    // Save what's in the box right now so speech appends after it
    preExistingTextRef.current = content;
  }, [content]);

  const handleMicStop = useCallback(() => {
    // Nothing needed — content is already set by handleSpeechResult
  }, []);

  useEffect(() => {
    if (propChatType) {
      setChatType(propChatType);
    }
  }, [propChatType]);

  // Hydrate chat type from local storage (on mount or reset)
  useEffect(() => {
    if (forceReset) {
      setChatType("STANDARD");
      localStorage.setItem("preferredChatType", "STANDARD");
    } else {
      const savedType = localStorage.getItem(
        "preferredChatType",
      ) as ChatType | null;
      if (savedType === "DEEP_RESEARCH") {
        setChatType("STANDARD");
        localStorage.setItem("preferredChatType", "STANDARD");
      } else if (
        savedType &&
        ["STANDARD", "IMAGE_GENERATION", "WEB_SEARCH"].includes(savedType)
      ) {
        setChatType(savedType);
      }
    }
  }, [forceReset]);

  // Save chat type changes
  const applyChatType = (type: ChatType, persistPreference: boolean) => {
    setChatType(type);
    if (persistPreference) {
      localStorage.setItem("preferredChatType", type);
    }
    if (onCapabilityChange) {
      onCapabilityChange(type);
    }

    // Identify models that support the new capability
    const validModels = models.filter((m) => {
      if (!m.capabilities || m.capabilities.length === 0)
        return type === "STANDARD";
      return m.capabilities.includes(type);
    });

    // Check currently selected models for compatibility
    const compatibleSelected = selectedModels.filter((id) =>
      validModels.some((vm) => vm.id === id),
    );

    // For specialized modes, we generally want exactly one model selected
    const isSpecialized = type !== "STANDARD";
    const forceSingleModel = isSpecialized;

    if (
      compatibleSelected.length === 0 ||
      (forceSingleModel && compatibleSelected.length > 1)
    ) {
      // Switch to the best single default model for this capability
      const defaultForType = validModels.find((m) =>
        m.defaultForCapabilities?.includes(type),
      );
      if (defaultForType) {
        onModelChange([defaultForType.id]);
      } else if (validModels.length > 0) {
        onModelChange([validModels[0].id]);
      }
    } else if (compatibleSelected.length !== selectedModels.length) {
      // Reduce selected list to only current compatible models
      onModelChange(compatibleSelected);
    }
  };

  const handleChatTypeChange = (type: ChatType) => {
    applyChatType(type, true);
  };

  // Auto-capability detection disabled as per user request to use manual selection.
  // Predictability is prioritized over automation.
  /*
  useEffect(() => {
    const trimmed = content.trim();
    if (!trimmed) return;

    if (!isNewChat) return;

    const inferredType = inferChatTypeFromPrompt(trimmed);
    
    if (inferredType !== chatType) {
      applyChatType(inferredType, false);
    }
  }, [content, chatType, isNewChat]);
  */

  // Automatically enforce VISION capability if image files are attached
  useEffect(() => {
    const hasImageAttachment = attachments.some((a) =>
      a.mimeType.startsWith("image/"),
    );

    if (hasImageAttachment) {
      const validSelectedModels = selectedModels.filter((id) => {
        const m = models.find((m) => m.id === id);
        return m?.capabilities?.includes("VISION");
      });

      if (validSelectedModels.length !== selectedModels.length) {
        if (validSelectedModels.length > 0) {
          onModelChange(validSelectedModels);
        } else {
          // Fallback to the first VISION-capable model
          const fallback = models.find((m) =>
            m.capabilities?.includes("VISION"),
          );
          if (fallback) {
            onModelChange([fallback.id]);
            toast.info(
              `Switched to ${fallback.name} because it supports reading file attachments.`,
            );
          } else {
            toast.warning(
              "No models found that explicitly support file attachments (VISION capability).",
            );
          }
        }
      }
    }
  }, [attachments.length, selectedModels, models, onModelChange]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const resolvedDraftStorageKey = draftStorageKey?.trim();
  const skipNextDraftSaveRef = useRef(false);

  // Detect mobile for Enter key behaviour
  useEffect(() => {
    const check = () =>
      setIsMobile(window.matchMedia("(pointer: coarse)").matches);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!resolvedDraftStorageKey) return;
    skipNextDraftSaveRef.current = true;
    const storedDraft = localStorage.getItem(resolvedDraftStorageKey);
    setContent(storedDraft || "");
  }, [resolvedDraftStorageKey]);

  useEffect(() => {
    if (!resolvedDraftStorageKey) return;
    if (skipNextDraftSaveRef.current) {
      skipNextDraftSaveRef.current = false;
      return;
    }
    if (content) {
      localStorage.setItem(resolvedDraftStorageKey, content);
    } else {
      localStorage.removeItem(resolvedDraftStorageKey);
    }
  }, [content, resolvedDraftStorageKey]);

  useEffect(() => {
    if (textareaRef.current) {
      if (isExpanded) {
        textareaRef.current.style.height = "100%";
        textareaRef.current.style.overflowY = "auto";
      } else {
        textareaRef.current.style.height = "auto";
        const maxHeight = 112;
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxHeight)}px`;
        textareaRef.current.style.overflowY =
          textareaRef.current.scrollHeight > maxHeight ? "auto" : "hidden";
      }
    }
  }, [content, isExpanded]);

  useEffect(() => {
    if (initialPrompt) {
      setContent(initialPrompt);
      if (textareaRef.current) {
        textareaRef.current.focus();
        // Move cursor to end
        const len = initialPrompt.length;
        textareaRef.current.setSelectionRange(len, len);
      }
      onPromptClear?.();
    }
  }, [initialPrompt, onPromptClear]);

  const wasSendingRef = useRef(isSending);
  useEffect(() => {
    if (wasSendingRef.current && !isSending) {
      // Focus input after streaming/sending finishes
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
    wasSendingRef.current = isSending;
  }, [isSending]);

  const handleSubmit = () => {
    if (!content.trim() || isSending) return;
    // Only pass IDs of fully uploaded attachments
    const uploadedIds = attachments
      .filter((a) => !a.uploading)
      .map((a) => a.id);

    // Auto-capability detection disabled as per user request to be fully manual.
    let outgoingChatType = chatType;
    /*
    if (chatType === "STANDARD") {
      const inferred = inferChatTypeFromPrompt(content.trim());
      if (inferred !== "STANDARD") {
        outgoingChatType = inferred;
        // Also update local state so UI reflects it immediately
        applyChatType(inferred, false);
      }
    }
    */

    onSend(
      content.trim(),
      uploadedIds.length > 0 ? uploadedIds : undefined,
      outgoingChatType,
      attachments.filter((a) => !a.uploading),
    );
    setContent("");
    if (resolvedDraftStorageKey) {
      localStorage.removeItem(resolvedDraftStorageKey);
    }
    setEnhancedPrompt("");
    // Revoke any object URLs to avoid memory leaks
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
    setIsExpanded(false);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const handleEnhance = async () => {
    if (
      !onEnhancePrompt ||
      !content.trim() ||
      isSending ||
      isEnhancing ||
      hasUploadingFiles
    )
      return;

    try {
      setIsEnhancing(true);
      const result = await onEnhancePrompt(content.trim());
      const enhanced = result?.enhancedPrompt?.trim();
      if (!enhanced) {
        toast.error("No enhanced prompt returned");
        return;
      }
      setEnhancedPrompt(enhanced);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
        err?.message ||
        "Failed to enhance prompt",
      );
    } finally {
      setIsEnhancing(false);
    }
  };

  const applyEnhancedPrompt = () => {
    if (!enhancedPrompt.trim()) return;
    setContent(enhancedPrompt);
    setEnhancedPrompt("");
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const discardEnhancedPrompt = () => {
    setEnhancedPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // On mobile/touch devices, Enter creates a new line instead of sending
      if (isMobile) return;
      e.preventDefault();
      handleSubmit();
    }
  };

  const uploadFiles = useCallback(
    async (newFiles: File[]) => {
      if (newFiles.length === 0) return;
      if (isSending) return;

      if (attachments.length + newFiles.length > 5) {
        toast.error(
          "You can only attach up to 5 files per message constraint.",
        );
        return;
      }

      for (let file of newFiles) {
        if (file.type.startsWith("image/") && file.size > 2 * 1024 * 1024) {
          try {
            file = await imageCompression(file, {
              maxSizeMB: 2,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            });
          } catch (error) {
            console.error("Image compression error:", error);
            toast.error(`Couldn't compress image "${file.name}".`);
            continue;
          }
        }

        const tempId = Date.now() + Math.random();
        const previewUrl = IMAGE_TYPES.includes(file.type)
          ? URL.createObjectURL(file)
          : undefined;

        const placeholder: UploadedAttachment = {
          id: tempId as any,
          fileName: file.name,
          fileUrl: "",
          mimeType: file.type,
          previewUrl,
          uploading: true,
        };

        setAttachments((prev) => [...prev, placeholder]);

        try {
          const res = await attachmentService.presend(file);
          const data = res.data.data;
          setAttachments((prev) =>
            prev.map((a) =>
              a.id === (tempId as any)
                ? { ...a, id: data.id, fileUrl: data.fileUrl, uploading: false }
                : a,
            ),
          );
        } catch (err: any) {
          toast.error(
            `Failed to upload ${file.name}: ${err?.response?.data?.message || err.message}`,
          );
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setAttachments((prev) =>
            prev.filter((a) => a.id !== (tempId as any)),
          );
        }
      }
    },
    [attachments.length, isSending],
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const newFiles = Array.from(e.target.files);
    e.target.value = "";
    await uploadFiles(newFiles);
  };

  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types || []).includes("Files");

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setIsDragActive(true);
    };

    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      if (!isDragActive) setIsDragActive(true);
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsDragActive(false);
      }
    };

    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragActive(false);
      const files = Array.from(e.dataTransfer?.files || []);
      await uploadFiles(files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [isDragActive, uploadFiles]);

  const removeAttachment = (id: number) => {
    const found = attachments.find((a) => a.id === id);
    if (!found) return;

    if (found.previewUrl) URL.revokeObjectURL(found.previewUrl);

    if (!found.uploading && typeof found.id === "number") {
      attachmentService.delete(found.id).catch((err) => {
        console.error("Failed to delete attachment from server", err);
      });
    }

    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const isSingle = maxModels === 1;

  // In single mode: clicking any model switches to it immediately (no deselect needed)
  const toggleModel = (modelId: number) => {
    if (isSingle) {
      onModelChange([modelId]);
    } else if (selectedModels.includes(modelId)) {
      if (selectedModels.length > 1) {
        onModelChange(selectedModels.filter((id) => id !== modelId));
      }
    } else if (maxModels === -1 || selectedModels.length < maxModels) {
      onModelChange([...selectedModels, modelId]);
    }
  };

  // Single / Multiple mode toggle
  const handleModeToggle = (mode: "single" | "multiple") => {
    if (mode === "single" && maxModels !== 1) {
      // Caller controls maxModels; we just reduce selection to 1
      if (selectedModels.length > 1) {
        onModelChange([selectedModels[0]]);
      }
    }
    // Propagate so parent can flip maxModels; use a custom event for now
    window.dispatchEvent(
      new CustomEvent("ai-colab:mode-change", { detail: { mode } }),
    );
  };

  const selectedModelNames = models
    .filter((m) => selectedModels.includes(m.id))
    .map((m) => m.name)
    .join(", ");

  const typeLabels: Record<ChatType, string> = {
    STANDARD: "Standard",
    DEEP_RESEARCH: "Deep research",
    IMAGE_GENERATION: "Image generation",
    WEB_SEARCH: "Web search",
  };

  const hasUploadingFiles = attachments.some((a) => a.uploading);

  return (
    <>
      {isDragActive && (
        <div className="fixed inset-0 z-[60] pointer-events-none">
          <div className="absolute inset-0 bg-background/70 dark:bg-background/60 backdrop-blur-md backdrop-saturate-150" />
          <div className="absolute shadow-[0_0_0_1px_hsl(var(--primary)/0.15)_inset]" />
          <div className="absolute inset-0 flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-3xl px-8 py-8 text-center animate-in fade-in-0 zoom-in-95 duration-150">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl from-primary/25 via-primary/15 to-transparent text-primary">
                <Upload className="h-7 w-7" />
              </div>
              <p className="text-xl font-semibold tracking-tight text-foreground">
                Add anything
              </p>
              <p className="mt-2 text-sm">
                Drop files anywhere to attach them to your message
              </p>
              <div className="mt-5 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                Max 5 files per message
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="pt-2 pb-6 px-4 w-full">
        <div className="max-w-3xl mx-auto">
          <div
            className={`border border-border/60 bg-background dark:bg-muted/40 flex flex-col focus-within:ring-1 focus-within:ring-primary/20 transition-all ${isExpanded
              ? "fixed inset-0 z-[9999] rounded-none h-[100dvh] pt-4 pb-4 px-4 sm:pt-6 sm:px-6"
              : "relative rounded-[28px] pt-3 pb-3 px-3 max-h-[50vh] md:max-h-[60vh] shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.25),0_0_0_1px_hsl(var(--primary)/0.08)] dark:shadow-[0_4px_24px_-4px_hsl(var(--primary)/0.35),0_0_0_1px_hsl(var(--primary)/0.15)]"
              }`}
            data-guide="chat-input-area"
          >
            {isExpanded && (
              <div className="flex justify-between items-center pb-3 mb-2 border-b border-border/50 shrink-0">
                <span className="text-sm font-medium text-muted-foreground">
                  Draft Message
                </span>
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted rounded-full transition-colors"
                >
                  <Minimize2 className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Scrollable Context Area */}
            <div
              className={`flex flex-col gap-1 overflow-y-auto custom-scrollbar min-h-0 ${isExpanded ? "hidden" : ""}`}
            >
              {/* Top Row: Chat Type Pill */}
              {chatType !== "STANDARD" && (
                <div className="flex items-center mb-1 px-2 mt-1 flex-shrink-0">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium border border-primary/20 shadow-sm animate-in fade-in zoom-in-95">
                    {chatType === "WEB_SEARCH" && (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    {chatType === "DEEP_RESEARCH" && (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {chatType === "IMAGE_GENERATION" && (
                      <ImageIcon className="w-3.5 h-3.5" />
                    )}
                    {typeLabels[chatType]}
                    <button
                      onClick={() => handleChatTypeChange("STANDARD")}
                      className="ml-1 opacity-70 hover:opacity-100 hover:text-primary transition-opacity"
                      title="Clear type"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Selected model chip(s) — shown for single selection too, so the
                  active model is always visible in the bar, not just in multi
                  mode. This row is the ONLY trigger for the Models modal —
                  click any chip (or the placeholder) to open it. */}
              <div
                data-guide="model-capability-trigger"
                className={`flex gap-1.5 px-2 mb-1 mt-1 flex-shrink-0 ${
                  !isSingle && selectedModels.length > 1
                    ? "flex-nowrap overflow-x-auto scrollbar-thin"
                    : "flex-wrap"
                }`}
              >
                {selectedModels.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setModelsModalOpen(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-muted text-muted-foreground rounded-full text-xs font-medium border border-border/40 hover:bg-muted/80 hover:text-foreground transition-colors flex-shrink-0"
                  >
                    Select model
                  </button>
                ) : (
                  models
                    .filter((m) => selectedModels.includes(m.id))
                    .map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        onClick={() => setModelsModalOpen(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium border border-primary/20 flex-shrink-0 hover:bg-primary/15 transition-colors animate-in fade-in-0 slide-in-from-left-1 duration-200"
                        title="Change model"
                      >
                        {model.externalId && getModelIcon(model.externalId) ? (
                          <img
                            src={getModelIcon(model.externalId)!}
                            alt=""
                            className="w-3.5 h-3.5 rounded-sm object-contain"
                          />
                        ) : null}
                        <span className="max-w-[120px] truncate">
                          {model.name}
                        </span>
                        {selectedModels.length > 1 && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              onModelChange(
                                selectedModels.filter((id) => id !== model.id),
                              );
                            }}
                            className="ml-0.5 opacity-60 hover:opacity-100 transition-opacity"
                            title={`Remove ${model.name}`}
                          >
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    ))
                )}
                {selectedModels.length > 1 && (
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0.5 h-5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                  >
                    {selectedModels.length} models
                  </Badge>
                )}
              </div>

              {/* Attachment previews */}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-2 mb-2 mt-1 flex-shrink-0">
                  {attachments.map((att) => {
                    const visual = getAttachmentVisual(
                      att.fileName,
                      att.mimeType,
                    );
                    return (
                      <div
                        key={att.id}
                        className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs border group max-w-[200px] ${visual.chipClass}`}
                      >
                        {/* Image thumbnail or icon */}
                        {att.previewUrl ? (
                          <img
                            src={att.previewUrl}
                            alt={att.fileName}
                            className="w-8 h-8 rounded-md object-cover flex-shrink-0"
                          />
                        ) : (
                          <div
                            className={`flex-shrink-0 rounded-md p-1 ${visual.iconWrapClass}`}
                          >
                            {visual.icon}
                          </div>
                        )}

                        <div className="flex flex-col min-w-0">
                          <span className="truncate max-w-[120px] font-medium leading-tight">
                            {att.fileName}
                          </span>
                          {att.uploading && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />{" "}
                              Uploading…
                            </span>
                          )}
                        </div>

                        {/* Remove button */}
                        <button
                          onClick={() => removeAttachment(att.id)}
                          className="absolute -top-1.5 -right-1.5 z-10 h-5 w-5 rounded-full border border-white/30 bg-black text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow-sm dark:border-white/40 dark:bg-black dark:text-white"
                          title="Remove"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {enhancedPrompt && (
                <div className="mx-2 mb-2 mt-1 rounded-2xl border border-primary/20 bg-primary/5 p-3 sm:p-4 flex-shrink-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 w-full">
                      <p className="text-xs font-semibold text-primary mb-1">
                        Enhanced prompt preview
                      </p>
                      <div className="max-h-[100px] sm:max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                        <p className="whitespace-pre-wrap break-words text-sm text-foreground leading-relaxed">
                          {enhancedPrompt}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 rounded-full px-3"
                      onClick={applyEnhancedPrompt}
                    >
                      Use this prompt
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 rounded-full px-3"
                      onClick={discardEnhancedPrompt}
                    >
                      Keep original
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Full-width Textarea Row */}
            <div
              className={`flex gap-2 pb-1 flex-shrink-0 px-1 relative min-w-0 ${isExpanded ? "flex-1 items-stretch min-h-0" : "items-end"}`}
            >
              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_TYPES}
                className="hidden"
                onChange={handleFileChange}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />

              <div
                className={`flex-1 flex min-w-0 relative ${isExpanded ? "h-full items-stretch min-h-0" : "items-start"}`}
              >
                <Textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  maxLength={50000}
                  rows={1}
                  className={`border-0 focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none bg-transparent dark:bg-transparent resize-none p-0 flex-1 min-w-0 min-h-[40px] leading-relaxed py-2.5 text-[15px] overflow-y-auto ${isExpanded
                    ? "max-h-full h-full text-[16px] sm:text-[15px]"
                    : "max-h-[120px] self-center pr-5"
                    }`}
                  data-guide="chat-input"
                />

                {!isExpanded &&
                  (content.length > 80 || content.split("\n").length >= 3) && (
                    <button
                      type="button"
                      onClick={() => setIsExpanded(true)}
                      className="absolute top-1 right-0 p-0 text-muted-foreground/40 hover:text-foreground transition-colors z-10 sm:hidden"
                      title="Expand input"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  )}
              </div>
            </div>

            <div
              className={`flex items-center mt-1 px-1 ${isExpanded ? "justify-end" : ""}`}
              data-guide="composer-actions"
            >
              <div
                className={`flex items-center gap-1 flex-1 ${isExpanded ? "hidden" : "flex"}`}
              >
                <DropdownMenu open={attachMenuOpen} onOpenChange={setAttachMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-8 w-8 text-muted-foreground bg-muted hover:bg-muted/80 hover:text-foreground rounded-full border border-border/40"
                      disabled={isSending}
                      data-guide="attach"
                      title="Attach a file"
                    >
                      <Paperclip className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-56 p-2 rounded-xl z-[9500]"
                    style={{ zIndex: 9500 }}
                  >
                    <DropdownMenuLabel className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1 px-2">
                      Attach File
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      className="gap-2 focus:bg-muted cursor-pointer rounded-md py-2"
                      onClick={() => cameraInputRef.current?.click()}
                    >
                      <div className="w-4 flex justify-center">
                        <Camera className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <span>Capture Photo</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 focus:bg-muted cursor-pointer rounded-md py-2"
                      onClick={() => photoInputRef.current?.click()}
                    >
                      <div className="w-4 flex justify-center">
                        <ImageIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <span>Upload a Photo</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="gap-2 focus:bg-muted cursor-pointer rounded-md py-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <div className="w-4 flex justify-center">
                        <Paperclip className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <span>Upload a File</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Single / Multi mode toggle — "Single" / "Multi" on all sizes */}
                <div className="flex items-center ml-2 bg-muted/60 border border-border/40 rounded-full p-0.5 gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => handleModeToggle("single")}
                    className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all duration-150 ${isSingle
                      ? "bg-white dark:bg-background shadow text-foreground dark:text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                      }`}
                    title="Single model mode"
                  >
                    Single
                  </button>
                  <button
                    onClick={() => handleModeToggle("multiple")}
                    className={`h-7 px-2.5 rounded-full text-xs font-medium transition-all duration-150 ${!isSingle
                      ? "bg-white dark:bg-background shadow text-foreground dark:text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                      }`}
                    title="Multi-model comparison mode"
                  >
                    Multi
                  </button>
                </div>

                {/* Spacer */}
                <div className="flex-1" />
              </div>

              {/* Separator */}
              {!isExpanded && (
                <div className="h-6 w-px bg-border/60 mx-1 flex-shrink-0" />
              )}

              {/* RIGHT: Enhance · Mic (always visible) · Send */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-9 rounded-full px-2 text-xs font-medium ${isExpanded ? "hidden" : ""}`}
                  onClick={handleEnhance}
                  disabled={
                    !content.trim() ||
                    isSending ||
                    isEnhancing ||
                    hasUploadingFiles ||
                    !onEnhancePrompt
                  }
                  title={
                    hasUploadingFiles
                      ? "Wait for files to finish uploading"
                      : "Enhance prompt"
                  }
                  data-guide="enhance"
                >
                  {isEnhancing ? (
                    <Loader2 className="h-3.5 w-3.5 sm:mr-1.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 sm:mr-1.5" />
                  )}
                  <span className="hidden sm:inline">Enhance</span>
                </Button>

                {/* Conversation AI — opens the full-screen voice modal */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 ${isExpanded ? "hidden" : ""}`}
                  onClick={() => setIsVoiceOpen(true)}
                  title="Talk to your AI"
                  data-guide="voice"
                >
                  <AudioLines className="h-4.5 w-4.5" />
                </Button>

                {/* Mic — conditionally hidden in full screen */}
                <div className={isExpanded ? "hidden" : ""}>
                  <MicButton
                    onResult={handleSpeechResult}
                    onStart={handleMicStart}
                    onStop={handleMicStop}
                    hasText={false}
                    guideId="mic"
                  />
                </div>

                <Button
                  type="button"
                  size="icon"
                  className={`h-10 w-10 rounded-full transition-all duration-200 ${isSending
                    ? "bg-destructive/90 text-white hover:bg-destructive shadow-md scale-100"
                    : content.trim() && !hasUploadingFiles
                      ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md scale-100"
                      : "bg-muted text-muted-foreground border border-border/50 scale-100"
                    }`}
                  onClick={isSending ? onStopStreaming : handleSubmit}
                  disabled={
                    !isSending && (!content.trim() || hasUploadingFiles)
                  }
                  title={
                    isSending
                      ? "Stop generating"
                      : hasUploadingFiles
                        ? "Wait for files to finish uploading"
                        : "Send message"
                  }
                >
                  {isSending ? (
                    <Square className="w-4 h-4 fill-current" />
                  ) : (
                    <ArrowUp className="w-5 h-5" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Quick capability switcher — shortcuts into the same chatType
              state/handler as the "+" menu's Capabilities section. */}
          {!isExpanded && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-3">
              {(
                [
                  { type: "STANDARD" as const, label: "Chat", icon: MessageSquare },
                  { type: "WEB_SEARCH" as const, label: "Web Search", icon: Search },
                  { type: "IMAGE_GENERATION" as const, label: "Image Gen", icon: ImageIcon },
                ]
              ).map(({ type, label, icon: Icon }) => {
                const active = chatType === type;
                return (
                  <motion.button
                    key={type}
                    type="button"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => {
                      handleChatTypeChange(type);
                      window.dispatchEvent(
                        new Event("ai-colab:capability-selected"),
                      );
                    }}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                      active
                        ? "bg-violet-200/70 text-violet-900 border-violet-200 dark:bg-violet-500/20 dark:text-violet-200 dark:border-violet-500/30 shadow-sm"
                        : "bg-background/70 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </motion.button>
                );
              })}
              {onGenerateVideoClick && (
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onGenerateVideoClick}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer bg-background/70 text-muted-foreground border-border/50 hover:bg-muted hover:text-foreground"
                >
                  <Film className="w-3.5 h-3.5" />
                  Video Gen
                </motion.button>
              )}
            </div>
          )}
        </div>
      </div>
      <VoiceModal open={isVoiceOpen} onClose={() => setIsVoiceOpen(false)} />
      <ModelsModal
        open={modelsModalOpen}
        onOpenChange={(next) => {
          setModelsModalOpen(next);
          window.dispatchEvent(
            new Event(
              next
                ? "ai-colab:capability-menu-opened"
                : "ai-colab:capability-menu-closed",
            ),
          );
        }}
        models={models}
        selectedModels={selectedModels}
        isSingle={isSingle}
        onToggleModel={toggleModel}
        chatType={chatType}
        onChatTypeChange={handleChatTypeChange}
        hasImageAttachment={attachments.some((a) =>
          a.mimeType.startsWith("image/"),
        )}
      />
    </>
  );
}
