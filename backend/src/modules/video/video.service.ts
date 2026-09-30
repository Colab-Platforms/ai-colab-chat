import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { debitCredits, creditsToCostBreakdown, USD_PER_CREDIT } from "@/utils/walletUtils.js";
import { deleteFromCloudinary } from "@/utils/cloudinary.js";
import { listVideoModels, type VideoModelInfo } from "@/utils/openrouterVideo.js";
import { runPendingVideoJobs } from "./video.generation.service.js";
import { containsDisallowedContent } from "./video.moderation.js";
import { vlog, vlogBlock, vlogError } from "./video.logger.js";
import { MAX_TITLE_CHARS, type CreateVideoInput, type ListVideosQuery } from "./video.types.js";
import { getUserPlanContext, assertCanGenerateVideo } from "@/modules/plan-access/planAccess.service.js";

const DEFAULT_LIMIT = 20;
const DEFAULT_DURATION = 4;
const DEFAULT_RESOLUTION = "720p";
const DEFAULT_ASPECT_RATIO = "16:9";

// The provider's own model catalogue rarely changes; refetching it on every
// create request would add a network round trip to every video request for
// no reason, so it's cached with a short TTL instead of not at all.
const MODEL_INFO_TTL_MS = 10 * 60 * 1000;
let modelInfoCache: { at: number; models: VideoModelInfo[] } | null = null;

const getVideoModelInfo = async (externalId: string): Promise<VideoModelInfo | null> => {
  const now = Date.now();
  if (!modelInfoCache || now - modelInfoCache.at > MODEL_INFO_TTL_MS) {
    modelInfoCache = { at: now, models: await listVideoModels() };
  }
  return modelInfoCache.models.find((m) => m.id === externalId) ?? null;
};

class VideoService {
  /**
   * Picks the model to generate with — the same defaultForCapabilities-first
   * lookup chat.service.ts uses for IMAGE_GENERATION, so a video model is
   * configured the same way any other model is (see model.route.ts).
   */
  private async resolveModel(modelId?: number) {
    if (modelId) {
      const requested = await prisma.model.findFirst({
        where: {
          id: modelId,
          isActive: true,
          isDeleted: false,
          capabilities: { has: "VIDEO_GENERATION" },
        },
      });
      if (!requested) {
        throw new ApiError(
          "That video model isn't available.",
          STATUS_CODES.BAD_REQUEST,
        );
      }
      return requested;
    }

    const preferred = await prisma.model.findFirst({
      where: {
        isActive: true,
        isDeleted: false,
        defaultForCapabilities: { has: "VIDEO_GENERATION" },
      },
    });
    if (preferred) return preferred;

    const fallback = await prisma.model.findFirst({
      where: {
        isActive: true,
        isDeleted: false,
        capabilities: { has: "VIDEO_GENERATION" },
      },
    });
    if (fallback) return fallback;

    throw new ApiError(
      "No video generation model is configured yet.",
      STATUS_CODES.SERVER_ERROR,
    );
  }

  /**
   * Active VIDEO_GENERATION models, cheapest first, each annotated with
   * whether the requesting user's plan is allowed to use it — the frontend
   * shows locked models (rather than hiding them) with an upgrade badge, so
   * it needs this rather than a pre-filtered list.
   */
  async listAvailableModels(userId: number) {
    const [models, planContext, allPlans] = await Promise.all([
      prisma.model.findMany({
        where: {
          isActive: true,
          isDeleted: false,
          capabilities: { has: "VIDEO_GENERATION" },
        },
        select: {
          id: true,
          name: true,
          description: true,
          externalId: true,
          creditCostPerSecond: true,
          creditCostPerSecondByResolution: true,
          creditCostPerSecondByResolutionImageInput: true,
        },
        orderBy: { creditCostPerSecond: "asc" },
      }),
      getUserPlanContext(userId),
      prisma.plan.findMany({
        where: { isActive: true, isDeleted: false },
        orderBy: { monthlyPrice: "asc" },
        select: { name: true, monthlyPrice: true, allowedVideoModels: { select: { modelId: true } } },
      }),
    ]);

    const allowedModelIds = new Set(
      await prisma.planVideoModel
        .findMany({ where: { planId: planContext.plan.id }, select: { modelId: true } })
        .then((rows) => rows.map((r) => r.modelId)),
    );

    return models.map((model) => {
      const allowedForPlan = allowedModelIds.has(model.id);
      const unlockPlan = allowedForPlan
        ? null
        : allPlans.find((p) => p.allowedVideoModels.some((v) => v.modelId === model.id));
      return {
        ...model,
        allowedForPlan,
        unlockPlanName: unlockPlan?.name ?? null,
      };
    });
  }


  private static readonly EXACT_USD_PER_SECOND: Record<string, Record<string, number>> = {
    "bytedance/seedance-2.0": { "480p": 0.06728, "720p": 0.1512, "1080p": 0.37422, "4k": 0.7776 },
    "bytedance/seedance-2.0-mini": { "480p": 0.03364, "720p": 0.0756 },
    "google/veo-3.1-lite": { "720p": 0.05, "1080p": 0.08 },
  };


  private async resolveExactCreditsPerSecond(
    model: {
      name: string;
      externalId: string;
      creditCostPerSecond: number | null;
      creditCostPerSecondByResolution: unknown;
      creditCostPerSecondByResolutionImageInput: unknown;
    },
    resolution: string,
    hasImageInput: boolean,
  ): Promise<number> {
    // 1. Known exact OpenRouter rate card — deterministic, matches what will
    // actually be billed, so this is authoritative when present.
    const exactUsdPerSecond = VideoService.EXACT_USD_PER_SECOND[model.externalId]?.[resolution.toLowerCase()];
    if (typeof exactUsdPerSecond === "number") return exactUsdPerSecond / USD_PER_CREDIT;

    // 2. Per-resolution DB config, when someone has bothered to calibrate it
    // (e.g. a model not yet in the hardcoded table above).
    if (hasImageInput) {
      const byResolutionImage = model.creditCostPerSecondByResolutionImageInput as Record<
        string,
        number
      > | null;
      const perResolutionImage = byResolutionImage?.[resolution];
      if (typeof perResolutionImage === "number") return perResolutionImage;
    }
    const byResolution = model.creditCostPerSecondByResolution as Record<string, number> | null;
    const perResolution = byResolution?.[resolution];
    if (typeof perResolution === "number") return perResolution;

    // 3. Flat per-model rate, if set.
    if (model.creditCostPerSecond) return model.creditCostPerSecond;

    // 4. OpenRouter's own live catalogue price for this model — same source
    // the duration/resolution validation below already fetches, so this
    // costs nothing extra. Converts its $/sec straight to credits/sec at the
    // fixed $0.03/credit peg.
    try {
      const info = await getVideoModelInfo(model.externalId);
      const raw = info?.pricingPerVideoSecond;
      if (raw) {
        const usdPerSecond = Number(String(raw).replace(/[^0-9.]/g, ""));
        if (Number.isFinite(usdPerSecond) && usdPerSecond > 0) {
          return usdPerSecond / USD_PER_CREDIT;
        }
      }
    } catch (error) {
      vlogError("cost-estimate", `live OpenRouter pricing lookup failed for ${model.externalId}`, error);
    }

    // 5. Last resort — a deliberately generous flat estimate so we never
    // block a generation over a missing/unreachable price source. The real
    // OpenRouter-reported cost still settles the actual charge afterward.
    vlog("cost-estimate", `no pricing source found for ${model.name} — using fallback estimate`);
    return 10;
  }

  /** INR value of 1 credit, for cost logging — falls back to the seeded default if pricing isn't configured yet. */
  private async getCostPerCreditInr(): Promise<number> {
    const pricing = await prisma.creditPricingConfig.findFirst({ orderBy: { id: "desc" } });
    return pricing ? Number(pricing.costPerCreditInr) : 2.85;
  }

  /**
   * Enqueues a video and returns immediately with a PENDING row — generation
   * runs in the background against OpenRouter's async video API, which can
   * take anywhere from ~20 seconds to a few minutes.
   */
  async create(userId: number, input: CreateVideoInput) {
    vlog("create", `user=${userId} request received — prompt="${input.prompt.slice(0, 80)}..."`);

    if (input.chatId) {
      const chat = await prisma.chat.findFirst({
        where: { id: input.chatId, userId, isDeleted: false },
        select: { id: true },
      });
      if (!chat) {
        vlog("create", `user=${userId} chatId=${input.chatId} not found — rejecting`);
        throw new ApiError("Chat not found", STATUS_CODES.NOT_FOUND);
      }
    }

    const prompt = input.prompt.trim();
    if (containsDisallowedContent(prompt)) {
      vlog("create", `user=${userId} prompt rejected by moderation gate`);
      throw new ApiError(
        "This prompt isn't something I can generate a video for. Please rephrase it.",
        STATUS_CODES.BAD_REQUEST,
      );
    }
    vlog("create", `user=${userId} moderation check passed`);

    const model = await this.resolveModel(input.modelId);
    vlog("create", `user=${userId} resolved model=${model.name} (id=${model.id}, externalId=${model.externalId})`);

    const planContext = await getUserPlanContext(userId);
    await assertCanGenerateVideo(planContext, model);

    const duration = input.duration ?? DEFAULT_DURATION;
    const resolution = input.resolution ?? DEFAULT_RESOLUTION;
    const aspectRatio = input.aspectRatio ?? DEFAULT_ASPECT_RATIO;
    vlog("create", `user=${userId} params duration=${duration}s resolution=${resolution} aspectRatio=${aspectRatio}`);

    // Best-effort cross-check against what the model actually supports.
    // Never blocks generation on its own failure — a flaky catalogue fetch
    // must not be the reason a paying user can't generate a video.
    try {
      const modelInfo = await getVideoModelInfo(model.externalId);
      if (modelInfo) {
        vlog("create", `catalogue check: durations=[${modelInfo.supportedDurations}] resolutions=[${modelInfo.supportedResolutions}]`);
        if (
          modelInfo.supportedDurations.length > 0 &&
          !modelInfo.supportedDurations.includes(duration)
        ) {
          throw new ApiError(
            `${model.name} supports these durations (seconds): ${modelInfo.supportedDurations.join(", ")}.`,
            STATUS_CODES.BAD_REQUEST,
          );
        }
        if (
          modelInfo.supportedResolutions.length > 0 &&
          !modelInfo.supportedResolutions.includes(resolution)
        ) {
          throw new ApiError(
            `${model.name} supports these resolutions: ${modelInfo.supportedResolutions.join(", ")}.`,
            STATUS_CODES.BAD_REQUEST,
          );
        }
      } else {
        vlog("create", `catalogue check: model ${model.externalId} not found in OpenRouter's /videos/models — skipping validation`);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      vlogError("create", "model catalogue check failed (continuing without validation)", error);
    }

    const hasImageInput = Boolean(input.firstFrameUrl || input.lastFrameUrl);
    const costPerSecond = await this.resolveExactCreditsPerSecond(model, resolution, hasImageInput);
    const reservedTokens = Math.ceil(duration * costPerSecond); // credits, despite the field name — see refundReservation in video.generation.service.ts
    const costPerCreditInr = await this.getCostPerCreditInr();
    const estimatedCost = creditsToCostBreakdown(reservedTokens, costPerCreditInr);

    vlogBlock("create", `user=${userId} cost estimate before reserving`, {
      model: model.name,
      externalId: model.externalId,
      resolution,
      duration,
      hasImageInput,
      creditsPerSecond: costPerSecond,
      reservedCredits: reservedTokens,
      estimatedUsd: `$${estimatedCost.usd}`,
      estimatedInr: `₹${estimatedCost.inr}`,
      usdPerCredit: USD_PER_CREDIT,
      inrPerCredit: costPerCreditInr,
    });

    const { video, debitResult } = await prisma.$transaction(async (tx) => {
      const created = await tx.generatedVideo.create({
        data: {
          userId,
          chatId: input.chatId ?? null,
          messageId: input.messageId ?? null,
          modelId: model.id,
          status: "PENDING",
          prompt: prompt.slice(0, MAX_TITLE_CHARS * 10),
          duration,
          resolution,
          aspectRatio,
          firstFrameUrl: input.firstFrameUrl ?? null,
          lastFrameUrl: input.lastFrameUrl ?? null,
          reservedTokens,
        },
      });

      const debit = await debitCredits(tx, {
        userId,
        amount: reservedTokens,
        referenceId: `video_reserve_${created.id}`,
        meta: { reason: "VIDEO_GENERATION_RESERVE", videoId: created.id, estimatedUsd: estimatedCost.usd, estimatedInr: estimatedCost.inr },
      });

      // Recorded so a later partial refund (reconciliation, or a failed
      // job) can be credited back into the same pools it came from instead
      // of always dumping into topupCredits — see refundCreditsToSource.
      const updated = await tx.generatedVideo.update({
        where: { id: created.id },
        data: { reservedFromBundled: debit.fromBundled, reservedFromTopup: debit.fromTopup },
      });

      return { video: updated, debitResult: debit };
    });

    vlogBlock("create", `job=${video.id} credits debited`, {
      videoId: video.id,
      reservedCredits: reservedTokens,
      debitedFromBundled: debitResult.fromBundled,
      debitedFromTopup: debitResult.fromTopup,
      bundledRemaining: debitResult.bundledRemaining,
      topupRemaining: debitResult.topupRemaining,
      totalRemaining: debitResult.totalRemaining,
    });

    vlogBlock("create", `job=${video.id} created as PENDING, ${reservedTokens} credits reserved`, {
      videoId: video.id,
      userId,
      modelId: model.id,
      duration,
      resolution,
      aspectRatio,
      reservedTokens,
    });

    // Kick the worker now rather than waiting for the next cron tick — the
    // user is watching a card for a request that can take minutes, so poll
    // latency here is very visible.
    void runPendingVideoJobs();
    vlog("create", `job=${video.id} worker kicked`);

    return video;
  }

  async list(userId: number, query: ListVideosQuery) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || DEFAULT_LIMIT, 1), 100);

    const where = {
      userId,
      isDeleted: false,
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.chatId ? { chatId: Number(query.chatId) } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.generatedVideo.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.generatedVideo.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getById(userId: number, id: number) {
    const video = await prisma.generatedVideo.findFirst({
      where: { id, userId, isDeleted: false },
    });
    if (!video) {
      throw new ApiError("Video not found", STATUS_CODES.NOT_FOUND);
    }
    return video;
  }

  /**
   * Re-queues a failed video. Re-debits the wallet — unlike a document retry,
   * a failed video's reservation was already refunded in full (see
   * video.generation.service.ts), so a retry is a genuinely new paid attempt.
   */
  async retry(userId: number, id: number) {
    vlog("retry", `user=${userId} requested retry of job=${id}`);
    const video = await prisma.generatedVideo.findFirst({
      where: { id, userId, isDeleted: false },
    });
    if (!video) {
      throw new ApiError("Video not found", STATUS_CODES.NOT_FOUND);
    }
    if (video.status !== "FAILED") {
      vlog("retry", `job=${id} rejected — status is ${video.status}, not FAILED`);
      throw new ApiError("Only failed videos can be retried", STATUS_CODES.BAD_REQUEST);
    }

    // Re-check plan access — the user's plan may have changed (e.g. a
    // downgrade) since the video was first created.
    const model = await prisma.model.findFirst({ where: { id: video.modelId } });
    if (model) {
      const planContext = await getUserPlanContext(userId);
      await assertCanGenerateVideo(planContext, model);
    }

    const costPerCreditInr = await this.getCostPerCreditInr();
    const estimatedCost = creditsToCostBreakdown(video.reservedTokens, costPerCreditInr);
    vlogBlock("retry", `job=${id} re-debit cost estimate`, {
      reservedCredits: video.reservedTokens,
      estimatedUsd: `$${estimatedCost.usd}`,
      estimatedInr: `₹${estimatedCost.inr}`,
    });

    const { updated, debitResult } = await prisma.$transaction(async (tx) => {
      const debit = await debitCredits(tx, {
        userId,
        amount: video.reservedTokens,
        referenceId: `video_reserve_retry_${video.id}_${Date.now()}`,
        meta: { reason: "VIDEO_GENERATION_RESERVE_RETRY", videoId: video.id, estimatedUsd: estimatedCost.usd, estimatedInr: estimatedCost.inr },
      });

      const video2 = await tx.generatedVideo.update({
        where: { id },
        data: {
          status: "PENDING",
          attempts: 0,
          lastError: null,
          externalJobId: null,
          actualCostUsd: null,
          reservedFromBundled: debit.fromBundled,
          reservedFromTopup: debit.fromTopup,
        },
      });

      return { updated: video2, debitResult: debit };
    });

    vlogBlock("retry", `job=${id} credits re-debited, reset to PENDING`, {
      reservedCredits: video.reservedTokens,
      debitedFromBundled: debitResult.fromBundled,
      debitedFromTopup: debitResult.fromTopup,
      bundledRemaining: debitResult.bundledRemaining,
      topupRemaining: debitResult.topupRemaining,
      totalRemaining: debitResult.totalRemaining,
    });
    void runPendingVideoJobs();
    vlog("retry", `job=${id} worker kicked`);

    return updated;
  }

  async delete(userId: number, id: number) {
    vlog("delete", `user=${userId} requested delete of job=${id}`);
    const video = await prisma.generatedVideo.findFirst({
      where: { id, userId, isDeleted: false },
      select: { id: true, cloudinaryPublicId: true },
    });
    if (!video) {
      throw new ApiError("Video not found", STATUS_CODES.NOT_FOUND);
    }

    if (video.cloudinaryPublicId) {
      await deleteFromCloudinary(video.cloudinaryPublicId, "video").catch((error) => {
        vlogError("delete", `job=${id} failed to delete Cloudinary asset`, error);
      });
      vlog("delete", `job=${id} Cloudinary asset removed (publicId=${video.cloudinaryPublicId})`);
    }

    const result = await prisma.generatedVideo.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
      select: { id: true },
    });
    vlog("delete", `job=${id} soft-deleted`);
    return result;
  }
}

export default VideoService;
