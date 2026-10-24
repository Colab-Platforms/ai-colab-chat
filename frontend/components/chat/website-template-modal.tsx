"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WebsiteTemplate } from "./website-template";

interface WebsiteTemplateModalProps {
  template: WebsiteTemplate | null;
  onOpenChange: (open: boolean) => void;
  onUse: (template: WebsiteTemplate) => void;
}

/**
 * Full preview of one template: the live site in an iframe, with the details
 * and "Use this template" in a bar underneath.
 */
export function WebsiteTemplateModal({ template, onOpenChange, onUse }: WebsiteTemplateModalProps) {
  if (!template) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <div className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg">{template.name}</DialogTitle>
          <DialogDescription className="mt-1">{template.description}</DialogDescription>
        </div>

        <div className="relative h-[62vh] overflow-hidden border-y border-border bg-muted">
          <iframe
            src={template.previewUrl}
            title={`${template.name} preview`}
            className="h-full w-full border-0 bg-background"
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 px-6 py-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {template.techStack.map((tech) => (
              <Badge key={tech} variant="secondary">
                {tech}
              </Badge>
            ))}
            {template.model?.name && (
              <span className="ml-1 text-xs text-muted-foreground">
                Built with {template.model.name}
              </span>
            )}
          </div>

          <a
            href={template.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open preview in a new tab"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="sr-only">Open preview in a new tab</span>
          </a>

          <Button className="cursor-pointer" onClick={() => onUse(template)}>
            Use this template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
