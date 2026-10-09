"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, AudioLines, PhoneCall } from "lucide-react";
import { chatService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { MarkdownRenderer } from "@/components/chat/markdown-renderer";
import { DocumentCard, type GeneratedDocument } from "@/components/chat/document-card";

const VoiceModal = dynamic(
  () =>
    import("@/components/chat/voice-modal").then((m) => ({
      default: m.VoiceModal,
    })),
  { ssr: false, loading: () => null },
);

interface VoiceMessage {
  id: number;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
}

type TimelineItem =
  | { type: "message"; createdAt: string; data: VoiceMessage }
  | { type: "document"; createdAt: string; data: GeneratedDocument & { createdAt: string } };

export default function VoiceChatTranscriptPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = Number(params.chatId);

  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<VoiceMessage[]>([]);
  const [documents, setDocuments] = useState<(GeneratedDocument & { createdAt: string })[]>([]);
  const [isVoiceOpen, setIsVoiceOpen] = useState(false);

  const fetchChat = useCallback(async () => {
    try {
      const res = await chatService.getById(chatId);
      const chat = res.data.data;
      setTitle(chat.title);
      setMessages(
        (chat.messages || []).filter((m: VoiceMessage) => m.role !== "SYSTEM"),
      );
      setDocuments(chat.generatedDocuments || []);
    } catch {
      toast.error("Failed to load voice chat");
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    if (!Number.isNaN(chatId)) fetchChat();
  }, [chatId, fetchChat]);

  // Poll while any document is still generating, so a card flips from
  // "generating" to "ready" without the user having to refresh — mirrors
  // what DocumentCard itself does per-card, just also refreshing the list
  // in case a *new* document was created by the model mid-call.
  useEffect(() => {
    const hasWorking = documents.some(
      (d) => d.status === "PENDING" || d.status === "PROCESSING",
    );
    if (!hasWorking) return;
    const timer = setInterval(fetchChat, 4000);
    return () => clearInterval(timer);
  }, [documents, fetchChat]);

  const handleCloseCall = () => {
    setIsVoiceOpen(false);
    fetchChat();
  };

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...messages.map((m) => ({ type: "message" as const, createdAt: m.createdAt, data: m })),
      ...documents.map((d) => ({ type: "document" as const, createdAt: d.createdAt, data: d })),
    ];
    return items.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [messages, documents]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => router.push("/voice")}
            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Back to Voice Chats"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-lg font-semibold truncate">{title || "Voice Chat"}</h1>
        </div>
        <button
          onClick={() => setIsVoiceOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          <PhoneCall className="w-4 h-4" />
          Continue Call
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : timeline.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <AudioLines className="w-8 h-8 text-muted-foreground mb-3" />
            <h2 className="text-sm font-semibold">No messages yet</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Continue the call to start talking with ColabAI.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto py-6 px-4 flex flex-col gap-4">
            {timeline.map((item) =>
              item.type === "message" ? (
                <div
                  key={`m-${item.data.id}`}
                  className={`flex ${item.data.role === "USER" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                      item.data.role === "USER"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <MarkdownRenderer content={item.data.content} />
                  </div>
                </div>
              ) : (
                <div key={`d-${item.data.id}`} className="flex justify-start">
                  <div className="max-w-[80%] w-full sm:w-80">
                    <DocumentCard document={item.data} />
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <VoiceModal open={isVoiceOpen} onClose={handleCloseCall} chatId={chatId} />
    </div>
  );
}
