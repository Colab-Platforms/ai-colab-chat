import { randomUUID } from "node:crypto";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { normalizeCodePath } from "@/modules/code-workspace/code-workspace.parser.js";
import type { CodeFileSnapshot } from "@/modules/code-workspace/code-workspace.types.js";
import {
  isGitIntegrationMissing,
  parseVercelError,
  vercelError,
  vercelJson,
  vercelRaw,
  vercelRequest,
  type VercelRawResponse,
} from "./vercel.api.js";
import {
  MAX_DEPLOY_BYTES,
  VERCEL_GIT_AUTH_URL,
  VERCEL_GITHUB_APP_URL,
  type VercelEnvVarInput,
  type VercelFramework,
} from "./vercel.types.js";

/**
 * The Vercel calls behind a deploy. No Prisma here: vercel.service.ts does the
 * pre-flight and persistence, this file only talks to Vercel.
 *
 *   files:  ensure project -> env vars -> POST /v13/deployments { files }
 *   git:    ensure project (git-linked) -> env vars -> POST /v13/deployments { gitSource }
 *
 * `files` and `gitSource` are mutually exclusive on Vercel's side.
 */

/** Everything a Vercel call needs. teamId is appended by vercel.api.ts. */
export interface VercelCtx {
  token: string;
  teamId: string | null;
  connectionId: number;
}

export interface ProjectSettings {
  framework: VercelFramework | null;
  buildCommand: string | null;
  installCommand: string | null;
  devCommand: string | null;
  outputDirectory: string | null;
  rootDirectory: string | null;
  nodeVersion: string | null;
}

export interface VercelProjectRaw {
  id: string;
  name: string;
  link?: { type?: string; org?: string; repo?: string; repoId?: number; productionBranch?: string } | null;
  targets?: { production?: { alias?: string[] | null } | null } | null;
}

export interface VercelDeploymentRaw {
  id: string;
  url: string | null;
  name?: string;
  readyState?: string;
  status?: string;
  alias?: string[] | null;
  aliasAssigned?: boolean | number | null;
  inspectorUrl?: string | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  meta?: Record<string, string> | null;
}

/* ------------------------------------------------------------------ *
 * Serialisation: one deploy per project at a time, per process. A copy of
 * github.sync.ts's serialise() — importing it would couple the two features.
 * ------------------------------------------------------------------ */

const queues = new Map<number, Promise<unknown>>();

export function serialise<T>(projectId: number, task: () => Promise<T>): Promise<T> {
  const previous = queues.get(projectId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(task);
  queues.set(projectId, next);
  next.finally(() => {
    if (queues.get(projectId) === next) queues.delete(projectId);
  }).catch(() => undefined);
  return next;
}

/* ------------------------------------------------------------------ *
 * Errors the dialog branches on
 * ------------------------------------------------------------------ */

function gitNotConnected() {
  return Object.assign(
    new ApiError(
      "Vercel can't access this repository yet. Link GitHub to Vercel and give Vercel's GitHub app access to the repo, then press Deploy again.",
      STATUS_CODES.CONFLICT,
    ),
    { code: "VERCEL_GIT_NOT_CONNECTED", details: { vercelAuthUrl: VERCEL_GIT_AUTH_URL, githubAppUrl: VERCEL_GITHUB_APP_URL } },
  );
}

function nameTaken(name: string, suggestion: string | null) {
  return Object.assign(
    new ApiError(`The Vercel project name "${name}" is already taken — choose another`, STATUS_CODES.CONFLICT),
    { code: "PROJECT_NAME_TAKEN", details: { suggestion } },
  );
}

/** Git-path failures share one decision: is it the missing GitHub link? */
function gitFailure(res: VercelRawResponse<unknown>, path: string): Error {
  if (isGitIntegrationMissing(res.status, res.errorText)) return gitNotConnected();
  const { message } = parseVercelError(res.errorText);
  if (/\b(ref|branch)\b/i.test(message) && /not found|does not exist|could not find|invalid/i.test(message)) {
    return Object.assign(new ApiError(`Vercel couldn't find that branch: ${message}`, STATUS_CODES.BAD_REQUEST), {
      code: "BRANCH_NOT_FOUND",
    });
  }
  return vercelError(res, path);
}

/* ------------------------------------------------------------------ *
 * Project names
 * ------------------------------------------------------------------ */

async function findProject(ctx: VercelCtx, idOrName: string): Promise<VercelProjectRaw | null> {
  return vercelRequest<VercelProjectRaw>(`/v9/projects/${encodeURIComponent(idOrName)}`, {
    ...ctx,
    allowStatuses: [404],
  });
}

/**
 * Whether `name` is free in the installation's scope. A project that is already
 * ours (`ownProjectId`) counts as free — redeploys reuse it.
 */
export async function checkName(
  ctx: VercelCtx,
  name: string,
  ownProjectId: string | null,
): Promise<{ available: boolean; suggestion: string | null }> {
  const existing = await findProject(ctx, name);
  if (!existing || existing.id === ownProjectId) return { available: true, suggestion: null };
  return { available: false, suggestion: await nextFreeName(ctx, name) };
}

async function nextFreeName(ctx: VercelCtx, base: string): Promise<string> {
  const stem = base.replace(/-\d$/, "").slice(0, 96);
  for (let i = 2; i <= 9; i++) {
    const candidate = `${stem}-${i}`;
    if (!(await findProject(ctx, candidate))) return candidate;
  }
  return `${stem.slice(0, 92)}-${randomUUID().slice(0, 6)}`;
}

/* ------------------------------------------------------------------ *
 * Projects
 * ------------------------------------------------------------------ */

function settingsBody(s: ProjectSettings) {
  return {
    framework: s.framework,
    buildCommand: s.buildCommand,
    installCommand: s.installCommand,
    devCommand: s.devCommand,
    outputDirectory: s.outputDirectory,
    rootDirectory: s.rootDirectory,
  };
}

/**
 * The Vercel project to deploy into: the one this CodeProject is already linked
 * to (settings refreshed), or a new one. Env vars must exist before the first
 * build, which is why this runs before the deployment rather than letting
 * POST /v13/deployments create the project implicitly.
 */
export async function ensureVercelProject(
  ctx: VercelCtx,
  opts: { existingId: string | null; name: string; settings: ProjectSettings; git?: { owner: string; repo: string } },
): Promise<VercelProjectRaw> {
  const repo = opts.git ? `${opts.git.owner}/${opts.git.repo}` : null;
  const existing = opts.existingId ? await findProject(ctx, opts.existingId) : null;

  if (existing) {
    // PATCH sends nulls on purpose: a field the user cleared goes back to auto-detect.
    const patchPath = `/v9/projects/${existing.id}`;
    const patch = await vercelRaw<VercelProjectRaw>(patchPath, {
      ...ctx,
      method: "PATCH",
      body: {
        ...settingsBody(opts.settings),
        nodeVersion: opts.settings.nodeVersion ?? undefined,
        ...(existing.name !== opts.name ? { name: opts.name } : {}),
      },
    });
    if (!patch.ok) {
      if (patch.status === 409) throw nameTaken(opts.name, await nextFreeName(ctx, opts.name));
      throw vercelError(patch, patchPath);
    }

    const linkedTo = existing.link?.org && existing.link?.repo ? `${existing.link.org}/${existing.link.repo}` : null;
    if (repo && linkedTo?.toLowerCase() !== repo.toLowerCase()) {
      // Not in the public REST reference: this is the endpoint the Vercel CLI's
      // `vercel git connect` uses. If Vercel ever drops it, the user is told to
      // publish from GitHub under a new name instead.
      const linkPath = `/v9/projects/${existing.id}/link`;
      const link = await vercelRaw(linkPath, { ...ctx, method: "POST", body: { type: "github", repo } });
      if (!link.ok) {
        if (isGitIntegrationMissing(link.status, link.errorText)) throw gitNotConnected();
        throw new ApiError(
          `Vercel couldn't connect "${existing.name}" to ${repo}. Publish from GitHub under a new project name instead.`,
          STATUS_CODES.BAD_REQUEST,
        );
      }
    }
    return (await findProject(ctx, existing.id)) ?? existing;
  }

  // Not linked yet, or the linked project was deleted on vercel.com — create.
  const createPath = "/v11/projects";
  const created = await vercelRaw<VercelProjectRaw>(createPath, {
    ...ctx,
    method: "POST",
    body: { name: opts.name, ...settingsBody(opts.settings), ...(repo ? { gitRepository: { type: "github", repo } } : {}) },
  });
  if (!created.ok || !created.data) {
    if (created.status === 409) throw nameTaken(opts.name, await nextFreeName(ctx, opts.name));
    throw repo ? gitFailure(created, createPath) : vercelError(created, createPath);
  }

  // nodeVersion is not accepted on create.
  if (opts.settings.nodeVersion) {
    await vercelRequest(`/v9/projects/${created.data.id}`, {
      ...ctx,
      method: "PATCH",
      body: { nodeVersion: opts.settings.nodeVersion },
      allowStatuses: [400],
    });
  }
  return created.data;
}

/* ------------------------------------------------------------------ *
 * Environment variables
 * ------------------------------------------------------------------ */

/**
 * Upserts every row in one call. Never throws for a rejected key — a bad env
 * var must not abort a deploy — and returns the failures as warnings instead.
 * Values are write-through: nothing is stored on our side.
 */
export async function syncEnvVars(
  ctx: VercelCtx,
  projectId: string,
  envVars: VercelEnvVarInput[],
): Promise<{ key: string; message: string }[]> {
  if (envVars.length === 0) return [];
  const res = await vercelRaw<{ failed?: { error?: { key?: string; envVarKey?: string; message?: string } }[] }>(
    `/v10/projects/${projectId}/env?upsert=true`,
    {
      ...ctx,
      method: "POST",
      body: envVars.map((v) => ({ key: v.key, value: v.value, type: v.type, target: v.target })),
    },
  );
  if (!res.ok) {
    const { message } = parseVercelError(res.errorText);
    return envVars.map((v) => ({ key: v.key, message: message || `Vercel rejected the environment variables (${res.status})` }));
  }
  return (res.data?.failed ?? []).map((f) => ({
    key: f.error?.key ?? f.error?.envVarKey ?? "?",
    message: f.error?.message ?? "Could not be saved",
  }));
}

/* ------------------------------------------------------------------ *
 * Deployments
 * ------------------------------------------------------------------ */

export interface EncodedFiles {
  files: { file: string; data: string; encoding: "base64" }[];
  bytes: number;
}

/**
 * CodeFile rows -> Vercel's inline `files`. Base64 so JSX, emoji and odd bytes
 * survive the JSON round trip. Every path goes through the workspace's own
 * normalizeCodePath — a `..` segment would be a write outside the build root.
 */
export function encodeFiles(files: CodeFileSnapshot[]): EncodedFiles {
  const out: EncodedFiles["files"] = [];
  let bytes = 0;
  for (const f of files) {
    const path = normalizeCodePath(f.path);
    if (!path) continue;
    const data = Buffer.from(f.content, "utf8").toString("base64");
    bytes += data.length;
    out.push({ file: path, data, encoding: "base64" });
  }
  if (out.length === 0) {
    throw Object.assign(new ApiError("This project has no files to publish", STATUS_CODES.BAD_REQUEST), { code: "NO_FILES" });
  }
  if (bytes > MAX_DEPLOY_BYTES) {
    throw Object.assign(
      new ApiError(
        `This project is too large to upload directly (${(bytes / 1e6).toFixed(1)} MB). Publish it from GitHub instead.`,
        STATUS_CODES.BAD_REQUEST,
      ),
      { code: "PROJECT_TOO_LARGE", details: { bytes, limit: MAX_DEPLOY_BYTES } },
    );
  }
  return { files: out, bytes };
}

// skipAutoDetectionConfirmation: without it Vercel 400s whenever its own
// framework detection disagrees with the settings we send. forceNew: never
// dedupe against an earlier identical deploy — the user pressed Deploy.
const CREATE_DEPLOYMENT_PATH = "/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1";

export async function deployFiles(
  ctx: VercelCtx,
  opts: { project: VercelProjectRaw; files: EncodedFiles; settings: ProjectSettings; meta: Record<string, string> },
): Promise<VercelDeploymentRaw> {
  const res = await vercelRaw<VercelDeploymentRaw>(CREATE_DEPLOYMENT_PATH, {
    ...ctx,
    method: "POST",
    body: {
      name: opts.project.name,
      project: opts.project.id,
      target: "production",
      files: opts.files.files,
      projectSettings: settingsBody(opts.settings),
      meta: opts.meta,
    },
  });
  if (!res.ok || !res.data) throw vercelError(res, CREATE_DEPLOYMENT_PATH);
  return res.data;
}

export async function deployGit(
  ctx: VercelCtx,
  opts: { project: VercelProjectRaw; repoId: string; branch: string; meta: Record<string, string> },
): Promise<VercelDeploymentRaw> {
  const res = await vercelRaw<VercelDeploymentRaw>(CREATE_DEPLOYMENT_PATH, {
    ...ctx,
    method: "POST",
    body: {
      name: opts.project.name,
      project: opts.project.id,
      target: "production",
      // Settings already live on the project; gitSource and files never mix.
      gitSource: { type: "github", repoId: opts.repoId, ref: opts.branch },
      meta: opts.meta,
    },
  });
  if (!res.ok || !res.data) throw gitFailure(res, CREATE_DEPLOYMENT_PATH);
  return res.data;
}

export function getDeployment(ctx: VercelCtx, deploymentId: string): Promise<VercelDeploymentRaw> {
  return vercelJson<VercelDeploymentRaw>(`/v13/deployments/${encodeURIComponent(deploymentId)}`, ctx);
}

export async function cancelDeployment(ctx: VercelCtx, deploymentId: string): Promise<void> {
  // 400 = already finished; nothing to cancel.
  await vercelRequest(`/v12/deployments/${encodeURIComponent(deploymentId)}/cancel`, {
    ...ctx,
    method: "PATCH",
    allowStatuses: [400],
  });
}

export function deploymentState(d: VercelDeploymentRaw): string {
  return (d.readyState ?? d.status ?? "QUEUED").toUpperCase();
}

/**
 * The URL to show the user: the pretty production alias when Vercel assigned
 * one (my-app.vercel.app), else the immutable per-deploy URL.
 */
export function pickAliasUrl(d: VercelDeploymentRaw): string | null {
  const aliases = (d.alias ?? []).filter(Boolean);
  // Skip the per-branch (-git-) and per-deploy (-<9 char hash>-) aliases.
  const pretty =
    aliases.find((a) => !a.includes("-git-") && !/-[a-z0-9]{9}-/.test(a)) ??
    aliases.find((a) => !a.includes("-git-")) ??
    aliases[0];
  return pretty ? withHttps(pretty) : null;
}

export function withHttps(hostOrUrl: string | null | undefined): string | null {
  if (!hostOrUrl) return null;
  return hostOrUrl.startsWith("http") ? hostOrUrl : `https://${hostOrUrl}`;
}

/**
 * The project's stable production URL, from GET /v9/projects. Null before the
 * first production deploy — `<name>.vercel.app` is NOT a safe guess, Vercel
 * suffixes it when that subdomain is taken globally.
 */
export function productionUrlOf(project: VercelProjectRaw): string | null {
  const aliases = project.targets?.production?.alias ?? [];
  const pretty = aliases.find((a) => a.endsWith(".vercel.app") && !a.includes("-git-")) ?? aliases[0];
  return withHttps(pretty);
}
