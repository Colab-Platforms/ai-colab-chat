"use client";

import { Badge } from "@/components/ui/badge";
import { Check, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePlanCapabilities } from "@/context/plan-capabilities-context";

interface Model {
  id: number;
  name: string;
  description: string | null;
  isFreeModel?: boolean;
}

interface ModelSelectorProps {
  models: Model[];
  selected: number[];
  onChange: (ids: number[]) => void;
  maxModels: number;
}

export function ModelSelector({ models, selected, onChange, maxModels }: ModelSelectorProps) {
  const { restrictToFreeModels } = usePlanCapabilities();
  const isSingle = maxModels === 1;

  const toggle = (modelId: number) => {
    if (isSingle) {
      onChange([modelId]);
      return;
    }

    if (selected.includes(modelId)) {
      if (selected.length > 1) {
        onChange(selected.filter((id) => id !== modelId));
      }
    } else {
      if (maxModels === -1 || selected.length < maxModels) {
        onChange([...selected, modelId]);
      }
    }
  };

  return (
    <TooltipProvider>
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-1">
        {models.map((model) => {
          const isSelected = selected.includes(model.id);
          const isLocked = restrictToFreeModels && !model.isFreeModel;
          const button = (
            <button
              key={model.id}
              onClick={() => !isLocked && toggle(model.id)}
              disabled={isLocked}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                isLocked
                  ? "bg-muted/50 text-muted-foreground/60 cursor-not-allowed"
                  : isSelected
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {isSelected && !isLocked && <Check className="w-3 h-3" />}
              {isLocked && <Lock className="w-3 h-3" />}
              {model.name}
            </button>
          );

          if (!isLocked) return button;

          return (
            <Tooltip key={model.id}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent>Upgrade to use paid models</TooltipContent>
            </Tooltip>
          );
        })}
        {!isSingle && selected.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {selected.length} selected
          </Badge>
        )}
      </div>
    </TooltipProvider>
  );
}
