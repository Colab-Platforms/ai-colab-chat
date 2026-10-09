"use client";

import { memo, type Dispatch, type ElementType, type SetStateAction } from "react";
import * as LucideIcons from "lucide-react";
import { Bot, ChevronRight } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import type { Assistant } from "@/components/sidebar/sidebar-types";
import { getAssistantLook } from "@/components/chat/assistant-theme";
import { lift } from "@/components/chat/assistant-hero";

export const AssistantsSection = memo(function AssistantsSection({
  assistants,
  assistantsExpanded,
  setAssistantsExpanded,
  assistantsHasMore,
  onLoadMoreAssistants,
  onAssistantSelected,
}: {
  assistants: Assistant[];
  assistantsExpanded: boolean;
  setAssistantsExpanded: Dispatch<SetStateAction<boolean>>;
  assistantsHasMore?: boolean;
  onLoadMoreAssistants?: () => void;
  onAssistantSelected: (assistant: Assistant) => void;
}) {
  const { theme } = useTheme();

  if (assistants.length === 0) return null;

  return (
    <>
      <button
        type="button"
        data-guide="assistants"
        onClick={() => setAssistantsExpanded((p) => !p)}
        aria-expanded={assistantsExpanded}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] text-foreground transition-colors cursor-pointer hover:bg-sidebar-accent"
      >
        <Bot className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="truncate">Assistants</span>
        <ChevronRight
          className={`ml-auto h-3.5 w-3.5 text-faint transition-transform ${assistantsExpanded ? "rotate-90" : ""}`}
        />
      </button>
      {assistantsExpanded && assistants.map((assistant) => {
        const IconComponent =
          (LucideIcons as unknown as Record<string, ElementType>)[assistant.icon] || Bot;
        const iconColor = lift(getAssistantLook(assistant).color, theme === "dark");

        return (
          <button
            key={assistant.id}
            onClick={() => onAssistantSelected(assistant)}
            className="w-full flex items-center gap-2 pl-9 pr-3 py-1.5 rounded-lg text-[13px] transition-colors cursor-pointer hover:bg-sidebar-accent text-foreground"
            title={assistant.description || assistant.name}
          >
            <IconComponent
              className="w-4 h-4 flex-shrink-0"
              style={{ color: iconColor }}
              aria-hidden="true"
            />
            <span className="truncate flex-1 text-left">{assistant.name}</span>
          </button>
        );
      })}
    </>
  );
}, (prev, next) => {
  if (prev.assistantsExpanded !== next.assistantsExpanded) return false;
  if (Boolean(prev.assistantsHasMore) !== Boolean(next.assistantsHasMore)) return false;
  if (prev.onLoadMoreAssistants !== next.onLoadMoreAssistants) return false;
  if (prev.onAssistantSelected !== next.onAssistantSelected) return false;
  if (prev.assistants.length !== next.assistants.length) return false;

  for (let i = 0; i < prev.assistants.length; i += 1) {
    const a = prev.assistants[i];
    const b = next.assistants[i];
    if (
      a.id !== b.id ||
      a.name !== b.name ||
      a.icon !== b.icon ||
      a.description !== b.description ||
      a.isActive !== b.isActive
    ) {
      return false;
    }
  }
  return true;
});
