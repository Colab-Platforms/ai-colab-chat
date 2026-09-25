"use client";

import { Eye } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCompactNumber } from "@/lib/utils";

/**
 * Renders a large number in compact form (307280 -> "307.3k") with a small
 * eye icon that reveals the exact full number in a tooltip on hover. Only
 * shows the eye icon when compacting actually changed the display — a
 * number under 1,000 has nothing to reveal.
 */
export function StatValue({ value }: { value: number }) {
  const compact = formatCompactNumber(value);
  const full = value.toLocaleString();

  if (compact === full) {
    return <span>{full}</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 cursor-default whitespace-nowrap">
            {compact}
            <Eye className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent>{full}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
