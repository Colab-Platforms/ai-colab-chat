"use client";

import { CheckCircle2, FileText, Mail, Megaphone, PenLine, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { useContentPanel, type ContentItem } from "@/context/content-panel-context";

const TYPE_META: Record<string, { label: string; Icon: typeof FileText }> = {
  social_post: { label: "Social post", Icon: PenLine },
  blog: { label: "Blog", Icon: FileText },
  ad_copy: { label: "Ad copy", Icon: Megaphone },
  video_script: { label: "Video script", Icon: Video },
  email: { label: "Email", Icon: Mail },
};

/** One-line preview pulled from whichever field leads that content type. */
export function previewOf(item: ContentItem): string {
  const b = item.body ?? {};
  const text =
    item.type === "social_post"
      ? b.caption
      : item.type === "ad_copy"
        ? b.variants?.[0]?.primaryText
        : item.type === "blog"
          ? (b.metaDescription || b.sections?.[0]?.body)
          : item.type === "video_script"
            ? b.scenes?.[0]?.voiceover || b.scenes?.[0]?.visual
            : b.body;
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

export function ContentItemCard({
  item,
  className,
}: {
  item: ContentItem;
  className?: string;
}) {
  const { overrides, openContentPanel, activeItem, isOpen } = useContentPanel();
  const current = overrides[item.id] ?? item;
  const meta = TYPE_META[current.type] ?? TYPE_META.social_post;
  const isActive = isOpen && activeItem?.id === current.id;
  const approved = current.status === "APPROVED";

  return (
    <button
      type="button"
      onClick={() => openContentPanel(current)}
      className={cn(
        "mt-3 flex w-full max-w-xl items-start gap-3 rounded-xl border bg-background p-3 text-left shadow-sm transition-shadow hover:shadow-md",
        isActive ? "border-primary/60" : "border-border/60",
        className,
      )}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <meta.Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium">{meta.label}</span>
          {current.platform && <span>· {current.platform}</span>}
          {approved ? (
            <span className="ml-auto inline-flex items-center gap-1 text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Approved
            </span>
          ) : (
            <span className="ml-auto">Ready to review</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold">{current.title}</div>
        <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
          {previewOf(current)}
        </div>
        <div className="mt-1.5 text-[11px] font-medium text-primary">Open editor →</div>
      </div>
    </button>
  );
}
