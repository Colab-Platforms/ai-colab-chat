import prisma from "@root/prisma.js";
import { uploadToCloudinary } from "@/utils/cloudinary.js";
import { refundCreditsToSource, debitCredits, creditsToCostBreakdown, USD_PER_CREDIT } from "@/utils/walletUtils.js";
import {
  downloadVideoContent,
  pollVideoJob,
  submitVideoJob,
  VideoSubmitError,
  type FrameImage,
  type VideoJobPollResult,
} from "@/utils/openrouterVideo.js";
import { vlog, vlogBlock, vlogError } from "./video.logger.js";

const MAX_ATTEMPTS = Number(process.env.VIDEO_MAX_ATTEMPTS ?? 3);
const BATCH_SIZE = Number(process.env.VIDEO_BATCH_SIZE ?? 3);
const CALLBACK_BASE_URL = process.env.BACKEND_PUBLIC_URL || "";

const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "") || "video";

const buildPublicId = (id: number): string => `video-${id}-${slugify(String(Date.now()))}`;

/** INR value of 1 credit, for cost logging — falls back to the seeded default if pricing isn't configured yet. */
const getCostPerCreditInr = async (): Promise<number> => {
  const pricing = await prisma.creditPricingConfig.findFirst({ orderBy: { id: "desc" } });
  return pricing ? Number(pricing.costPerCreditInr) : 2.85;
};

/** Atomically claims a PENDING row so exactly one worker submits it. */
const claimPending = async (id: number): Promise<boolean> => {
  const { count } = await prisma.generatedVideo.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "SUBMITTED", startedAt: new Date() },
  });
  return count === 1;
};

/**
 * Refunds this video's full reservation — used on any terminal failure.
 * Video now spends from CreditWallet, not UserWallet — see video.service.ts
 * for why (video credits are a separate, top-up-able currency from chat
 * tokens). The `reservedTokens` field name on GeneratedVideo is unchanged to
 * avoid a wider rename, but it holds a credit amount, not wallet tokens.
 */
const refundReservation = async (video: {
  id: number;
  userId: number;
  reservedTokens: number;
  reservedFromBundled: number;
}): Promise<void> => {
  const costPerCreditInr = await getCostPerCreditInr();
  const refundCost = creditsToCostBreakdown(video.reservedTokens, costPerCreditInr);

  await prisma.$transaction(async (tx) => {
    // Refund into the SAME pools the reservation was taken from — nothing
    // was actually spent (job never ran / failed outright), so this should
    // put bundledCredits back exactly as it was, not convert it into
    // topupCredits.
    await refundCreditsToSource(tx, {
      userId: video.userId,
      amount: video.reservedTokens,
      bundledPortion: video.reservedFromBundled,
      referenceId: `video_refund_${video.id}`,
      meta: { reason: "VIDEO_GENERATION_REFUND", videoId: video.id, refundedUsd: refundCost.usd, refundedInr: refundCost.inr },
    });
  });
  vlogBlock("refund", `job=${video.id} refunded to user=${video.userId}`, {
    refundedCredits: video.reservedTokens,
    refundedUsd: `$${refundCost.usd}`,
    refundedInr: `₹${refundCost.inr}`,
  });
};

/**
 * A submit-call failure below the attempts cap normally goes back to PENDING
 * for the next tick to retry — the existing reservation covers it, no
 * re-debit. But a 4xx from OpenRouter (bad params, content-policy rejection
 * like "image may contain a real person") is deterministic: the identical
 * request will fail identically every time, so retrying just burns attempts
 * and delays the refund. Those fail immediately instead.
 */
const handleSubmitFailure = async (id: number, error: unknown): Promise<void> => {
  const message = String((error as any)?.message ?? error).slice(0, 1000);
  const nonRetryable = error instanceof VideoSubmitError && !error.retryable;
  const video = await prisma.generatedVideo.findUnique({ where: { id } });
  if (!video) return;

  const attempts = video.attempts + 1;
  const exhausted = nonRetryable || attempts >= MAX_ATTEMPTS;

  await prisma.generatedVideo.update({
    where: { id },
    data: {
      status: exhausted ? "FAILED" : "PENDING",
      attempts,
      lastError: message,
      ...(exhausted ? { completedAt: new Date() } : {}),
    },
  });

  if (exhausted) {
    await refundReservation(video);
  }

  vlogError(
    "submit",
    `job=${id} attempt=${attempts}/${MAX_ATTEMPTS} → ${
      exhausted
        ? `FAILED (refunded, ${nonRetryable ? "non-retryable provider rejection" : "giving up"})`
        : "back to PENDING (will retry)"
    }`,
    message,
  );
};

export const submitPendingVideoJobs = async (): Promise<void> => {
  const pending = await prisma.generatedVideo.findMany({
    where: { status: "PENDING", isDeleted: false, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    include: { model: true },
  });

  if (pending.length === 0) {
    vlog("submit", "drain tick — nothing PENDING");
    return;
  }
  vlog("submit", `drain tick — ${pending.length} PENDING job(s) found`);

  await Promise.all(
    pending.map(async (video) => {
      const claimed = await claimPending(video.id);
      if (!claimed) {
        vlog("submit", `job=${video.id} already claimed by another worker — skipping`);
        return;
      }
      vlog("submit", `job=${video.id} CLAIMED (PENDING → SUBMITTED), calling OpenRouter`);

      try {
        const callbackUrl = CALLBACK_BASE_URL
          ? `${CALLBACK_BASE_URL.replace(/\/+$/, "")}/api/videos/webhooks/openrouter`
          : undefined;
        const frameImages: FrameImage[] = [
          ...(video.firstFrameUrl ? [{ url: video.firstFrameUrl, frameType: "first_frame" as const }] : []),
          ...(video.lastFrameUrl ? [{ url: video.lastFrameUrl, frameType: "last_frame" as const }] : []),
        ];
        vlogBlock("submit", `job=${video.id} submitting to OpenRouter`, {
          model: video.model.externalId,
          duration: video.duration,
          resolution: video.resolution,
          aspectRatio: video.aspectRatio,
          frameImages: frameImages.length > 0 ? frameImages : "(text-to-video)",
          callbackUrl: callbackUrl ?? "(none — BACKEND_PUBLIC_URL not set, poll-only)",
        });

        const result = await submitVideoJob({
          model: video.model.externalId,
          prompt: video.prompt,
          duration: video.duration,
          resolution: video.resolution,
          aspectRatio: video.aspectRatio,
          callbackUrl,
          frameImages: frameImages.length > 0 ? frameImages : undefined,
        });

        await prisma.generatedVideo.update({
          where: { id: video.id },
          data: { externalJobId: result.id },
        });

        vlog("submit", `job=${video.id} submitted OK -> externalJobId=${result.id} status=${result.status}`);
      } catch (error) {
        await handleSubmitFailure(video.id, error);
      }
    }),
  );
};

/**
 * Shared by the poll tick and the webhook handler — both arrive at the same
 * terminal-state payload shape from OpenRouter, just via different paths.
 */
export const applyTerminalStatus = async (
  videoId: number,
  poll: VideoJobPollResult,
): Promise<void> => {
  vlog("terminal", `job=${videoId} applying provider status=${poll.status}`);

  const video = await prisma.generatedVideo.findUnique({ where: { id: videoId } });
  if (!video) {
    vlog("terminal", `job=${videoId} not found — ignoring`);
    return;
  }
  if (video.status !== "SUBMITTED") {
    vlog("terminal", `job=${videoId} already in terminal state (${video.status}) — ignoring duplicate delivery`);
    return;
  }

  if (poll.status === "completed") {
    vlog("terminal", `job=${video.id} COMPLETED on provider side — downloading content`);
    try {
      const buffer = await downloadVideoContent(video.externalJobId!);
      vlog("terminal", `job=${video.id} downloaded ${buffer.length} bytes — uploading to Cloudinary`);

      const publicId = buildPublicId(video.id);
      const uploaded = await uploadToCloudinary(buffer, {
        folder: "generated-videos",
        resourceType: "video",
        publicId,
      });
      vlog("terminal", `job=${video.id} uploaded to Cloudinary: ${uploaded.url}`);

      await prisma.$transaction([
        prisma.generatedVideo.update({
          where: { id: video.id },
          data: {
            status: "COMPLETED",
            fileUrl: uploaded.url,
            cloudinaryPublicId: uploaded.publicId,
            fileSize: buffer.length,
            actualCostUsd: poll.costUsd,
            completedAt: new Date(),
            lastError: null,
          },
        }),
        // Logged on completion (not at reserve time) so a job that later
        // fails/refunds never shows up as "usage" in the admin report — the
        // wallet debit already happened at create(), this is just the
        // Token Usage page's record of it, mirroring how chat completions
        // log against UsageLog.
        prisma.usageLog.create({
          data: {
            userId: video.userId,
            modelId: video.modelId,
            chatId: video.chatId,
            messageId: video.messageId,
            capability: "VIDEO_GENERATION",
            promptTokens: 0,
            completionTokens: video.reservedTokens,
            totalTokens: video.reservedTokens,
            billablePromptTokens: 0,
            billableCompletionTokens: video.reservedTokens,
            billableTotalTokens: video.reservedTokens,
          },
        }),
      ]);

      // Real cost as metered by OpenRouter (poll.costUsd) is the source of
      // truth for what actually gets charged — video.reservedTokens was only
      // ever an upfront estimate to gate on balance. Reconcile the
      // difference now: refund the user if we over-reserved, or collect the
      // shortfall if we under-reserved (best-effort — a completed video is
      // never un-delivered over a shortfall we couldn't collect).
      const costPerCreditInr = await getCostPerCreditInr();
      const estimatedCost = creditsToCostBreakdown(video.reservedTokens, costPerCreditInr);
      const actualUsd = poll.costUsd;
      const actualInr = actualUsd != null ? Number((actualUsd * (costPerCreditInr / USD_PER_CREDIT)).toFixed(2)) : null;

      let finalCredits = video.reservedTokens;
      let reconcileNote = "OpenRouter didn't report a cost — kept the original reservation as the final charge.";

      if (actualUsd != null) {
        const actualCredits = Math.max(1, Math.ceil(actualUsd / USD_PER_CREDIT));
        const delta = actualCredits - video.reservedTokens;

        if (delta < 0) {
          const refundAmount = -delta;
          // Refund into the same pools the reservation was debited from
          // (bundled first, since that's the order debitCredits spends it) —
          // not straight into topupCredits, which would silently convert
          // unused monthly allowance into permanent top-up balance.
          await prisma.$transaction((tx) =>
            refundCreditsToSource(tx, {
              userId: video.userId,
              amount: refundAmount,
              bundledPortion: video.reservedFromBundled,
              referenceId: `video_reconcile_refund_${video.id}`,
              meta: { reason: "VIDEO_COST_RECONCILE_REFUND", videoId: video.id, reservedCredits: video.reservedTokens, actualCredits },
            }),
          );
          finalCredits = actualCredits;
          reconcileNote = `Refunded ${refundAmount} credits — actual cost came in under the reservation.`;
        } else if (delta > 0) {
          try {
            await prisma.$transaction((tx) =>
              debitCredits(tx, {
                userId: video.userId,
                amount: delta,
                referenceId: `video_reconcile_debit_${video.id}`,
                meta: { reason: "VIDEO_COST_RECONCILE_DEBIT", videoId: video.id, reservedCredits: video.reservedTokens, actualCredits },
              }),
            );
            finalCredits = actualCredits;
            reconcileNote = `Collected ${delta} additional credits — actual cost exceeded the reservation.`;
          } catch (reconcileError) {
            reconcileNote = `Actual cost exceeded the reservation by ${delta} credits, but the user's balance couldn't cover it — shortfall absorbed, reservation left as the final charge.`;
            vlogError("terminal", `job=${video.id} could not collect ${delta}-credit shortfall`, reconcileError);
          }
        } else {
          reconcileNote = "Actual cost matched the reservation exactly — no adjustment needed.";
        }

        if (finalCredits !== video.reservedTokens) {
          await prisma.generatedVideo.update({
            where: { id: video.id },
            data: { reservedTokens: finalCredits },
          });
        }
      }

      vlogBlock("terminal", `job=${video.id} COMPLETED`, {
        videoId: video.id,
        fileUrl: uploaded.url,
        fileSize: buffer.length,
        reservedCreditsAtCreate: video.reservedTokens,
        finalCreditsCharged: finalCredits,
        estimatedCostUsd: `$${estimatedCost.usd}`,
        estimatedCostInr: `₹${estimatedCost.inr}`,
        actualCostUsd: actualUsd != null ? `$${actualUsd}` : "not reported by OpenRouter",
        actualCostInr: actualInr != null ? `₹${actualInr}` : "n/a",
        reconcile: reconcileNote,
      });
    } catch (error) {
      // Generation succeeded on the provider's side but our download/upload
      // failed — this is OUR failure, not a reason to bill the user, and not
      // safely retryable via a fresh provider submission (that would
      // generate a second video). Refund and surface for manual retry.
      const message = String((error as any)?.message ?? error).slice(0, 1000);
      await prisma.generatedVideo.update({
        where: { id: video.id },
        data: { status: "FAILED", lastError: message, completedAt: new Date() },
      });
      await refundReservation(video);
      vlogError("terminal", `job=${video.id} download/upload failed after provider completed — refunded`, message);
    }
    return;
  }

  if (poll.status === "failed" || poll.status === "cancelled" || poll.status === "expired") {
    const status = poll.status === "cancelled" ? "CANCELLED" : poll.status === "expired" ? "EXPIRED" : "FAILED";
    await prisma.generatedVideo.update({
      where: { id: video.id },
      data: {
        status,
        lastError: poll.error ?? `Provider reported status: ${poll.status}`,
        completedAt: new Date(),
      },
    });
    await refundReservation(video);
    vlog("terminal", `job=${video.id} ${status} — refunded ${video.reservedTokens} tokens (reason: ${poll.error ?? poll.status})`);
    return;
  }

  vlog("terminal", `job=${video.id} still ${poll.status} — nothing to do this tick`);
};

/**
 * Safety-net poll for rows a webhook never resolved (delivery failure,
 * callback_url unreachable in local/dev, etc). Only polls jobs old enough
 * that "still pending" isn't simply because it was submitted seconds ago.
 */
export const pollSubmittedVideoJobs = async (): Promise<void> => {
  const staleBefore = new Date(Date.now() - 20_000);

  const submitted = await prisma.generatedVideo.findMany({
    where: {
      status: "SUBMITTED",
      isDeleted: false,
      externalJobId: { not: null },
      startedAt: { lt: staleBefore },
    },
    orderBy: { startedAt: "asc" },
    take: BATCH_SIZE * 2,
  });

  if (submitted.length === 0) {
    vlog("poll", "safety-net tick — nothing SUBMITTED to poll");
    return;
  }
  vlog("poll", `safety-net tick — polling ${submitted.length} SUBMITTED job(s)`);

  await Promise.all(
    submitted.map(async (video) => {
      try {
        vlog("poll", `job=${video.id} polling externalJobId=${video.externalJobId}`);
        const poll = await pollVideoJob(video.externalJobId!);
        vlog("poll", `job=${video.id} provider status=${poll.status}`);
        await applyTerminalStatus(video.id, poll);
      } catch (error) {
        vlogError("poll", `job=${video.id} poll request failed`, error);
      }
    }),
  );
};

/**
 * A row stuck in SUBMITTED with no externalJobId means the process died
 * between the atomic claim and the submit call actually completing — put it
 * back on the queue rather than leaving it orphaned forever.
 */
export const reclaimOrphanedSubmissions = async (): Promise<void> => {
  const staleBefore = new Date(Date.now() - 2 * 60_000);

  const { count } = await prisma.generatedVideo.updateMany({
    where: { status: "SUBMITTED", externalJobId: null, startedAt: { lt: staleBefore } },
    data: { status: "PENDING", lastError: "Stale — submission did not complete in time" },
  });

  if (count > 0) {
    vlog("reclaim", `reclaimed ${count} orphaned submission(s) back to PENDING`);
  }
};

let isDraining = false;

/** Drains the PENDING (submit) queue. Safe to call concurrently. */
export const runPendingVideoJobs = async (): Promise<void> => {
  if (isDraining) return;
  isDraining = true;
  try {
    await submitPendingVideoJobs();
  } catch (error) {
    vlogError("drain", "drain error", error);
  } finally {
    isDraining = false;
  }
};
