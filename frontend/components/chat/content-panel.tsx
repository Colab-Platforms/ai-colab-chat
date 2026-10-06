"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { contentService } from "@/lib/services";
import { toast } from "@/lib/toast";
import { useContentPanel, type ContentItem } from "@/context/content-panel-context";

// ── Field model ───────────────────────────────────────────────────────────
// One declarative description per content type; a single recursive form renders
// all of them. Keys must match backend/src/modules/content-agent/content.schemas.ts.

type Field =
  | { key: string; label: string; kind: "text" | "area" | "tags" | "number" }
  | { key: string; label: string; kind: "items"; itemLabel: string; fields: Field[] };

const FIELDS: Record<string, Field[]> = {
  social_post: [
    { key: "hook", label: "Hook", kind: "text" },
    { key: "caption", label: "Caption", kind: "area" },
    { key: "cta", label: "Call to action", kind: "text" },
    { key: "hashtags", label: "Hashtags", kind: "tags" },
    { key: "visualDirection", label: "Visual direction", kind: "area" },
  ],
  email: [
    { key: "subject", label: "Subject", kind: "text" },
    { key: "preheader", label: "Preheader", kind: "text" },
    { key: "body", label: "Body", kind: "area" },
    { key: "cta", label: "Call to action", kind: "text" },
  ],
  blog: [
    { key: "title", label: "Title", kind: "text" },
    { key: "metaDescription", label: "Meta description", kind: "area" },
    {
      key: "sections",
      label: "Sections",
      kind: "items",
      itemLabel: "Section",
      fields: [
        { key: "heading", label: "Heading", kind: "text" },
        { key: "body", label: "Body", kind: "area" },
      ],
    },
  ],
  ad_copy: [
    {
      key: "variants",
      label: "Variants",
      kind: "items",
      itemLabel: "Variant",
      fields: [
        { key: "headline", label: "Headline", kind: "text" },
        { key: "primaryText", label: "Primary text", kind: "area" },
        { key: "cta", label: "CTA", kind: "text" },
      ],
    },
  ],
  video_script: [
    { key: "title", label: "Title", kind: "text" },
    {
      key: "scenes",
      label: "Scenes",
      kind: "items",
      itemLabel: "Scene",
      fields: [
        { key: "visual", label: "Visual", kind: "area" },
        { key: "voiceover", label: "Voiceover", kind: "area" },
        { key: "durationSec", label: "Seconds", kind: "number" },
      ],
    },
  ],
};

const QUICK_ACTIONS = [
  "Make it shorter",
  "Make it punchier",
  "More professional tone",
  "Add a stronger call to action",
];

type Body = Record<string, any>;

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: any;
  onChange: (v: any) => void;
}) {
  if (field.kind === "items") {
    const list: Body[] = Array.isArray(value) ? value : [];
    const blank = Object.fromEntries(
      field.fields.map((f) => [f.key, f.kind === "number" ? 5 : f.kind === "tags" ? [] : ""]),
    );
    return (
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">{field.label}</div>
        {list.map((item, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-border/60 p-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
              {field.itemLabel} {i + 1}
              {list.length > 1 && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onChange(list.filter((_, j) => j !== i))}
                  title="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {field.fields.map((sub) => (
              <FieldEditor
                key={sub.key}
                field={sub}
                value={item[sub.key]}
                onChange={(v) =>
                  onChange(list.map((it, j) => (j === i ? { ...it, [sub.key]: v } : it)))
                }
              />
            ))}
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onChange([...list, blank])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add {field.itemLabel.toLowerCase()}
        </Button>
      </div>
    );
  }

  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{field.label}</span>
      {field.kind === "area" ? (
        <Textarea
          value={value ?? ""}
          rows={Math.min(14, Math.max(3, Math.ceil(String(value ?? "").length / 70)))}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.kind === "tags" ? (
        <Input
          value={Array.isArray(value) ? value.join(", ") : ""}
          placeholder="comma, separated, tags"
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((t) => t.trim().replace(/^#/, ""))
                .filter(Boolean),
            )
          }
        />
      ) : field.kind === "number" ? (
        <Input
          type="number"
          min={1}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        />
      ) : (
        <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  );
}

/** Plain-text export of a body, for the Copy button. */
function toPlainText(type: string, b: Body): string {
  const tags = (t: string[] = []) => t.map((x) => `#${x}`).join(" ");
  switch (type) {
    case "social_post":
      return [b.hook, b.caption, b.cta, tags(b.hashtags)].filter(Boolean).join("\n\n");
    case "email":
      return [`Subject: ${b.subject}`, b.body, b.cta].filter(Boolean).join("\n\n");
    case "blog":
      return [`# ${b.title}`, ...(b.sections ?? []).map((s: Body) => `## ${s.heading}\n\n${s.body}`)].join("\n\n");
    case "ad_copy":
      return (b.variants ?? []).map((v: Body) => [v.headline, v.primaryText, v.cta].filter(Boolean).join("\n")).join("\n\n---\n\n");
    case "video_script":
      return [b.title, ...(b.scenes ?? []).map((s: Body, i: number) => `Scene ${i + 1} (${s.durationSec}s)\nVisual: ${s.visual}\nVO: ${s.voiceover}`)].join("\n\n");
    default:
      return JSON.stringify(b, null, 2);
  }
}

const sameBody = (a: Body, b: Body) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Right-hand editor for a content item. Edits are local until Save (which
 * creates a new version); AI actions (regenerate) replace the draft with the
 * server's new version.
 */
export function ContentPanel() {
  const { isOpen, activeItem, closeContentPanel, applyItem } = useContentPanel();
  const [draft, setDraft] = useState<Body>({});
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<null | "save" | "regen" | "approve">(null);

  useEffect(() => {
    if (activeItem) setDraft(activeItem.body ?? {});
  }, [activeItem?.id, activeItem?.currentVersion, activeItem?.version, activeItem?.body]);

  if (!isOpen || !activeItem) return null;

  const fields = FIELDS[activeItem.type] ?? [];
  const dirty = !sameBody(draft, activeItem.body ?? {});
  const approved = activeItem.status === "APPROVED";

  const adopt = (row: any) =>
    applyItem({
      id: row.id,
      type: row.type,
      platform: row.platform ?? null,
      title: row.title,
      status: row.status,
      currentVersion: row.currentVersion,
      body: row.body,
    });

  const run = async (kind: "save" | "regen" | "approve", fn: () => Promise<any>, ok: string) => {
    setBusy(kind);
    try {
      const res = await fn();
      adopt(res.data.data);
      toast.success(ok);
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const regenerate = (text: string) => {
    if (!text.trim()) return;
    const modelId = Number(localStorage.getItem("preferredModelId")) || undefined;
    void run(
      "regen",
      () => contentService.regenerate(activeItem.id, { instruction: text.trim(), modelId }),
      "Updated",
    ).then(() => setInstruction(""));
  };

  return (
    <div className="hidden md:flex w-[560px] shrink-0 flex-col border-l border-border/50 bg-background">
      <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{activeItem.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {activeItem.type.replace("_", " ")}
            {activeItem.platform ? ` · ${activeItem.platform}` : ""} · v
            {activeItem.currentVersion ?? activeItem.version ?? 1}
            {approved ? " · Approved" : ""}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="Copy"
          onClick={() => {
            void navigator.clipboard.writeText(toPlainText(activeItem.type, draft));
            toast.success("Copied");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Close" onClick={closeContentPanel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {fields.map((f) => (
          <FieldEditor
            key={f.key}
            field={f}
            value={draft[f.key]}
            onChange={(v) => setDraft((prev) => ({ ...prev, [f.key]: v }))}
          />
        ))}
      </div>

      <div className="space-y-2.5 border-t border-border/50 p-4">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a}
              type="button"
              disabled={busy !== null}
              onClick={() => regenerate(a)}
              className="rounded-full border border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={instruction}
            placeholder="Ask the AI to change something…"
            disabled={busy !== null}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && regenerate(instruction)}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || !instruction.trim()}
            onClick={() => regenerate(instruction)}
          >
            {busy === "regen" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            variant="outline"
            disabled={!dirty || busy !== null}
            onClick={() =>
              void run("save", () => contentService.update(activeItem.id, { body: draft }), "Saved")
            }
          >
            {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
          <Button
            className="flex-1"
            disabled={approved || dirty || busy !== null}
            onClick={() => void run("approve", () => contentService.approve(activeItem.id), "Approved")}
          >
            {busy === "approve" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            {approved ? "Approved" : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}
