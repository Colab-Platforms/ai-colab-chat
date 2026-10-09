"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crop, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { attachmentService, chatService, imageService, modelService, studioTemplateService } from "@/lib/services";
import { usePlanCapabilities } from "@/context/plan-capabilities-context";
import { toast } from "@/lib/toast";
import {
  AttachButton,
  ChipSelect,
  LinkAction,
  StudioComposer,
  StudioFrame,
  StudioHero,
  StudioTabs,
  TemplateStrip,
  type StudioTemplate,
} from "@/components/studio/studio-parts";
import { IMAGE_ASPECTS, IMAGE_TEMPLATES } from "@/components/studio/studio-templates";
import { TemplateUseDialog, type TemplatePhoto } from "@/components/studio/template-use-dialog";

interface ImageModel {
  id: number;
  name: string;
  isActive?: boolean;
  capabilities?: string[];
  defaultForCapabilities?: string[];
  isFreeModel?: boolean;
}

interface Reference {
  id: number;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  previewUrl: string;
  uploading: boolean;
}

interface MyImage {
  id: number;
  chatId?: number | null;
  fileUrl: string;
  prompt: string;
}

export default function ImageStudioPage() {
  const router = useRouter();
  const { imageGenEnabled, restrictToFreeModels, loading: planLoading } = usePlanCapabilities();

  const [models, setModels] = useState<ImageModel[]>([]);
  const [modelId, setModelId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<string>("1:1");
  const [reference, setReference] = useState<Reference | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"templates" | "mine">("templates");
  const [expanded, setExpanded] = useState(false);
  const [mine, setMine] = useState<MyImage[]>([]);
  const [mineTotal, setMineTotal] = useState(0);

  // Trending templates come from the admin-curated list; the built-in set is
  // only a fallback so the strip is never empty before any are published.
  const [templates, setTemplates] = useState<StudioTemplate[]>(IMAGE_TEMPLATES);
  const [activeTemplate, setActiveTemplate] = useState<StudioTemplate | null>(null);

  useEffect(() => {
    modelService
      .list({ pageSize: "100" })
      .then((res) => {
        const all: ImageModel[] = res.data?.data?.data || [];
        const imageModels = all.filter((m) => m.isActive && m.capabilities?.includes("IMAGE_GENERATION"));
        setModels(imageModels);
        const preferred =
          imageModels.find((m) => m.defaultForCapabilities?.includes("IMAGE_GENERATION")) ?? imageModels[0];
        if (preferred) setModelId(preferred.id);
      })
      .catch(() => toast.error("Couldn't load image models"));
  }, []);

  useEffect(() => {
    studioTemplateService
      .list("IMAGE")
      .then((res) => {
        const items: any[] = res.data?.data || [];
        if (items.length === 0) return;
        setTemplates(
          items.map((t) => ({
            id: t.id,
            title: t.title,
            meta: [t.category, t.aspectRatio].filter(Boolean).join(" · "),
            prompt: t.prompt,
            previewUrl: t.previewUrl,
            requiresPhoto: t.requiresPhoto,
            category: t.category,
            aspectRatio: t.aspectRatio,
          })),
        );
      })
      .catch(() => {
        /* keep the built-in fallback */
      });
    imageService
      .list({ limit: "24" })
      .then((res) => {
        setMine(res.data?.data?.items || []);
        setMineTotal(res.data?.data?.pagination?.total ?? 0);
      })
      .catch(() => {
        /* empty state is fine */
      });
  }, []);

  const handleReference = useCallback(async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setReference({ id: 0, fileName: file.name, fileUrl: "", mimeType: file.type, previewUrl, uploading: true });
    try {
      const res = await attachmentService.presend(file);
      const data = res.data.data;
      setReference({
        id: data.id,
        fileName: file.name,
        fileUrl: data.fileUrl,
        mimeType: file.type,
        previewUrl,
        uploading: false,
      });
    } catch (err: any) {
      toast.error(`Failed to upload ${file.name}: ${err?.response?.data?.message || err.message}`);
      URL.revokeObjectURL(previewUrl);
      setReference(null);
    }
  }, []);

  const pickTemplate = (t: StudioTemplate) => setActiveTemplate(t);

  const modelOptions = useMemo(
    () =>
      models.map((m) => ({
        value: m.id,
        label: m.name,
        disabled: restrictToFreeModels && !m.isFreeModel,
        hint: restrictToFreeModels && !m.isFreeModel ? "Paid" : undefined,
      })),
    [models, restrictToFreeModels],
  );

  const canSubmit = Boolean(prompt.trim() && modelId && imageGenEnabled && !reference?.uploading);

  /**
   * Runs the same pipeline as an IMAGE_GENERATION turn in chat: create the
   * chat, park the first message in sessionStorage (exactly as NewChatPage
   * does) and let /c/[id] stream it. The aspect ratio travels as a prompt
   * hint — the chat stream has no dedicated size parameter yet.
   */
  const generate = async (opts: {
    text: string;
    aspectRatio: string;
    photo: { id: number; fileName: string; fileUrl: string; mimeType: string } | null;
    title: string;
  }) => {
    if (!modelId || busy) return;
    setBusy(true);
    try {
      const content = `${opts.text}\n\nAspect ratio: ${opts.aspectRatio}.`;
      const chatRes = await chatService.create({
        title: opts.title.substring(0, 50),
        modelIds: [modelId],
        capability: "IMAGE_GENERATION",
      });
      const chatId = chatRes.data.data.id;
      const attachmentObjects = opts.photo
        ? [
            {
              id: opts.photo.id,
              fileName: opts.photo.fileName,
              fileUrl: opts.photo.fileUrl,
              mimeType: opts.photo.mimeType,
            },
          ]
        : undefined;
      sessionStorage.setItem(
        `pending_chat_${chatId}`,
        JSON.stringify({
          content,
          modelIds: [modelId],
          chatType: "IMAGE_GENERATION",
          attachmentIds: opts.photo ? [opts.photo.id] : undefined,
          attachmentObjects,
        }),
      );
      window.dispatchEvent(new CustomEvent("refresh-chats", { detail: { immediate: true } }));
      router.push(`/c/${chatId}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Couldn't start image generation");
      setBusy(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    generate({
      text: prompt.trim(),
      aspectRatio: aspect,
      photo: reference && !reference.uploading ? reference : null,
      title: prompt.trim(),
    });
  };

  /**
   * "Make mine like this": the template's stored prompt is sent together with
   * the user's photo, so the model recreates that trend with their subject.
   */
  const handleTemplateSubmit = ({ photo, extra }: { photo: TemplatePhoto | null; extra: string }) => {
    const t = activeTemplate;
    if (!t) return;
    if (!imageGenEnabled) {
      toast.error("Image generation isn't included in your plan.");
      return;
    }
    let text = t.prompt;
    if (photo) {
      text +=
        "\n\nUse the attached photo as the subject: recreate this style with the person or object in that photo, keeping their face, identity and key features recognisable.";
    }
    if (extra) text += `\n\nAdditional details: ${extra}`;
    if (typeof t.id === "number") void studioTemplateService.recordUse(t.id).catch(() => {});
    generate({ text, aspectRatio: t.aspectRatio ?? aspect, photo, title: t.title });
  };

  return (
    <StudioFrame>
      <StudioHero title="Image Studio" subtitle="Describe an image, or start from a template." />

      <div>
        <StudioComposer
          value={prompt}
          onChange={setPrompt}
          placeholder="Describe the image: subject, style, colours, light, composition…"
          onSubmit={handleSubmit}
          canSubmit={canSubmit}
          busy={busy}
          left={
            <>
              {reference ? (
                <div className="relative h-8 w-8 shrink-0">
                  <img src={reference.previewUrl} alt="Reference" className="h-8 w-8 rounded-full object-cover border border-border" />
                  {reference.uploading && (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    </div>
                  )}
                  <button
                    type="button"
                    title="Remove reference"
                    onClick={() => {
                      URL.revokeObjectURL(reference.previewUrl);
                      setReference(null);
                    }}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-surface border border-border flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <AttachButton onFile={handleReference} accept="image/*" title="Add a reference image" icon={ImagePlus} />
              )}
              {models.length > 0 && (
                <ChipSelect
                  icon={Sparkles}
                  title="Image model"
                  value={modelId ?? models[0].id}
                  options={modelOptions}
                  onChange={(v) => setModelId(Number(v))}
                />
              )}
              <ChipSelect
                icon={Crop}
                title="Aspect ratio"
                value={aspect}
                options={IMAGE_ASPECTS.map((a) => ({ value: a as string, label: a }))}
                onChange={setAspect}
              />
            </>
          }
        />
        {!planLoading && !imageGenEnabled && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Image generation isn&apos;t included in your plan.{" "}
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
            { id: "mine", label: "Your images", count: mineTotal },
          ]}
          active={tab}
          onChange={setTab}
          action={
            tab === "templates" ? (
              <LinkAction onClick={() => setExpanded((e) => !e)}>{expanded ? "Show fewer" : "Browse all templates"}</LinkAction>
            ) : undefined
          }
        />

        {tab === "templates" ? (
          <TemplateStrip templates={templates} expanded={expanded} variant="image" onPick={pickTemplate} />
        ) : mine.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No images yet — generate your first one above.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {mine.map((img) => {
              const tile = (
                <img
                  src={img.fileUrl}
                  alt={img.prompt}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
                />
              );
              const cls = "group block aspect-square overflow-hidden rounded-xl border border-border bg-sunken";
              return img.chatId ? (
                <Link key={img.id} href={`/c/${img.chatId}`} className={cls} title={img.prompt}>
                  {tile}
                </Link>
              ) : (
                <a key={img.id} href={img.fileUrl} target="_blank" rel="noreferrer" className={cls} title={img.prompt}>
                  {tile}
                </a>
              );
            })}
          </div>
        )}
      </div>

      <TemplateUseDialog
        template={activeTemplate}
        kind="image"
        busy={busy}
        onOpenChange={(open) => !open && !busy && setActiveTemplate(null)}
        onSubmit={handleTemplateSubmit}
      />
    </StudioFrame>
  );
}
