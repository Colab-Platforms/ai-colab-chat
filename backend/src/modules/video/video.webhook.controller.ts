import { Request, Response } from "express";
import crypto from "crypto";
import prisma from "@root/prisma.js";
import { applyTerminalStatus } from "./video.generation.service.js";
import { vlog, vlogError } from "./video.logger.js";
import type { VideoJobPollResult, VideoJobStatus } from "@/utils/openrouterVideo.js";

const SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

/**
 * Verifies X-OpenRouter-Signature: t={timestamp},v1={hash} — HMAC-SHA256 of
 * "{timestamp},{rawBody}" using the workspace signing secret. Uses the exact
 * raw bytes (captured globally in index.ts's express.json verify hook), not
 * the re-serialized req.body, since re-serializing JSON can change key
 * ordering/number formatting and break the hash.
 * https://openrouter.ai/docs/guides/overview/multimodal/video-generation
 */
function verifySignature(req: Request): boolean {
  const secret = process.env.OPENROUTER_WEBHOOK_SECRET;
  if (!secret) {
    // No secret configured — accept but log loudly, so this is visible
    // immediately in staging rather than silently insecure forever. Set
    // OPENROUTER_WEBHOOK_SECRET once configured in OpenRouter's workspace
    // settings to enforce verification.
    console.warn("[video-webhook] OPENROUTER_WEBHOOK_SECRET not set — accepting unverified webhook");
    return true;
  }

  const header = req.headers["x-openrouter-signature"];
  if (typeof header !== "string") return false;

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, value] = part.split("=");
      return [key?.trim(), value?.trim()];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_MAX_AGE_SECONDS) return false;

  const rawBody: Buffer | undefined = (req as any).rawBody;
  if (!rawBody) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp},${rawBody.toString("utf8")}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export async function openRouterVideoWebhook(req: Request, res: Response) {
  vlog("webhook", `received — jobId=${(req.body as any)?.id} status=${(req.body as any)?.status}`);

  if (!verifySignature(req)) {
    vlogError("webhook", "signature verification FAILED — rejecting", (req.body as any)?.id);
    return res.status(401).json({ status: false, message: "Invalid signature" });
  }
  vlog("webhook", "signature verified OK");

  // OpenRouter's webhook body carries the same job fields the poll endpoint
  // returns — see the "Poll Response" shape in the docs.
  const body = req.body as {
    id?: string;
    status?: VideoJobStatus;
    unsigned_urls?: string[];
    usage?: { cost?: number };
    error?: string;
  };

  if (!body?.id || !body?.status) {
    vlog("webhook", "ignored — missing job id/status in payload");
    return res.status(200).json({ status: true, message: "Ignored — missing job id/status" });
  }

  const video = await prisma.generatedVideo.findFirst({
    where: { externalJobId: body.id, isDeleted: false },
    select: { id: true },
  });

  if (!video) {
    // Could be a job from another environment sharing the same OpenRouter
    // account, or a duplicate delivery after the row was deleted — either
    // way, 200 so OpenRouter doesn't keep retrying.
    vlog("webhook", `no local row for externalJobId=${body.id} — ignoring`);
    return res.status(200).json({ status: true, message: "Unknown job — ignored" });
  }
  vlog("webhook", `matched to job=${video.id} — applying status`);

  const poll: VideoJobPollResult = {
    id: body.id,
    status: body.status,
    unsignedUrls: body.unsigned_urls ?? [],
    costUsd: body.usage?.cost ?? null,
    error: body.error ?? null,
  };

  try {
    await applyTerminalStatus(video.id, poll);
  } catch (error) {
    vlogError("webhook", `failed to apply status for job=${video.id}`, error);
    // Still 200 — OpenRouter would otherwise retry the webhook, and the
    // 20s-later safety-net poll cron will pick this row up regardless.
  }

  return res.status(200).json({ status: true });
}
