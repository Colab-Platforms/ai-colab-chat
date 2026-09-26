"use client";

import { useMemo, useState } from "react";
import { Search, Check, Loader2, Brain, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getModelIcon } from "@/lib/model-icons";
import { useContextPicker } from "@/components/chat/use-context-picker";

interface Model {
  id: number;
  name: string;
  description: string | null;
  capabilities?: string[];
  externalId?: string;
  defaultForCapabilities?: string[];
  tokenMultiplier?: number;
}

type ChatType =
  | "STANDARD"
  | "DEEP_RESEARCH"
  | "IMAGE_GENERATION"
  | "WEB_SEARCH";

type ModalTab = ChatType | "CONTEXT";

interface ModelsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: Model[];
  selectedModels: number[];
  isSingle: boolean;
  onToggleModel: (modelId: number) => void;
  chatType: ChatType;
  onChatTypeChange: (type: ChatType) => void;
  hasImageAttachment: boolean;
}

const TABS: { type: ModalTab; label: string }[] = [
  { type: "STANDARD", label: "Standard Chat" },
  { type: "WEB_SEARCH", label: "Web Search" },
  { type: "IMAGE_GENERATION", label: "Image Generation" },
  { type: "CONTEXT", label: "Context" },
];

export function ModelsModal({
  open,
  onOpenChange,
  models,
  selectedModels,
  isSingle,
  onToggleModel,
  chatType,
  onChatTypeChange,
  hasImageAttachment,
}: ModelsModalProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ModalTab>(chatType);
  const [search, setSearch] = useState("");

  // Keep activeTab in sync with the chatType prop (unless the user is on the
  // Context tab, which has no chatType counterpart), and reset the search
  // box each time the modal is freshly opened — derived during render
  // (rather than in an effect) to avoid an extra cascading render.
  const [prevChatType, setPrevChatType] = useState(chatType);
  if (chatType !== prevChatType) {
    setPrevChatType(chatType);
    if (activeTab !== "CONTEXT") setActiveTab(chatType);
  }

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setSearch("");
  }

  const {
    loading: contextLoading,
    contexts,
    selectedIds: selectedContextIds,
    toggleContext,
  } = useContextPicker();

  const { regularModels, freeModels } = useMemo(() => {
    const effectiveType = activeTab === "CONTEXT" ? chatType : (activeTab as ChatType);
    const term = search.trim().toLowerCase();

    const selectable = models
      .filter(
        (m) =>
          !m.capabilities ||
          m.capabilities.length === 0 ||
          m.capabilities.includes(effectiveType),
      )
      .filter(
        (m) =>
          !hasImageAttachment ||
          (m.capabilities && m.capabilities.includes("VISION")),
      )
      .filter(
        (m) =>
          !term ||
          m.name.toLowerCase().includes(term) ||
          (m.description ?? "").toLowerCase().includes(term),
      );

    return {
      regularModels: selectable.filter((m) => m.tokenMultiplier !== 0),
      freeModels: selectable.filter((m) => m.tokenMultiplier === 0),
    };
  }, [models, activeTab, chatType, hasImageAttachment, search]);

  const handleTabClick = (type: ModalTab) => {
    setActiveTab(type);
    if (type !== "CONTEXT") {
      onChatTypeChange(type);
    }
  };

  const handleModelClick = (modelId: number) => {
    onToggleModel(modelId);
    window.dispatchEvent(new Event("ai-colab:model-selected"));
    if (isSingle) {
      onOpenChange(false);
    }
  };

  const renderModelCard = (model: Model) => {
    const selected = selectedModels.includes(model.id);
    const icon = model.externalId ? getModelIcon(model.externalId) : null;
    return (
      <button
        key={model.id}
        type="button"
        onClick={() => handleModelClick(model.id)}
        className={`relative flex flex-col gap-2 rounded-2xl border p-3 text-left transition-colors ${
          selected
            ? "border-primary/50 bg-primary/5"
            : "border-border/50 hover:border-primary/40 hover:bg-muted/40"
        }`}
      >
        {selected && (
          <div className="absolute top-2 right-2 rounded-full bg-primary p-0.5">
            <Check className="w-3 h-3 text-primary-foreground" />
          </div>
        )}
        {model.tokenMultiplier === 0 && (
          <Badge
            variant="secondary"
            className="absolute top-2 left-2 text-[9px] px-1.5 py-0 h-4 rounded-md"
          >
            Free
          </Badge>
        )}
        <div className="flex items-center gap-2 mt-3">
          {icon ? (
            <img
              src={icon}
              alt=""
              className="w-6 h-6 rounded-sm object-contain flex-shrink-0"
            />
          ) : (
            <div className="w-6 h-6" />
          )}
        </div>
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="font-medium text-[13px] leading-tight truncate">
            {model.name}
          </span>
          {model.description && (
            <span className="text-[11px] text-muted-foreground leading-tight line-clamp-2">
              {model.description}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-guide="capability-menu"
        className="sm:max-w-2xl w-full max-h-[80vh] p-0 flex flex-col overflow-hidden rounded-2xl gap-0"
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>Choose a model</DialogTitle>
        </DialogHeader>

        <div className="px-5 pb-3 border-b border-border/50 flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models..."
              className="h-8 pl-8 rounded-full text-sm"
            />
          </div>
          <Tabs value={activeTab} onValueChange={(v) => handleTabClick(v as ModalTab)}>
            <TabsList>
              {TABS.map((tab) => (
                <TabsTrigger key={tab.type} value={tab.type}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
          {activeTab === "CONTEXT" ? (
            <div className="flex flex-col gap-2">
              {contextLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading contexts...
                </div>
              ) : contexts.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No contexts yet
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {contexts.map((ctx) => {
                    const active = ctx.isAutoGenerated || selectedContextIds.includes(ctx.id);
                    return (
                      <button
                        key={ctx.id}
                        type="button"
                        disabled={ctx.isAutoGenerated}
                        title={
                          ctx.isAutoGenerated
                            ? "System generated context — always included"
                            : undefined
                        }
                        onClick={() => void toggleContext(ctx)}
                        className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                          active
                            ? "border-primary/50 bg-primary/5"
                            : "border-border/50 hover:border-primary/40 hover:bg-muted/40"
                        }`}
                      >
                        <Brain className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1 truncate text-sm">
                          {ctx.title || "Untitled context"}
                        </span>
                        {active && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  router.push("/profile/contexts");
                }}
                className="flex items-center gap-2 rounded-xl border border-dashed border-border/60 p-3 text-sm text-primary hover:bg-muted/40 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create more
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-center justify-between mb-2 px-0.5">
                  <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Models
                  </span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded-md">
                    {regularModels.length}
                  </Badge>
                </div>
                {regularModels.length === 0 ? (
                  <div className="text-xs text-muted-foreground py-4 text-center">
                    No models found
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {regularModels.map(renderModelCard)}
                  </div>
                )}
              </div>

              {freeModels.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 px-0.5">
                    <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                      Free Models
                    </span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 rounded-md">
                      {freeModels.length}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {freeModels.map(renderModelCard)}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
