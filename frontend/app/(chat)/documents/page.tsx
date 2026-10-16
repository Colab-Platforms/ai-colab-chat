"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FileText, LayoutTemplate, ListOrdered, Loader2, Paperclip, Presentation, X } from "lucide-react";
import { chatService, documentService } from "@/lib/services";
import { usePlanCapabilities } from "@/context/plan-capabilities-context";
import { toast } from "@/lib/toast";
import { FileFormatIcon } from "@/components/chat/document-card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AttachButton,
  ChipSelect,
  LinkAction,
  StudioComposer,
  StudioFrame,
  StudioHero,
  StudioTabs,
} from "@/components/studio/studio-parts";
import {
  DOC_FORMAT_LABEL,
  DOC_FORMAT_NOUN,
  DOC_LENGTHS,
  type DocFormat,
} from "@/components/studio/studio-templates";
import {
  DeckContentSlide,
  DeckTitleSlide,
  DocPagePreview,
  SheetPreview,
  TemplateThumb,
  type TemplateInfo,
} from "@/components/studio/template-previews";

interface MyDocument {
  id: number;
  chatId?: number | null;
  format: string;
  title: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  fileUrl?: string | null;
}

interface SelectedTemplate {
  format: DocFormat;
  key: string;
  label: string;
}

const FORMATS = Object.keys(DOC_FORMAT_LABEL) as DocFormat[];
const MAX_SOURCE_CHARS = 20_000;
const SOURCE_ACCEPT = ".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json";

/** Large preview of one template, drawn from its real tokens. */
function TemplatePreviewBody({ format, template }: { format: DocFormat; template: TemplateInfo }) {
  const t = template.tokens;
  if (format === "PPTX") {
    return (
      <div className="flex flex-col items-center gap-3">
        <DeckTitleSlide tokens={t} fontSize={9} />
        <DeckContentSlide tokens={t} fontSize={9} />
      </div>
    );
  }
  if (format === "XLSX") return <SheetPreview tokens={t} fontSize={10} />;
  return <DocPagePreview tokens={t} fontSize={12} />;
}

export default function DocumentsPage() {
  const router = useRouter();
  const { documentGenEnabled, loading: planLoading } = usePlanCapabilities();

  const [format, setFormat] = useState<DocFormat>("PDF");
  const [length, setLength] = useState(DOC_LENGTHS.PDF[1].value);
  const [prompt, setPrompt] = useState("");
  const [source, setSource] = useState<{ name: string; text: string } | null>(null);
  const [template, setTemplate] = useState<SelectedTemplate | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"templates" | "mine">("templates");
  const [browseFormat, setBrowseFormat] = useState<DocFormat>("PDF");
  const [templates, setTemplates] = useState<Record<string, TemplateInfo[]> | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  const [preview, setPreview] = useState<TemplateInfo | null>(null);

  const [mine, setMine] = useState<MyDocument[]>([]);
  const [mineTotal, setMineTotal] = useState(0);

  useEffect(() => {
    documentService
      .list({ limit: "24" })
      .then((res) => {
        const items: MyDocument[] = res.data?.data?.items || [];
        setMine(items);
        setMineTotal(res.data?.data?.pagination?.total ?? items.length);
      })
      .catch(() => {
        /* empty state is fine */
      });
    documentService
      .templates()
      .then((res) => setTemplates(res.data?.data?.formats ?? {}))
      .catch(() => setTemplatesFailed(true));
  }, []);

  const lengthFor = (f: DocFormat, current: string) => {
    const options = DOC_LENGTHS[f];
    return options.some((o) => o.value === current) ? current : options[Math.min(1, options.length - 1)].value;
  };

  const changeFormat = (next: DocFormat) => {
    setFormat(next);
    setLength((cur) => lengthFor(next, cur));
    // A template belongs to one format; picking another format drops it.
    setTemplate((t) => (t && t.format !== next ? null : t));
  };

  const applyTemplate = (t: TemplateInfo) => {
    setFormat(browseFormat);
    setLength((cur) => lengthFor(browseFormat, cur));
    setTemplate({ format: browseFormat, key: t.key, label: t.label });
    setPreview(null);
    toast.success(`${t.label} template selected`);
    window.scrollTo?.({ top: 0 });
  };

  const handleSourceFile = useCallback(async (file: File) => {
    try {
      const text = (await file.text()).slice(0, MAX_SOURCE_CHARS);
      setSource({ name: file.name, text });
    } catch {
      toast.error(`Couldn't read ${file.name}`);
    }
  }, []);

  const canSubmit = Boolean(prompt.trim() && documentGenEnabled);

  /**
   * Starts a chat whose first message asks for the chosen format. The format
   * and template are also sent as explicit fields (documentFormat /
   * documentTheme) on the first chat turn, so the document pipeline uses
   * exactly what was picked instead of guessing from the wording.
   */
  const handleSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      let content = `Create a ${DOC_FORMAT_NOUN[format]}, about ${length}. ${prompt.trim()}`;
      if (template) content += `\n\nTemplate: ${template.label}.`;
      if (source) content += `\n\nUse this source material:\n\n${source.text}`;

      const chatRes = await chatService.create({
        title: prompt.trim().substring(0, 50),
        capability: "STANDARD",
      });
      const chatId = chatRes.data.data.id;
      // No modelIds: /c/[id] falls back to the chat's own default model.
      sessionStorage.setItem(
        `pending_chat_${chatId}`,
        JSON.stringify({
          content,
          modelIds: [],
          chatType: "STANDARD",
          documentFormat: format,
          ...(template ? { documentTheme: template.key } : {}),
        }),
      );
      window.dispatchEvent(new CustomEvent("refresh-chats", { detail: { immediate: true } }));
      router.push(`/c/${chatId}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't start document generation");
      setBusy(false);
    }
  };

  const browseList = templates?.[browseFormat] ?? [];

  return (
    <StudioFrame>
      <StudioHero title="Documents" subtitle="Reports, decks, sheets and more. Start from a prompt or a template." />

      <div>
        <StudioComposer
          value={prompt}
          onChange={setPrompt}
          placeholder="Describe the document: what it's for, who reads it, what it should cover…"
          onSubmit={handleSubmit}
          canSubmit={canSubmit}
          busy={busy}
          left={
            <>
              {source ? (
                <span className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 rounded-full border border-border bg-surface text-xs text-foreground max-w-[190px]">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{source.name}</span>
                  <button
                    type="button"
                    title="Remove source file"
                    onClick={() => setSource(null)}
                    className="h-5 w-5 rounded-full hover:bg-sidebar-accent flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ) : (
                <AttachButton onFile={handleSourceFile} accept={SOURCE_ACCEPT} icon={Paperclip} title="Add a text file as source material" />
              )}
              <ChipSelect
                icon={FileText}
                title="Format"
                value={format}
                options={FORMATS.map((f) => ({ value: f, label: DOC_FORMAT_LABEL[f] }))}
                onChange={changeFormat}
              />
              <ChipSelect
                icon={format === "PPTX" ? Presentation : ListOrdered}
                title="Length"
                value={length}
                options={DOC_LENGTHS[format]}
                onChange={setLength}
              />
              {template && (
                <span className="inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 rounded-full bg-accent-soft text-accent-ink text-xs font-medium">
                  <LayoutTemplate className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[130px]">{template.label}</span>
                  <button
                    type="button"
                    title="Remove template"
                    onClick={() => setTemplate(null)}
                    className="h-5 w-5 rounded-full hover:bg-black/10 flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </>
          }
        />
        {!planLoading && !documentGenEnabled && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Document generation isn&apos;t included in your plan.{" "}
            <Link href="/profile/subscription" className="text-primary font-medium hover:underline">
              Upgrade
            </Link>
          </p>
        )}
      </div>

      <div className="space-y-4 pt-2">
        <StudioTabs
          tabs={[
            { id: "templates", label: "Templates" },
            { id: "mine", label: "Your documents", count: mineTotal },
          ]}
          active={tab}
          onChange={setTab}
          action={
            tab === "mine" ? <LinkAction onClick={() => router.push("/assets")}>Open Assets</LinkAction> : undefined
          }
        />

        {tab === "templates" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex items-center rounded-lg border border-border bg-sunken p-0.5">
                {FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setBrowseFormat(f)}
                    className={`h-8 rounded-md border px-3 text-[13px] font-medium transition-colors cursor-pointer ${
                      browseFormat === f
                        ? "border-border bg-surface text-foreground shadow-sm"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {DOC_FORMAT_LABEL[f]}
                  </button>
                ))}
              </div>
              <p className="text-[13px] text-muted-foreground">
                {templates
                  ? `${DOC_FORMAT_LABEL[browseFormat]} · ${browseList.length} templates. Pick one to preview it.`
                  : ""}
              </p>
            </div>

            {templatesFailed ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Couldn&apos;t load templates. Please refresh to try again.</p>
            ) : !templates ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {browseList.map((t) => {
                  const active = template?.format === browseFormat && template.key === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setPreview(t)}
                      className="group text-left cursor-pointer"
                    >
                      <div
                        className={`relative flex h-[168px] items-center justify-center overflow-hidden rounded-xl border bg-sunken transition-all group-hover:-translate-y-0.5 ${
                          active ? "border-primary ring-1 ring-primary" : "border-border"
                        }`}
                      >
                        <span className="absolute left-2.5 top-2.5 rounded bg-surface px-1.5 py-0.5 text-[9.5px] font-bold tracking-wide text-foreground border border-border">
                          {browseFormat}
                        </span>
                        {active && (
                          <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                        <TemplateThumb format={browseFormat} tokens={t.tokens} />
                      </div>
                      <div className="mt-2 px-0.5">
                        <div className="text-[13.5px] font-medium text-foreground">{t.label}</div>
                        <div className="text-xs leading-snug text-faint line-clamp-3">{t.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : mine.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No documents yet — describe one above to get started.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {mine.map((d) => {
              const body = (
                <>
                  <FileFormatIcon format={d.format} className="h-7 w-[22px] shrink-0" />
                  <span className="flex-1 truncate text-[13.5px] text-foreground">{d.title}</span>
                  <span
                    className={`text-xs ${
                      d.status === "FAILED" ? "text-danger" : d.status === "COMPLETED" ? "text-faint" : "text-warn"
                    }`}
                  >
                    {d.status === "COMPLETED" ? d.format : d.status === "FAILED" ? "Failed" : "Generating…"}
                  </span>
                </>
              );
              const cls = "flex items-center gap-3 px-3 py-2.5 hover:bg-sidebar-accent transition-colors";
              return (
                <li key={d.id}>
                  {d.chatId ? (
                    <Link href={`/c/${d.chatId}`} className={cls}>
                      {body}
                    </Link>
                  ) : (
                    <a href={d.fileUrl ?? "#"} target="_blank" rel="noreferrer" className={cls}>
                      {body}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-[640px] max-h-[92dvh] gap-0 overflow-hidden p-0">
          {preview && (
            <>
              <DialogHeader className="px-5 pt-5 pb-3 text-left">
                <DialogTitle className="text-[17px] font-semibold">
                  {preview.label} <span className="font-normal text-faint">· {DOC_FORMAT_LABEL[browseFormat]}</span>
                </DialogTitle>
                <DialogDescription className="text-[13.5px]">{preview.description}</DialogDescription>
              </DialogHeader>

              <div className="max-h-[60dvh] overflow-y-auto bg-sunken px-5 py-6">
                <div className="flex justify-center">
                  <TemplatePreviewBody format={browseFormat} template={preview} />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
                <div className="flex items-center gap-1.5">
                  {[preview.tokens.accent, preview.tokens.accent2 ?? preview.tokens.accentSoft, preview.tokens.bg ?? preview.tokens.text]
                    .filter(Boolean)
                    .map((c: string, i: number) => (
                      <span key={i} className="h-4 w-4 rounded-full border border-border" style={{ background: c }} />
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="h-9 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-sidebar-accent cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate(preview)}
                    className="h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-hover cursor-pointer"
                  >
                    Use this template
                  </button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </StudioFrame>
  );
}
