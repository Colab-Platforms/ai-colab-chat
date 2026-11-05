"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AudioLines, Captions, Crop, ImagePlus, Loader2, Pause, Play, Timer, Video, X, Zap } from "lucide-react";
import { chatService, studioTemplateService, videoService } from "@/lib/services";
import { usePlanCapabilities } from "@/context/plan-capabilities-context";
import { toast } from "@/lib/toast";
import { useVideoDraft } from "@/hooks/use-video-draft";
import {
  AttachButton,
  ChipSelect,
  StudioComposer,
  StudioFrame,
  StudioHero,
  StudioTabs,
  TemplatesComingSoon,
  TemplateStrip,
  type StudioTemplate,
} from "@/components/studio/studio-parts";
import {
  ImageSequenceStrip,
  imageCount,
  imagePayload,
  MultiImageDialog,
} from "@/components/studio/multi-image-dialog";
import { constraintsFor, imageLimitNote } from "@/components/chat/video-generate-dialog";
import { VIDEO_TEMPLATES } from "@/components/studio/studio-templates";
import { TemplateUseDialog, type TemplatePhoto } from "@/components/studio/template-use-dialog";

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

  const draft = useVideoDraft();
  const {
    models,
    model,
    modelId,
    prompt,
    duration,
    resolution,
    aspectRatio,
    images,
    audio,
    credits,
    constraints,
    imageCaps,
    supportsImageToVideo,
    supportsAudioReference,
    estimate,
    insufficient,
  } = draft;

  const [imagesOpen, setImagesOpen] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioElRef = useRef<HTMLAudioElement>(null);
  const [busy, setBusy] = useState(false);

  const [tab, setTab] = useState<"templates" | "mine">("templates");
  const [mine, setMine] = useState<MyVideo[]>([]);
  const [mineTotal, setMineTotal] = useState(0);

  // Admin-curated trending templates; the built-in set is only a fallback.
  const [templates, setTemplates] = useState<StudioTemplate[]>(VIDEO_TEMPLATES);
  const [activeTemplate, setActiveTemplate] = useState<StudioTemplate | null>(null);

  useEffect(() => {
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

  const pickTemplate = (t: StudioTemplate) => setActiveTemplate(t);

  const clearAudio = () => {
    draft.clearAudio();
    setAudioPlaying(false);
  };

  const toggleAudioPreview = () => {
    const el = audioElRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const canSubmit = Boolean(draft.ready && videoGenEnabled && !insufficient);

  /**
   * A studio generation still gets its own chat — that's what keeps it in the
   * sidebar and groups the session's versions together — but the user stays
   * in the studio and watches it render on the job page.
   */
  const generate = async (opts: {
    text: string;
    aspectRatio: string;
    duration: number;
    firstFrameUrl?: string;
    lastFrameUrl?: string;
    referenceImageUrls?: string[];
    referenceAudioUrl?: string;
    title: string;
    /** Overrides the composer's model/resolution (templates always use Seedance). */
    modelId?: number;
    resolution?: string;
  }) => {
    const useModelId = opts.modelId ?? modelId;
    if (!useModelId || busy) return;
    setBusy(true);
    try {
      const chatRes = await chatService.create({
        title: opts.title.substring(0, 50),
        capability: "STANDARD",
      });
      const chatId = chatRes.data.data.id;
      window.dispatchEvent(new CustomEvent("refresh-chats", { detail: { immediate: true } }));
      const videoRes = await videoService.create({
        prompt: opts.text,
        modelId: useModelId,
        duration: opts.duration,
        resolution: opts.resolution ?? resolution,
        aspectRatio: opts.aspectRatio,
        firstFrameUrl: opts.firstFrameUrl,
        lastFrameUrl: opts.lastFrameUrl,
        referenceImageUrls: opts.referenceImageUrls,
        referenceAudioUrl: opts.referenceAudioUrl,
        chatId,
      });
      const videoId = videoRes.data?.data?.id;
      if (videoId) router.push(`/video-studio/${videoId}`);
      else router.push(`/c/${chatId}`);
    } catch (err: any) {
      const response = err?.response?.data;
      const message: string = response?.message ?? err?.message ?? "Failed to start video generation";
      if (response?.code === "PLAN_RESTRICTED") toast.error(`${message} upgrade your plan to unlock this.`);
      else if (message.toLowerCase().includes("insufficient")) toast.error(`${message} top up your video credits.`);
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
      ...imagePayload(images),
      referenceAudioUrl: audio?.fileUrl || undefined,
      title: prompt.trim(),
    });
  };

  // Templates always run on Seedance, whatever the composer has selected:
  // the composer's own pick if it already is one, else the first Seedance
  // the user's plan allows.
  const templateModel =
    (model?.externalId.startsWith("bytedance/seedance") && model.allowedForPlan ? model : undefined) ??
    models.find((m) => m.externalId.startsWith("bytedance/seedance") && m.allowedForPlan);

  /**
   * "Make mine like this": the template's stored prompt plus the user's photo
   * as a reference image (never the first/last frame), so the clip features
   * their subject without starting on their exact photo. The template's
   * duration/ratio are used when the Seedance model supports them, else the
   * nearest.
   */
  const handleTemplateSubmit = ({ photo, extra }: { photo: TemplatePhoto | null; extra: string }) => {
    const t = activeTemplate;
    if (!t) return;
    if (!videoGenEnabled || !templateModel) {
      toast.error("Template videos need a Seedance model, which isn't available on your plan.");
      return;
    }
    const tc = constraintsFor(templateModel);
    const useResolution = tc.resolutions.includes(resolution) ? resolution : tc.resolutions[0];
    const wantedDuration = t.duration ?? duration;
    const useDuration = tc.durations.includes(wantedDuration)
      ? wantedDuration
      : tc.durations.reduce((a, b) => (Math.abs(b - wantedDuration) < Math.abs(a - wantedDuration) ? b : a));
    const useAspect = t.aspectRatio && tc.aspectRatios.includes(t.aspectRatio) ? t.aspectRatio : tc.aspectRatios.includes(aspectRatio) ? aspectRatio : tc.aspectRatios[0];

    const perSecond =
      (photo ? templateModel.creditCostPerSecondByResolutionImageInput?.[useResolution] : undefined) ??
      templateModel.creditCostPerSecondByResolution?.[useResolution] ??
      templateModel.creditCostPerSecond;
    const cost = Math.ceil(useDuration * perSecond);
    if (credits !== null && cost > credits) {
      toast.error(`Not enough video credits: this needs ${cost}, you have ${credits}.`);
      return;
    }

    let text = t.prompt;
    if (photo) text += "\n\nThe attached reference image shows the person or object to feature: recreate this video with them in it, keeping them recognisable.";
    if (extra) text += `\n\nAdditional details: ${extra}`;
    if (typeof t.id === "number") void studioTemplateService.recordUse(t.id).catch(() => {});
    generate({
      text: text.slice(0, 2000),
      aspectRatio: useAspect,
      duration: useDuration,
      referenceImageUrls: photo ? [photo.fileUrl] : undefined,
      title: t.title,
      modelId: templateModel.id,
      resolution: useResolution,
    });
  };

  return (
    <StudioFrame>
      <StudioHero title="Video Studio" subtitle="Describe a shot, or start from an image or a template." />

      <div>
        <StudioComposer
          value={prompt}
          onChange={draft.setPrompt}
          placeholder="Describe the shot: subject, setting, camera movement, light…"
          maxLength={60000}
          onSubmit={handleSubmit}
          canSubmit={canSubmit}
          busy={busy}
          top={<ImageSequenceStrip images={images} onEdit={() => setImagesOpen(true)} onRemove={draft.removeImage} />}
          left={
            <>
              <button
                type="button"
                disabled={!supportsImageToVideo}
                title={
                  !supportsImageToVideo
                    ? "This model can't start from an image"
                    : imageCount(images) > 0
                      ? "Edit images"
                      : "Add images"
                }
                onClick={() => setImagesOpen(true)}
                className="h-8 w-8 shrink-0 rounded-full border border-border bg-surface text-muted-foreground hover:bg-sidebar-accent hover:text-foreground flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ImagePlus className="w-4 h-4" />
              </button>
              {audio ? (
                <div
                  className="inline-flex h-8 max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full border border-border pl-1 pr-2 text-xs"
                  title={audio.name}
                >
                  <audio
                    ref={audioElRef}
                    src={audio.previewUrl}
                    onPlay={() => setAudioPlaying(true)}
                    onPause={() => setAudioPlaying(false)}
                    onEnded={() => setAudioPlaying(false)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    title={audioPlaying ? "Pause" : "Play reference audio"}
                    onClick={toggleAudioPreview}
                    className="h-6 w-6 shrink-0 rounded-full bg-muted flex items-center justify-center cursor-pointer"
                  >
                    {audioPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <span className="truncate">{audio.name}</span>
                  <span className="shrink-0 text-faint">{Math.round(audio.durationSec)}s</span>
                  {audio.uploading ? (
                    <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                  ) : (
                    <button
                      type="button"
                      title="Remove reference audio"
                      onClick={clearAudio}
                      className="shrink-0 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ) : (
                <AttachButton
                  onFile={draft.handleAudio}
                  accept="audio/*"
                  icon={AudioLines}
                  disabled={!supportsAudioReference}
                  title={
                    supportsAudioReference
                      ? "Add a reference voice / audio (optional)"
                      : "This model generates its own audio"
                  }
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
                  onChange={(v) => draft.setModelId(Number(v))}
                />
              )}
              <ChipSelect
                icon={Crop}
                title="Aspect ratio"
                value={aspectRatio}
                options={constraints.aspectRatios.map((a) => ({ value: a, label: a }))}
                onChange={draft.setAspectRatio}
              />
              <ChipSelect
                icon={Timer}
                title="Duration"
                value={duration}
                options={constraints.durations.map((d) => ({ value: d, label: `${d}s` }))}
                onChange={draft.setDuration}
              />
              <ChipSelect
                icon={Captions}
                title="Resolution"
                value={resolution}
                options={constraints.resolutions.map((r) => ({ value: r, label: r }))}
                onChange={draft.setResolution}
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

        {audio && (
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Tip: say how to use the audio, e.g. &ldquo;the character speaks in the voice from the audio&rdquo;.
            {imageCount(images) > 0 && " With audio attached, your images guide the character but may not be the exact first frame."}
          </p>
        )}
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

        {/* Always a grid (not the scrolling strip): the cards autoplay their clips, so keep few on screen. */}
        {tab === "templates" ? (
          <TemplateStrip templates={templates} expanded variant="video" onPick={pickTemplate} />
        ) : mine.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No videos yet describe a shot above to make one.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {mine.map((v) => (
              <Link
                key={v.id}
                href={`/video-studio/${v.id}`}
                title={v.prompt}
                className="group relative block aspect-video overflow-hidden rounded-xl border border-border bg-sunken"
              >
                {v.thumbnailUrl ? (
                  <img src={v.thumbnailUrl} alt={v.prompt} loading="lazy" className="h-full w-full object-cover" />
                ) : v.fileUrl ? (
                  <video src={v.fileUrl} preload="metadata" muted className="h-full w-full object-cover" />
                ) : null}
                <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10.5px] text-white">
                  {v.duration}s · {v.aspectRatio}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <MultiImageDialog
        open={imagesOpen}
        onOpenChange={setImagesOpen}
        images={images}
        onConfirm={draft.setImages}
        caps={imageCaps}
        limitNote={imageLimitNote(model, imageCaps)}
      />

      <TemplateUseDialog
        template={activeTemplate}
        kind="video"
        busy={busy}
        photoDisabledReason={
          null
        }
        onOpenChange={(open) => !open && !busy && setActiveTemplate(null)}
        onSubmit={handleTemplateSubmit}
      />
    </StudioFrame>
  );
}
