import { Request, Response } from "express";
import type Joi from "joi";
import { sendResponse } from "@/utils/responseUtils.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import * as githubService from "./github.service.js";
import { handleInstallationEvent } from "./github.webhook.js";
import { autoPushSchema, createRepoSchema, linkProjectSchema, pushSchema } from "./github.validators.js";

type Handler = (req: Request, res: Response) => Promise<{ data: unknown; message: string }>;

/**
 * Same try/catch + envelope as code-workspace.controller.ts. An error's `code`
 * (REPO_NOT_EMPTY, REMOTE_AHEAD, ...) rides in `data` so the UI can branch on
 * it without parsing the message.
 */
const handle =
  (label: string, fn: Handler) =>
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { data, message } = await fn(req, res);
      sendResponse(res, true, data, message, STATUS_CODES.OK);
    } catch (error: any) {
      if (!error.statusCode) console.error(`[github] ${label} error`, error);
      sendResponse(
        res,
        false,
        error.code ? { code: error.code, ...(error.details ?? {}) } : null,
        error.message,
        error.statusCode ?? STATUS_CODES.SERVER_ERROR,
      );
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

function validate<T>(schema: Joi.ObjectSchema, input: unknown): T {
  const { error, value } = schema.validate(input, { stripUnknown: true });
  if (error) fail(error.message, STATUS_CODES.BAD_REQUEST);
  return value as T;
}

export const getStatus = handle("status", async (req) => ({
  data: await githubService.getStatus(req.user!.id, optionalProjectId(req.query.projectId)),
  message: "GitHub status fetched",
}));

export const getInstallUrl = handle("install url", async (req) => ({
  data: githubService.createAuthorizeUrl(
    req.user!.id,
    optionalProjectId(req.query.projectId),
    typeof req.query.redirect === "string" ? req.query.redirect : undefined,
  ),
  message: "Install URL created",
}));

/** PUBLIC — GitHub redirects the popup here with no Bearer token. Always redirects, never renders JSON. */
export async function callback(req: Request, res: Response): Promise<void> {
  try {
    const query = req.query as Record<string, string | undefined>;
    res.redirect(await githubService.handleCallback(query));
  } catch (error) {
    // handleCallback maps its own failures to a redirect; this only catches "GitHub is not configured".
    console.error("[github] callback failed before redirect", error);
    res.status(503).send("GitHub integration is not configured on this server.");
  }
}

export const disconnect = handle("disconnect", async (req) => ({
  data: await githubService.disconnect(req.user!.id),
  message: "GitHub disconnected",
}));

export const listRepos = handle("list repos", async (req) => ({
  data: await githubService.listRepos(req.user!.id, typeof req.query.q === "string" ? req.query.q : ""),
  message: "Repositories fetched",
}));

export const createRepo = handle("create repo", async (req) => {
  const input = validate<{ name: string; description: string; isPrivate: boolean }>(createRepoSchema, req.body);
  return { data: await githubService.createRepo(req.user!.id, input), message: "Repository created" };
});

export const getLink = handle("get link", async (req) => ({
  data: await githubService.getLink(req.user!.id, projectId(req)),
  message: "Link fetched",
}));

export const linkProject = handle("link project", async (req) => {
  const input = validate<{ owner: string; repo: string; initial: "push" | "pull"; overwrite: boolean }>(
    linkProjectSchema,
    req.body,
  );
  return { data: await githubService.linkProject(req.user!.id, projectId(req), input), message: "Repository linked" };
});

export const unlinkProject = handle("unlink project", async (req) => ({
  data: await githubService.unlinkProject(req.user!.id, projectId(req)),
  message: "Repository unlinked",
}));

export const setAutoPush = handle("auto push", async (req) => {
  const { autoPush } = validate<{ autoPush: boolean }>(autoPushSchema, req.body);
  return { data: await githubService.setAutoPush(req.user!.id, projectId(req), autoPush), message: "Updated" };
});

export const push = handle("push", async (req) => {
  const { force, message } = validate<{ force: boolean; message: string }>(pushSchema, req.body ?? {});
  return { data: await githubService.push(req.user!.id, projectId(req), force, message), message: "Pushed to GitHub" };
});

export const pull = handle("pull", async (req) => ({
  data: await githubService.pull(req.user!.id, projectId(req)),
  message: "Pulled from GitHub",
}));

/** PUBLIC, HMAC-verified. GitHub retries on non-2xx. */
export async function webhook(req: Request, res: Response): Promise<void> {
  const result = await handleInstallationEvent(req);
  res.status(result.status).json({ status: result.status < 300, message: result.message });
}
