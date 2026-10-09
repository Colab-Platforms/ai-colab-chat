"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { messageService } from "@/lib/services";
import { MessageList } from "@/components/chat/message-list";
import { Star } from "lucide-react";
import { toast } from "@/lib/toast";

interface StarredResponse {
  id: number;
  content: string;
  status: string;
  isLiked?: boolean | null;
  isStarred: boolean;
  createdAt: string;
  model: { id: number; name: string };
  chat: { id: number; title: string | null };
  message: { id: number; createdAt: string };
}

interface MessageItem {
  id: number;
  role: string;
  content: string;
  createdAt: string;
  modelResponses: {
    id: number;
    content: string;
    status: string;
    model: { id: number; name: string };
    isLiked: boolean | null;
    isStarred: boolean;
    tokensUsed: number | null;
  }[];
  sourceChatId: number;
  sourceChatTitle: string | null;
}

export default function StarredPage() {
  const [loading, setLoading] = useState(true);
  const [responses, setResponses] = useState<StarredResponse[]>([]);
  const [activeModelTabs, setActiveModelTabs] = useState<Record<number, number>>({});

  const fetchStarred = useCallback(async () => {
    try {
      const res = await messageService.listStarred({ page: "1", pageSize: "200" });
      const rows = res.data.data?.data || [];
      setResponses(rows);
      const tabs: Record<number, number> = {};
      rows.forEach((row: StarredResponse) => {
        tabs[row.id] = row.model.id;
      });
      setActiveModelTabs(tabs);
    } catch {
      toast.error("Failed to load starred messages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStarred();
  }, [fetchStarred]);

  const messages = useMemo<MessageItem[]>(
    () =>
      responses.map((row) => ({
        id: row.id,
        role: "ASSISTANT",
        content: row.content || "",
        createdAt: row.createdAt,
        sourceChatId: row.chat.id,
        sourceChatTitle: row.chat.title,
        modelResponses: [
          {
            id: row.id,
            content: row.content,
            status: row.status,
            model: row.model,
            isLiked: row.isLiked ?? null,
            isStarred: row.isStarred,
            tokensUsed: null,
          },
        ],
      })),
    [responses]
  );

  const handleToggleStar = async (responseId: number, isStarred: boolean) => {
    const prev = responses;
    setResponses((current) =>
      current
        .map((item) =>
          item.id === responseId ? { ...item, isStarred } : item
        )
        .filter((item) => item.isStarred)
    );

    try {
      await messageService.starResponse(responseId, isStarred);
    } catch {
      setResponses(prev);
      toast.error("Failed to update starred state");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center max-w-sm">
            <Star className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-sm font-semibold">No starred messages yet</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Star a response from any chat and it will appear here.
            </p>
          </div>
        </div>
      ) : (
        <MessageList
          messages={messages}
          activeModelTabs={activeModelTabs}
          onModelTabChange={(messageId, modelId) =>
            setActiveModelTabs((prev) => ({ ...prev, [messageId]: modelId }))
          }
          showSelectionTooltip={false}
          onToggleStar={handleToggleStar}
        />
      )}
    </div>
  );
}
