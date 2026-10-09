"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { GeneratedDocument } from "@/components/chat/document-card";
import { documentService } from "@/lib/services";

interface DocumentPanelContextValue {
  isOpen: boolean;
  activeDocument: GeneratedDocument | null;
  openDocumentPanel: (doc: GeneratedDocument) => void;
  closeDocumentPanel: () => void;
  updateActiveDocument: (doc: GeneratedDocument) => void;
}

const DocumentPanelContext = createContext<DocumentPanelContextValue | null>(
  null,
);

// A full page reload remounts this provider and loses React state — persist
// only *which* document was open so a reload restores the same view, not the
// document content itself (that's refetched fresh via `getById`).
const STORAGE_KEY = "document-panel:last-open";

const readStoredDocumentId = (): number | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.id === "number" ? parsed.id : null;
  } catch {
    return null;
  }
};

const writeStoredDocumentId = (id: number | null) => {
  try {
    if (id === null) {
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id }));
    }
  } catch {
    // Private browsing / storage disabled — the panel just won't survive a
    // reload, which is no worse than before this existed.
  }
};

/**
 * One panel per app shell, not per chat — a chat can only usefully preview
 * one document at a time, and keeping this above the chat page (in
 * ChatLayoutView) means the panel survives whatever the chat page itself
 * re-renders.
 */
export function DocumentPanelProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeDocument, setActiveDocument] =
    useState<GeneratedDocument | null>(null);

  const openDocumentPanel = useCallback((doc: GeneratedDocument) => {
    setActiveDocument(doc);
    setIsOpen(true);
    writeStoredDocumentId(doc.id);
  }, []);

  const closeDocumentPanel = useCallback(() => {
    setIsOpen(false);
    writeStoredDocumentId(null);
  }, []);

  // Applies a fresher copy (e.g. after a poll tick or a style edit) without
  // reopening the panel if the user already closed it.
  const updateActiveDocument = useCallback((doc: GeneratedDocument) => {
    setActiveDocument((prev) => (prev && prev.id === doc.id ? doc : prev));
  }, []);

  // Runs once on mount: re-fetches the last-open document (if any) so a
  // reload shows the same panel instead of losing it, but with fresh
  // status/fileUrl rather than a stale snapshot from before the reload.
  useEffect(() => {
    const id = readStoredDocumentId();
    if (id === null) return;
    let cancelled = false;
    documentService
      .getById(id)
      .then((res) => {
        if (!cancelled && res.data?.data) {
          setActiveDocument(res.data.data);
          setIsOpen(true);
        }
      })
      .catch(() => writeStoredDocumentId(null));
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      activeDocument,
      openDocumentPanel,
      closeDocumentPanel,
      updateActiveDocument,
    }),
    [isOpen, activeDocument, openDocumentPanel, closeDocumentPanel, updateActiveDocument],
  );

  return (
    <DocumentPanelContext.Provider value={value}>
      {children}
    </DocumentPanelContext.Provider>
  );
}

export function useDocumentPanel(): DocumentPanelContextValue {
  const ctx = useContext(DocumentPanelContext);
  if (!ctx) {
    throw new Error(
      "useDocumentPanel must be used within a DocumentPanelProvider",
    );
  }
  return ctx;
}
