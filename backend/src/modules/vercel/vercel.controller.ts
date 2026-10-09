import { Request, Response } from "express";
import type Joi from "joi";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import * as vercelService from "./vercel.service.js";
import { attachLogStream, openSse, runDeployStream, streamFailure } from "./vercel.logs.js";
import { deploySchema, detectQuerySchema, redeploySchema } from "./vercel.validators.js";
import type { DeployInput, VercelEnvVarInput } from "./vercel.types.js";

type Handler = (req: Request, res: Response) => Promise<{ data: unknown; message: string }>;

/**
 * Same try/catch + envelope as github.controller.ts. An error's `code`
 * (VERCEL_GIT_NOT_CONNECTED, PROJECT_NAME_TAKEN, ...) rides in `data` so the UI
 * can branch on it without parsing the message.
 */
function sendError(res: Response, label: string, error: any) {
  if (!error.statusCode) console.error(`[vercel] ${label} error`, error);
  sendResponse(
    res,
    false,
    error.code ? { code: error.code, ...(error.details ?? {}) } : null,
    error.message,
    error.statusCode ?? STATUS_CODES.SERVER_ERROR,
  );
}

const handle =
  (label: string, fn: Handler) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { data, message } = await fn(req, res);
      sendResponse(res, true, data, message, STATUS_CODES.OK);
    } catch (error: any) {
      sendError(res, label, error);
    }
  };

function fail(message: string, statusCode: number): never {
  throw Object.assign(new Error(message), { statusCode });
}

function projectId(req: Request): number {
  const id = Number(req.params.projectId);
  if (!Number.isInteger(id) || id <= 0) fail("Invalid project id", STATUS_CODES.BAD_REQUEST);
  return id;
}

function optionalProjectId(raw: unknown): number | null {
  if (raw === undefined || raw === "") return null;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) fail("Invalid project id", STATUS_CODES.BAD_REQUEST);
  return id;
}

function deploymentId(req: Request): string {
  const id = String(req.params.deploymentId ?? "");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) fail("Invalid deployment id", STATUS_CODES.BAD_REQUEST);
  return id;
}

function validate<T>(schema: Joi.ObjectSchema, input: unknown): T {
  const { error, value } = schema.validate(input, { stripUnknown: true });
  if (error) fail(error.message, STATUS_CODES.BAD_REQUEST);
  return value as T;
}

export const getStatus = handle("status", async (req) => ({
  data: await vercelService.getStatus(req.user!.id, optionalProjectId(req.query.projectId)),
  message: "Vercel status fetched",
}));

export const getInstallUrl = handle("install url", async (req) => ({
  data: vercelService.createInstallUrl(
    req.user!.id,
    optionalProjectId(req.query.projectId),
    typeof req.query.redirect === "string" ? req.query.redirect : undefined,
  ),
  message: "Install URL created",
}));

/** PUBLIC — Vercel redirects the popup here with no Bearer token. Always redirects, never renders JSON. */
export async function callback(req: Request, res: Response): Promise<void> {
  // helmet() defaults COOP to same-origin, which can sever window.opener on the
  // way back to our landing page. popupChannel's BroadcastChannel covers that,
  // but there's no reason to cause it.
  res.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  try {
    const query = req.query as Record<string, string | undefined>;
    res.redirect(await vercelService.handleCallback(query));
  } catch (error) {
    // handleCallback maps its own failures to a redirect; this only catches "Vercel is not configured".
    console.error("[vercel] callback failed before redirect", error);
    res.status(503).send("Vercel integration is not configured on this server.");
  }
}

export const disconnect = handle("disconnect", async (req) => ({
  data: await vercelService.disconnect(req.user!.id),
  message: "Vercel disconnected",
}));

export const getLink = handle("get link", async (req) => ({
  data: await vercelService.getLink(req.user!.id, projectId(req)),
  message: "Link fetched",
}));

export const detect = handle("detect", async (req) => {
  const { source } = validate<{ source: "files" | "git" }>(detectQuerySchema, req.query ?? {});
  return { data: await vercelService.detect(req.user!.id, projectId(req), source), message: "Settings detected" };
});

export const listDeployments = handle("list deployments", async (req) => ({
  data: await vercelService.listDeployments(req.user!.id, projectId(req)),
  message: "Deployments fetched",
}));

export const getDeployment = handle("get deployment", async (req) => ({
  data: await vercelService.getDeployment(req.user!.id, projectId(req), deploymentId(req)),
  message: "Deployment fetched",
}));

export const cancel = handle("cancel", async (req) => ({
  data: await vercelService.cancel(req.user!.id, projectId(req), deploymentId(req)),
  message: "Deployment canceled",
}));

export const unlinkProject = handle("unlink project", async (req) => ({
  data: await vercelService.unlinkProject(req.user!.id, projectId(req)),
  message: "Project unpublished",
}));

/* ------------------------------------------------------------------ *
 * SSE handlers. Everything that can fail with a code the UI branches on
 * (VERCEL_GIT_NOT_CONNECTED, PROJECT_NAME_TAKEN, DEPLOY_IN_PROGRESS, ...)
 * happens BEFORE the headers go out, so the client gets the normal JSON
 * envelope. After that, failures are `{ type: "error" }` events.
 * ------------------------------------------------------------------ */

async function streamStarted(res: Response, start: () => Promise<vercelService.StartedDeploy>, label: string) {
  let started: vercelService.StartedDeploy;
  try {
    started = await start();
  } catch (error: any) {
    sendError(res, label, error);
    return;
  }
  openSse(res);
  try {
    await runDeployStream({ res, started, dashboardUrl: started.dashboardUrl });
  } catch (error) {
    console.error(`[vercel] ${label} stream error`, error);
    streamFailure(res, error);
  }
}

/** POST /projects/:projectId/deploy — creates the deployment, then streams its build. */
export async function deploy(req: Request, res: Response): Promise<void> {
  await streamStarted(
    res,
    async () => {
      const input = validate<DeployInput>(deploySchema, req.body ?? {});
      return vercelService.startDeploy(req.user!.id, projectId(req), input);
    },
    "deploy",
  );
}

/** POST /projects/:projectId/redeploy — same settings as last time. */
export async function redeploy(req: Request, res: Response): Promise<void> {
  await streamStarted(
    res,
    async () => {
      const { envVars } = validate<{ envVars: VercelEnvVarInput[] }>(redeploySchema, req.body ?? {});
      return vercelService.redeploy(req.user!.id, projectId(req), envVars);
    },
    "redeploy",
  );
}

/** POST /projects/:projectId/deploy/:deploymentId/logs — re-attach to a deploy (refresh, second tab, View logs). */
export async function logs(req: Request, res: Response): Promise<void> {
  let attach: Awaited<ReturnType<typeof vercelService.prepareAttach>>;
  try {
    attach = await vercelService.prepareAttach(req.user!.id, projectId(req), deploymentId(req));
  } catch (error: any) {
    sendError(res, "logs", error);
    return;
  }
  openSse(res);
  try {
    await attachLogStream({ res, row: attach.row, ctx: attach.ctx, dashboardUrl: attach.dashboardUrl });
  } catch (error) {
    console.error("[vercel] logs stream error", error);
    streamFailure(res, error);
  }
}
