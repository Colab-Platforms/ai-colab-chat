"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Brain, Check } from "lucide-react";
import { contextService, chatService, folderService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { ContextModal } from "@/components/contexts/ContextModal";
import { getRouteUiSnapshot } from "@/lib/route-ui-store";

const MAX_CHARS = 500;

interface Pos { x: number; y: number; text: string }

export function SelectionContextTooltip() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<any>(null);
  const [folders, setFolders] = useState<any[]>([]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px), (pointer: coarse)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  /** Recalculate tooltip position from the live selection rect */
  const updatePos = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim() ?? "";

    if (!text || !selection || selection.rangeCount === 0) {
      setPos(null);
      setSaved(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const anchor = range.commonAncestorContainer as Element;
    const el = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;

    if (!el?.closest("[data-message-text]")) {
      setPos(null);
      return;
    }

    const rect = range.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 16, Math.max(16, rect.left + rect.width / 2));
    const y = isMobile ? rect.bottom + 12 : rect.top - 10;
    setPos({ text, x, y });
    setSaved(false);
  }, [isMobile]);

  useEffect(() => {
    document.addEventListener("mouseup", updatePos);
    document.addEventListener("touchend", updatePos, { passive: true });
    document.addEventListener("selectionchange", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      document.removeEventListener("mouseup", updatePos);
      document.removeEventListener("touchend", updatePos);
      document.removeEventListener("selectionchange", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [updatePos]);

  // Dismiss when clicking outside the tooltip (and selection is gone)
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (tooltipRef.current?.contains(e.target as Node)) return;
      setTimeout(() => {
        if (!window.getSelection()?.toString().trim()) {
          setPos(null);
          setSaved(false);
        }
      }, 50);
    };
    const onTouchStart = (e: TouchEvent) => {
      if (tooltipRef.current?.contains(e.target as Node)) return;
      setTimeout(() => {
        if (!window.getSelection()?.toString().trim()) {
          setPos(null);
          setSaved(false);
        }
      }, 50);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("touchstart", onTouchStart);
    };
  }, []);

  const handleOpenModal = async () => {
    if (!pos || pos.text.length > MAX_CHARS || saving || saved) return;
    setSaving(true);
    
    // shorter title like first some characters or 1st line kind of thing in title just like chat
    const firstLine = pos.text.split('\n')[0].trim();
    const title = firstLine.substring(0, 40) + (firstLine.length > 40 ? "..." : "");

    try {
      const foldersRes = await folderService.list();
      const loadedFolders = foldersRes.data?.data || [];
      setFolders(loadedFolders);

      let folderId = null;
      const activeChatId = getRouteUiSnapshot().activeChatId;
      if (activeChatId) {
        try {
          const chatRes = await chatService.getById(activeChatId);
          folderId = chatRes.data?.data?.folderId || null;
        } catch (e) {}
      }

      setModalData({
        title: title,
        memory: pos.text,
        type: folderId ? "FOLDER" : "GLOBAL",
        folderId: folderId ? String(folderId) : "none",
        isAutoSelected: folderId ? false : true,
      });

      setIsModalOpen(true);
      window.getSelection()?.removeAllRanges();
      setPos(null);
    } catch (error) {
      toast.error("Failed to prepare context save.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveModal = async (data: any) => {
    setSaving(true);
    try {
      const created = await contextService.create({
        ...data,
        isAutoSelected: data.type === "GLOBAL" ? data.isAutoSelected : false,
      });
      const createdContextId = created.data?.data?.id;

      const activeChatId = getRouteUiSnapshot().activeChatId;
      if (activeChatId && createdContextId) {
        const selectedRes = await chatService.getContexts(activeChatId);
        const currentIds = selectedRes.data?.data?.contextIds || [];
        const nextIds = Array.from(new Set([...currentIds, createdContextId]));
        await chatService.replaceContexts(activeChatId, nextIds);
      }

      toast.success("Saved to memory!");
      setIsModalOpen(false);
      window.dispatchEvent(new CustomEvent("contexts-updated"));
    } catch (error: any) {
      const msg = error.response?.data?.error || "Failed to save.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!pos && !isModalOpen) return null;

  const overLimit = pos ? pos.text.length > MAX_CHARS : false;
  const over = pos ? pos.text.length - MAX_CHARS : 0;

  return (
    <>
      <ContextModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveModal}
        initialData={modalData}
        folders={folders}
        isSaving={saving}
        mode="create"
      />

      {pos && (
        <div
          ref={tooltipRef}
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: pos.x,
            top: pos.y,
            transform: isMobile ? "translate(-50%, 0)" : "translate(-50%, -100%)",
          }}
        >
          <button
            onClick={handleOpenModal}
            disabled={overLimit || saving || saved}
            className={[
              "pointer-events-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium",
              "shadow-md border transition-all duration-150 select-none whitespace-nowrap",
              saved
                ? "bg-emerald-500 border-emerald-400 text-white cursor-default"
                : overLimit
                ? "bg-background/95 border-border/60 text-muted-foreground cursor-not-allowed"
                : "bg-foreground border-foreground/20 text-background hover:opacity-90 cursor-pointer",
            ].join(" ")}
          >
            {saved ? (
              <>
                <Check className="w-3 h-3 shrink-0" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Brain className="w-3 h-3 shrink-0" style={{ opacity: overLimit ? 0.4 : 1 }} />
                <span>
                  {saving
                    ? "Saving…"
                    : overLimit
                    ? `Limit ${MAX_CHARS} chars (Remove ${over})`
                    : `Save to memory (${pos.text.length}/${MAX_CHARS})`}
                </span>
              </>
            )}
          </button>

          {!isMobile && (
            <div
              className={[
                "absolute left-1/2 -translate-x-1/2 top-full w-0 h-0",
                "border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px]",
                saved ? "border-t-emerald-500" : overLimit ? "border-t-border/60" : "border-t-foreground",
              ].join(" ")}
            />
          )}
        </div>
      )}
    </>
  );
}
