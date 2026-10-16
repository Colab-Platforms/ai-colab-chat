import { createHmac } from "node:crypto";
import type { Request } from "express";
import prisma from "@root/prisma.js";
import { safeEqual } from "@/utils/crypto.js";
import { forgetInstallationToken } from "./github.app.js";

/**
 * GitHub App webhook. Only two things matter to us: the app being uninstalled
 * (deactivate the connection so pushes stop and the UI asks to reconnect) and
 * repositories being removed from an installation (unlink just those).
 *
 * Reads the secret straight from env instead of getGithubConfig(): the webhook
 * secret is optional, and an unconfigured server must answer 503, not throw.
 */

interface WebhookResult {
  status: number;
  message: string;
}

function verifySignature(req: Request, secret: string): boolean {
  const header = req.headers["x-hub-signature-256"];
  const rawBody: Buffer | undefined = (req as any).rawBody;
  if (typeof header !== "string" || !rawBody) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  return safeEqual(expected, header);
}

export async function handleInstallationEvent(req: Request): Promise<WebhookResult> {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim();
  if (!secret) return { status: 503, message: "Webhook is not configured" };
  if (!verifySignature(req, secret)) return { status: 401, message: "Invalid signature" };

  const event = req.headers["x-github-event"];
  const payload = req.body as {
    action?: string;
    installation?: { id?: number };
    repositories_removed?: { id: number }[];
  };
  const installationId = payload.installation?.id !== undefined ? String(payload.installation.id) : null;

  try {
    if (event === "installation" && installationId) {
      if (payload.action === "deleted" || payload.action === "suspend") {
        await prisma.githubConnection.updateMany({ where: { installationId }, data: { isActive: false } });
        forgetInstallationToken(installationId);
      } else if (payload.action === "unsuspend") {
        await prisma.githubConnection.updateMany({ where: { installationId }, data: { isActive: true } });
      }
    }

    if (event === "installation_repositories" && installationId && payload.action === "removed") {
      const repoIds = (payload.repositories_removed ?? []).map((r) => String(r.id));
      if (repoIds.length) {
        await prisma.githubRepoLink.deleteMany({
          where: { repoId: { in: repoIds }, connection: { installationId } },
        });
      }
    }
  } catch (error) {
    console.error("[github] webhook handling failed", error);
    // A 500 makes GitHub retry the delivery.
    return { status: 500, message: "Webhook handling failed" };
  }
  return { status: 200, message: "ok" };
}
