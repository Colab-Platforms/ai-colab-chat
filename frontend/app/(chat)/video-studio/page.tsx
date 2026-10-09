"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Captions, Crop, ImagePlus, Loader2, Timer, Video, X, Zap } from "lucide-react";
import { attachmentService, chatService, creditWalletService, studioTemplateService, videoService } from "@/lib/services";
import { usePlanCapabilities } from "@/context/plan-capabilities-context";
import { toast } from "@/lib/toast";
import {
  constraintsFor,
  IMAGE_TO_VIDEO_MODELS,
  type VideoModelOption,
} from "@/components/chat/video-generate-dialog";
import {
  AttachButton,
  ChipSelect,
  LinkAction,
  StudioComposer,
  StudioFrame,
  StudioHero,
  StudioTabs,
  TemplateStrip,
  TemplatesComingSoon,
  type StudioTemplate,
} from "@/components/studio/studio-parts";
import { VIDEO_TEMPLATES } from "@/components/studio/studio-templates";
import { TemplateUseDialog, type TemplatePhoto } from "@/components/studio/template-use-dialog";

interface StartFrame {
  fileUrl: string;
  previewUrl: string;
  uploading: boolean;
}

interface MyVideo {
  id: number;
  chatId?: number | null;
  prompt: string;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  duration: number;
  aspectRatio: string;
}

export default function VideoStudioPage() {
  const router = useRouter();
  const { videoGenEnabled, loading: planLoading } = usePlanCapabilities();

  const [models, setModels] = useState<VideoModelOption[]>([]);
  const [modelId, setModelId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [frame, setFrame] = useState<StartFrame | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"templates" | "mine">("templates");
  const [expanded, setExpanded] = useState(false);
  const [mine, setMine] = useState<MyVideo[]>([]);
  const [mineTotal, setMineTotal] = useState(0);

  // Admin-curated trending templates; the built-in set is only a fallback.
  const [templates, setTemplates] = useState<StudioTemplate[]>(VIDEO_TEMPLATES);
  const [activeTemplate, setActiveTemplate] = useState<StudioTemplate | null>(null);

  useEffect(() => {
    videoService
      .listModels()
      .then((res) => {
        const items: VideoModelOption[] = res.data?.data || [];
        setModels(items);
        const first = items.find((m) => m.allowedForPlan) ?? items[0];
        if (first) setModelId(first.id);
      })
      .catch(() => toast.error("Couldn't load video models"));
    creditWalletService
      .get()
      .then((res) => setCredits(res.data?.data?.creditsRemaining ?? null))
      .catch(() => setCredits(null));
    studioTemplateService
      .list("VIDEO")
      .then((res) => {
        const items: any[] = res.data?.data || [];
        if (items.length === 0) return;
        setTemplates(
          items.map((t) => ({
            id: t.id,
            title: t.title,
            meta: [t.category, t.duration ? `${t.duration}s` : null, t.aspectRatio].filter(Boolean).join(" · "),
            prompt: t.prompt,
            previewUrl: t.previewUrl,
            previewVideoUrl: t.previewVideoUrl,
            requiresPhoto: t.requiresPhoto,
            category: t.category,
            aspectRatio: t.aspectRatio,
            duration: t.duration,
          })),
        );
      })
      .catch(() => {
        /* keep the built-in fallback */
      });
    videoService
      .list({ limit: "24", status: "COMPLETED" })
      .then((res) => {
        setMine(res.data?.data?.items || []);
        setMineTotal(res.data?.data?.pagination?.total ?? res.data?.data?.items?.length ?? 0);
      })
      .catch(() => {
        /* empty state is fine */
      });
  }, []);

  const model = useMemo(() => models.find((m) => m.id === modelId), [models, modelId]);
  const constraints = constraintsFor(model);
  const supportsImageToVideo = model ? IMAGE_TO_VIDEO_MODELS.has(model.externalId) : false;

  // Same guard as the chat dialog: a model switch must not leave a duration /
  // resolution / ratio the new model would reject.
  useEffect(() => {
    if (!constraints.durations.includes(duration)) {
      const closest = constraints.durations.reduce((a, b) => (Math.abs(b - duration) < Math.abs(a - duration) ? b : a));
      setDuration(closest);
    }
    if (!constraints.resolutions.includes(resolution)) setResolution(constraints.resolutions[0]);
    if (!constraints.aspectRatios.includes(aspectRatio)) setAspectRatio(constraints.aspectRatios[0]);
    if (!supportsImageToVideo) setFrame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  const costPerSecond = model
    ? (frame?.fileUrl ? model.creditCostPerSecondByResolutionImageInput?.[resolution] : undefined) ??
      model.creditCostPerSecondByResolution?.[resolution] ??
      model.creditCostPerSecond
    : null;
  const estimate = costPerSecond != null ? Math.ceil(duration * costPerSecond) : null;
  const insufficient = estimate !== null && credits !== null && estimate > credits;

  const handleFrame = useCallback(async (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setFrame({ fileUrl: "", previewUrl, uploading: true });
    try {
      const res = await attachmentService.presend(file);
      setFrame({ fileUrl: res.data.data.fileUrl, previewUrl, uploading: false });
    } catch (err: any) {
      toast.error(`Failed to upload ${file.name}: ${err?.response?.data?.message || err.message}`);
      URL.revokeObjectURL(previewUrl);
      setFrame(null);
    }
  }, []);

  const pickTemplate = (t: StudioTemplate) => setActiveTemplate(t);

  const canSubmit = Boolean(
    prompt.trim() && modelId && model?.allowedForPlan && videoGenEnabled && !frame?.uploading && !insufficient,
  );

  /** Same hand-off as the home page's video dialog: new chat, then the video job against it. */
  const generate = async (opts: {
    text: string;
    aspectRatio: string;
    duration: number;
    firstFrameUrl?: string;
    title: string;
  }) => {
    if (!modelId || busy) return;
    setBusy(true);
    try {
      const chatRes = await chatService.create({
        title: opts.title.substring(0, 50),
        capability: "STANDARD",
      });
      const chatId = chatRes.data.data.id;
      window.dispatchEvent(new CustomEvent("refresh-chats", { detail: { immediate: true } }));
      await videoService.create({
        prompt: opts.text,
        modelId,
        duration: opts.duration,
        resolution,
        aspectRatio: opts.aspectRatio,
        firstFrameUrl: opts.firstFrameUrl,
        chatId,
      });
      router.push(`/c/${chatId}`);
    } catch (err: any) {
      const response = err?.response?.data;
      const message: string = response?.message ?? err?.message ?? "Failed to start video generation";
      if (response?.code === "PLAN_RESTRICTED") toast.error(`${message} — upgrade your plan to unlock this.`);
      else if (message.toLowerCase().includes("insufficient")) toast.error(`${message} — top up your video credits.`);
      else toast.error(message);
      setBusy(false);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    generate({
      text: prompt.trim(),
      aspectRatio,
      duration,
      firstFrameUrl: frame?.fileUrl || undefined,
      title: prompt.trim(),
    });
  };

  /**
   * "Make mine like this": the template's stored prompt plus the user's photo
   * as the first frame, so the clip starts from their subject. The template's
   * duration/ratio are used when this model supports them, else the nearest.
   */
  const handleTemplateSubmit = ({ photo, extra }: { photo: TemplatePhoto | null; extra: string }) => {
    const t = activeTemplate;
    if (!t || !model) return;
    if (!videoGenEnabled || !model.allowedForPlan) {
      toast.error("Video generation isn't available on your plan for this model.");
      return;
    }
    const wantedDuration = t.duration ?? duration;
    const useDuration = constraints.durations.includes(wantedDuration)
      ? wantedDuration
      : constraints.durations.reduce((a, b) => (Math.abs(b - wantedDuration) < Math.abs(a - wantedDuration) ? b : a));
    const useAspect = t.aspectRatio && constraints.aspectRatios.includes(t.aspectRatio) ? t.aspectRatio : aspectRatio;

    const perSecond =
      (photo ? model.creditCostPerSecondByResolutionImageInput?.[resolution] : undefined) ??
      model.creditCostPerSecondByResolution?.[resolution] ??
      model.creditCostPerSecond;
    const cost = Math.ceil(useDuration * perSecond);
    if (credits !== null && cost > credits) {
      toast.error(`Not enough video credits: this needs ${cost}, you have ${credits}.`);
      return;
    }

    let text = t.prompt;
    if (photo) text += "\n\nStart from the attached photo: animate this person or object in this style, keeping them recognisable.";
    if (extra) text += `\n\nAdditional details: ${extra}`;
    if (typeof t.id === "number") void studioTemplateService.recordUse(t.id).catch(() => {});
    generate({
      text: text.slice(0, 2000),
      aspectRatio: useAspect,
      duration: useDuration,
      firstFrameUrl: photo?.fileUrl,
      title: t.title,
    });
  };

  return (
    <StudioFrame>
      <StudioHero title="Video Studio" subtitle="Describe a shot, or start from an image or a template." />

      <div>
        <StudioComposer
          value={prompt}
          onChange={setPrompt}
          placeholder="Describe the shot: subject, setting, camera movement, light…"
          maxLength={2000}
          onSubmit={handleSubmit}
          canSubmit={canSubmit}
          busy={busy}
          left={
            <>
              {frame ? (
                <div className="relative h-8 w-8 shrink-0">
                  <img src={frame.previewUrl} alt="Start frame" className="h-8 w-8 rounded-full object-cover border border-border" />
                  {frame.uploading && (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    </div>
                  )}
                  <button
                    type="button"
                    title="Remove start image"
                    onClick={() => {
                      URL.revokeObjectURL(frame.previewUrl);
                      setFrame(null);
                    }}
                    className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-surface border border-border flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ) : (
                <AttachButton
                  onFile={handleFrame}
                  accept="image/*"
                  icon={ImagePlus}
                  disabled={!supportsImageToVideo}
                  title={supportsImageToVideo ? "Start from an image" : "This model can't start from an image"}
                />
              )}
              {models.length > 0 && (
                <ChipSelect
                  icon={Video}
                  title="Video model"
                  value={modelId ?? models[0].id}
                  options={models.map((m) => ({
                    value: m.id,
                    label: m.name,
                    disabled: !m.allowedForPlan,
                    hint: !m.allowedForPlan && m.unlockPlanName ? m.unlockPlanName : undefined,
                  }))}
                  onChange={(v) => setModelId(Number(v))}
                />
              )}
              <ChipSelect
                icon={Crop}
                title="Aspect ratio"
                value={aspectRatio}
                options={constraints.aspectRatios.map((a) => ({ value: a, label: a }))}
                onChange={setAspectRatio}
              />
              <ChipSelect
                icon={Timer}
                title="Duration"
                value={duration}
                options={constraints.durations.map((d) => ({ value: d, label: `${d}s` }))}
                onChange={setDuration}
              />
              <ChipSelect
                icon={Captions}
                title="Resolution"
                value={resolution}
                options={constraints.resolutions.map((r) => ({ value: r, label: r }))}
                onChange={setResolution}
              />
            </>
          }
          right={
            estimate !== null ? (
              <span
                title="Estimated video credits for this clip"
                className={`mr-1 inline-flex items-center gap-1 text-xs ${insufficient ? "text-warn" : "text-faint"}`}
              >
                <Zap className="w-3 h-3" />
                {estimate}
              </span>
            ) : null
          }
        />

        <p className="mt-2 text-center text-xs text-muted-foreground">
          {!planLoading && !videoGenEnabled ? (
            <>
              Video generation isn&apos;t included in your plan.{" "}
              <Link href="/profile/subscription" className="text-primary font-medium hover:underline">
                Upgrade
              </Link>
            </>
          ) : credits !== null ? (
            <>
              <span className={insufficient ? "text-warn" : ""}>{credits.toLocaleString()} video credits left</span>{" "}
              <Link href="/profile/wallet" className="text-primary font-medium hover:underline">
                Top up
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <div className="space-y-4 pt-2">
        <StudioTabs
          tabs={[
            { id: "templates", label: "Templates" },
            { id: "mine", label: "Your videos", count: mineTotal },
          ]}
          active={tab}
          onChange={setTab}
        />

        {/* Templates are hidden for now — restore the LinkAction + TemplateStrip when they launch. */}
        {tab === "templates" ? (
          <TemplatesComingSoon variant="video" />
        ) : mine.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No videos yet — describe a shot above to make one.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {mine.map((v) => {
              const tile = v.thumbnailUrl ? (
                <img src={v.thumbnailUrl} alt={v.prompt} loading="lazy" className="h-full w-full object-cover" />
              ) : v.fileUrl ? (
                <video src={v.fileUrl} preload="metadata" muted className="h-full w-full object-cover" />
              ) : null;
              const cls =
                "group relative block aspect-video overflow-hidden rounded-xl border border-border bg-sunken";
              const body = (
                <>
                  {tile}
                  <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10.5px] text-white">
                    {v.duration}s · {v.aspectRatio}
                  </span>
                </>
              );
              return v.chatId ? (
                <Link key={v.id} href={`/c/${v.chatId}`} className={cls} title={v.prompt}>
                  {body}
                </Link>
              ) : (
                <a key={v.id} href={v.fileUrl ?? "#"} target="_blank" rel="noreferrer" className={cls} title={v.prompt}>
                  {body}
                </a>
              );
            })}
          </div>
        )}
      </div>

      <TemplateUseDialog
        template={activeTemplate}
        kind="video"
        busy={busy}
        photoDisabledReason={
          model && !supportsImageToVideo ? `${model.name} can't start from a photo — choose another video model.` : null
        }
        onOpenChange={(open) => !open && !busy && setActiveTemplate(null)}
        onSubmit={handleTemplateSubmit}
      />
    </StudioFrame>
  );
}
