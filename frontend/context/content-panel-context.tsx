"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { useDocumentPanel } from "@/context/document-panel-context";

export interface ContentItem {
  id: number;
  type: string;
  platform: string | null;
  title: string;
  status: string;
  currentVersion?: number;
  /** Message payloads (SSE) call this `version`. */
  version?: number;
  body: Record<string, any>;
}

interface ContentPanelContextValue {
  isOpen: boolean;
  activeItem: ContentItem | null;
  /** Latest known copy of any item edited or regenerated this session. */
  overrides: Record<number, ContentItem>;
  openContentPanel: (item: ContentItem) => void;
  closeContentPanel: () => void;
  /** Records a fresher copy so cards in the transcript update too. */
  applyItem: (item: ContentItem) => void;
}

const ContentPanelContext = createContext<ContentPanelContextValue | null>(null);

/**
 * Sits inside DocumentPanelProvider: only one side panel can be open at once,
 * so opening a content item closes the document preview.
 */
export function ContentPanelProvider({ children }: { children: React.ReactNode }) {
  const { closeDocumentPanel } = useDocumentPanel();
  const [isOpen, setIsOpen] = useState(false);
  const [activeItem, setActiveItem] = useState<ContentItem | null>(null);
  const [overrides, setOverrides] = useState<Record<number, ContentItem>>({});

  const openContentPanel = useCallback(
    (item: ContentItem) => {
      closeDocumentPanel();
      setActiveItem(item);
      setIsOpen(true);
    },
    [closeDocumentPanel],
  );

  const closeContentPanel = useCallback(() => setIsOpen(false), []);

  const applyItem = useCallback((item: ContentItem) => {
    setOverrides((prev) => ({ ...prev, [item.id]: item }));
    setActiveItem((prev) => (prev && prev.id === item.id ? item : prev));
  }, []);

  const value = useMemo(
    () => ({ isOpen, activeItem, overrides, openContentPanel, closeContentPanel, applyItem }),
    [isOpen, activeItem, overrides, openContentPanel, closeContentPanel, applyItem],
  );

  return (
    <ContentPanelContext.Provider value={value}>
      {children}
    </ContentPanelContext.Provider>
  );
}

export function useContentPanel(): ContentPanelContextValue {
  const ctx = useContext(ContentPanelContext);
  if (!ctx) {
    throw new Error("useContentPanel must be used within a ContentPanelProvider");
  }
  return ctx;
}
