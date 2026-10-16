import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { readFiles, snapshotUserEditsIfDirty } from "@/modules/code-workspace/code-workspace.service.js";
import {
  encryptToken,
  exchangeCodeForToken,
  getAccessToken,
  getVercelConfig,
  installUrl,
  isVercelConfigured,
} from "./vercel.app.js";
import { vercelJson, vercelRequest } from "./vercel.api.js";
import { detectVercelConfig, slugifyProjectName } from "./vercel.detect.js";
import {
  cancelDeployment,
  checkName,
  deployFiles,
  deployGit,
  deploymentState,
  encodeFiles,
  ensureVercelProject,
  productionUrlOf,
  serialise,
  syncEnvVars,
  withHttps,
  type ProjectSettings,
  type VercelCtx,
} from "./vercel.deploy.js";
import {
  ACTIVE_STATES,
  VERCEL_WEB,
  type DeployInput,
  type VercelDeploymentDto,
  type VercelDetectDto,
  type VercelEnvVarInput,
  type VercelLinkDto,
  type VercelOauthState,
  type VercelSource,
  type VercelStatusDto,
} from "./vercel.types.js";
import { ensureWatched } from "./vercel.logs.js";

/* ------------------------------------------------------------------ *
 * OAuth state — a signed, 10-minute JWT, exactly as github.service.ts.
 * The callback arrives from Vercel with no Bearer header, so the user id has
 * to travel inside the state.
 * ------------------------------------------------------------------ */

function sanitizeRedirectPath(path?: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new ApiError("JWT secret is not defined", STATUS_CODES.SERVER_ERROR);
  return secret;
}

function signState(payload: Omit<VercelOauthState, "nonce">): string {
  const full: VercelOauthState = { nonce: randomUUID(), ...payload, redirectPath: sanitizeRedirectPath(payload.redirectPath) };
  // A distinct `purpose` claim so neither a login JWT nor a GitHub state can be replayed here.
  return jwt.sign({ ...full, purpose: "vercel-oauth" }, jwtSecret(), { expiresIn: "10m" });
}

function verifyState(state: string): VercelOauthState {
  try {
    const decoded = jwt.verify(state, jwtSecret()) as Partial<VercelOauthState> & { purpose?: string };
    if (decoded.purpose !== "vercel-oauth" || typeof decoded.userId !== "number" || !decoded.nonce) {
      throw new Error("bad state");
    }
    return {
      nonce: decoded.nonce,
      userId: decoded.userId,
      projectId: typeof decoded.projectId === "number" ? decoded.projectId : null,
      redirectPath: sanitizeRedirectPath(decoded.redirectPath),
    };
  } catch {
    throw Object.assign(new ApiError("Invalid or expired Vercel authorization — try connecting again", STATUS_CODES.BAD_REQUEST), {
      code: "invalid_oauth_state",
    });
  }
}

/* ------------------------------------------------------------------ *
 * Shared lookups (every one is scoped by userId — never trust the body)
 * ------------------------------------------------------------------ */

function assertConfigured() {
  if (!isVercelConfigured()) {
    throw new ApiError("Vercel integration is not enabled on this server", STATUS_CODES.SERVER_ERROR);
  }
}

async function requireConnection(userId: number) {
  const connection = await prisma.vercelConnection.findUnique({ where: { userId } });
  if (!connection || !connection.isActive) {
    throw Object.assign(new ApiError("Connect your Vercel account first", STATUS_CODES.NOT_FOUND), {
      code: "VERCEL_NOT_CONNECTED",
    });
  }
  return connection;
}

function ctxFor(connection: { id: number; teamId: string | null; accessTokenEnc: string }): VercelCtx {
  return { token: getAccessToken(connection), teamId: connection.teamId, connectionId: connection.id };
}

async function requireOwnProject(userId: number, projectId: number) {
  const project = await prisma.codeProject.findFirst({
    where: { id: projectId, userId, isDeleted: false },
    select: { id: true, title: true, framework: true, currentVersion: true, dirtySinceSnapshot: true, status: true },
  });
  if (!project) throw new ApiError("Project not found", STATUS_CODES.NOT_FOUND);
  return project;
}

function findActiveDeployment(projectId: number) {
  return prisma.vercelDeployment.findFirst({
    where: { projectId, readyState: { in: [...ACTIVE_STATES] } },
    orderBy: { startedAt: "desc" },
  });
}

/* ------------------------------------------------------------------ *
 * DTOs
 * ------------------------------------------------------------------ */

type LinkRow = NonNullable<Awaited<ReturnType<typeof prisma.vercelProjectLink.findUnique>>>;
type DeploymentRow = NonNullable<Awaited<ReturnType<typeof prisma.vercelDeployment.findUnique>>>;

function dashboardUrl(accountSlug: string | null, projectName: string): string {
  return accountSlug ? `${VERCEL_WEB}/${accountSlug}/${projectName}` : `${VERCEL_WEB}/dashboard`;
}

function toLinkDto(
  link: LinkRow,
  project: { currentVersion: number; dirtySinceSnapshot: boolean },
  accountSlug: string | null,
): VercelLinkDto {
  return {
    vercelProjectId: link.vercelProjectId,
    vercelProjectName: link.vercelProjectName,
    source: link.source as VercelSource,
    framework: link.framework,
    buildCommand: link.buildCommand,
    installCommand: link.installCommand,
    outputDirectory: link.outputDirectory,
    rootDirectory: link.rootDirectory,
    nodeVersion: link.nodeVersion,
    gitRepoId: link.gitRepoId,
    gitOwner: link.gitOwner,
    gitRepo: link.gitRepo,
    gitBranch: link.gitBranch,
    productionUrl: link.productionUrl,
    dashboardUrl: dashboardUrl(accountSlug, link.vercelProjectName),
    lastDeploymentId: link.lastDeploymentId,
    lastDeploymentUrl: link.lastDeploymentUrl,
    lastDeployState: link.lastDeployState,
    lastDeployedVersion: link.lastDeployedVersion,
    lastDeployedAt: link.lastDeployedAt?.toISOString() ?? null,
    lastError: link.lastError,
    currentVersion: project.currentVersion,
    dirty: project.dirtySinceSnapshot,
  };
}

export function toDeploymentDto(row: DeploymentRow): VercelDeploymentDto {
  return {
    deploymentId: row.vercelDeploymentId,
    source: row.source as VercelSource,
    readyState: row.readyState,
    url: row.url,
    aliasUrl: row.aliasUrl,
    branch: row.branch,
    version: row.version,
    fileCount: row.fileCount,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Status — polled every 2 s by the header. Never calls Vercel.
 * ------------------------------------------------------------------ */

const NOT_CONFIGURED: VercelStatusDto = {
  configured: false,
  connected: false,
  connection: null,
  link: null,
  activeDeployment: null,
  githubConnected: false,
};

export async function getStatus(userId: number, projectId: number | null): Promise<VercelStatusDto> {
  // Cheap and never throws: the frontend hides the button entirely when false.
  if (!isVercelConfigured()) return NOT_CONFIGURED;

  const [connection, github] = await Promise.all([
    prisma.vercelConnection.findUnique({ where: { userId } }),
    prisma.githubConnection.findUnique({ where: { userId }, select: { isActive: true } }),
  ]);
  const connected = !!connection?.isActive;

  let link: VercelLinkDto | null = null;
  let activeDeployment: VercelDeploymentDto | null = null;
  if (connected && projectId !== null) {
    const project = await prisma.codeProject.findFirst({
      where: { id: projectId, userId, isDeleted: false },
      select: { currentVersion: true, dirtySinceSnapshot: true, vercelLink: true },
    });
    if (project?.vercelLink) link = toLinkDto(project.vercelLink, project, connection!.accountSlug);
    if (project) {
      const active = await findActiveDeployment(projectId);
      if (active) {
        activeDeployment = toDeploymentDto(active);
        // Self-healing after a server restart: an in-flight row that no process is
        // watching would otherwise spin forever in the header.
        try {
          ensureWatched(active.id, ctxFor(connection!));
        } catch {
          // Token unreadable — the next real action surfaces the reconnect prompt.
        }
      }
    }
  }

  return {
    configured: true,
    connected,
    connection: connected
      ? {
          accountName: connection!.accountName,
          accountSlug: connection!.accountSlug,
          avatarUrl: connection!.accountAvatarUrl,
          isTeam: !!connection!.teamId,
        }
      : null,
    link,
    activeDeployment,
    githubConnected: !!github?.isActive,
  };
}

/* ------------------------------------------------------------------ *
 * Connect flow
 * ------------------------------------------------------------------ */

export function createInstallUrl(userId: number, projectId: number | null, redirectPath?: string) {
  assertConfigured();
  const state = signState({ userId, projectId, redirectPath: redirectPath ?? "/" });
  return { url: installUrl(state) };
}

interface VercelUserRaw {
  user: { id: string; username?: string | null; name?: string | null; email?: string | null; avatar?: string | null };
}
interface VercelTeamRaw {
  id: string;
  slug: string;
  name?: string | null;
  avatar?: string | null;
}

function avatarUrl(hash: string | null | undefined): string | null {
  return hash ? `${VERCEL_WEB}/api/www/avatar/${encodeURIComponent(hash)}?s=64` : null;
}

/**
 * Vercel redirects the popup here after the user installs the integration.
 * Returns the frontend URL to send the popup to — success or a readable error,
 * never a raw exception page.
 *
 * `next` (also in the query) is deliberately ignored: it points back into
 * Vercel's dashboard, but we opened this popup ourselves and close it from our
 * own landing page. Following it would strand the user on vercel.com.
 */
export async function handleCallback(query: {
  code?: string;
  state?: string;
  configurationId?: string;
  teamId?: string;
  error?: string;
  error_description?: string;
}): Promise<string> {
  const { frontendCallbackUrl } = getVercelConfig();
  const back = (params: Record<string, string>) => {
    const url = new URL(frontendCallbackUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  };

  try {
    if (query.error) {
      return back({ status: "error", message: query.error_description || "Vercel authorization was cancelled" });
    }
    if (!query.state) throw new ApiError("Missing authorization state", STATUS_CODES.BAD_REQUEST);
    const state = verifyState(query.state);
    if (!query.code) throw new ApiError("Vercel did not return an authorization code — try again", STATUS_CODES.BAD_REQUEST);

    const token = await exchangeCodeForToken(query.code);
    // Trust the token exchange, not the query string, for scope.
    const teamId = token.team_id || null;
    const ctx = { token: token.access_token, teamId };

    const me = await vercelJson<VercelUserRaw>("/v2/user", { token: token.access_token });
    let accountName = me.user.name || me.user.username || null;
    let accountSlug = me.user.username || null;
    let accountAvatar = avatarUrl(me.user.avatar);
    if (teamId) {
      const team = await vercelJson<VercelTeamRaw>(`/v2/teams/${encodeURIComponent(teamId)}`, ctx);
      accountName = team.name || team.slug;
      accountSlug = team.slug;
      accountAvatar = avatarUrl(team.avatar);
    }

    const previous = await prisma.vercelConnection.findUnique({ where: { userId: state.userId } });
    const fields = {
      configurationId: token.installation_id || query.configurationId || "",
      vercelUserId: token.user_id || me.user.id,
      teamId,
      accountName,
      accountSlug,
      accountAvatarUrl: accountAvatar,
      accessTokenEnc: encryptToken(token.access_token),
      isActive: true,
    };
    await prisma.$transaction(async (tx) => {
      // Reconnecting into a different Vercel scope: the old links point at
      // projects this token can't see. Drop them (the Vercel projects stay).
      if (previous && previous.teamId !== teamId) {
        await tx.vercelProjectLink.deleteMany({ where: { connectionId: previous.id } });
      }
      await tx.vercelConnection.upsert({
        where: { userId: state.userId },
        create: { userId: state.userId, ...fields },
        update: fields,
      });
    });

    return back({ status: "success", account: accountName ?? "" });
  } catch (error: any) {
    if (!error?.statusCode) console.error("[vercel] callback error", error);
    return back({ status: "error", message: error?.message || "Could not connect Vercel" });
  }
}

/**
 * Removes the connection (links and deployment history cascade). Nothing on
 * Vercel is deleted — not the projects, not the live sites. The integration
 * install is removed best-effort so it doesn't linger in the user's dashboard.
 */
export async function disconnect(userId: number) {
  const connection = await prisma.vercelConnection.findUnique({ where: { userId } });
  if (!connection) return { disconnected: false, revoked: false };

  let revoked = false;
  if (connection.configurationId) {
    try {
      const ctx = ctxFor(connection);
      await vercelRequest(`/v1/integrations/configuration/${encodeURIComponent(connection.configurationId)}`, {
        ...ctx,
        method: "DELETE",
        allowStatuses: [403, 404],
      });
      revoked = true;
    } catch {
      // Token already dead, or the scope is missing — disconnect locally anyway.
    }
  }
  await prisma.vercelConnection.delete({ where: { id: connection.id } });
  return { disconnected: true, revoked };
}

/* ------------------------------------------------------------------ *
 * Links, detection, history
 * ------------------------------------------------------------------ */

export async function getLink(userId: number, projectId: number) {
  const project = await requireOwnProject(userId, projectId);
  const link = await prisma.vercelProjectLink.findUnique({ where: { projectId }, include: { connection: true } });
  return link ? toLinkDto(link, project, link.connection.accountSlug) : null;
}

export async function detect(userId: number, projectId: number, source: "files" | "git"): Promise<VercelDetectDto> {
  assertConfigured();
  const connection = await requireConnection(userId);
  const project = await requireOwnProject(userId, projectId);
  const link = await prisma.vercelProjectLink.findUnique({ where: { projectId } });

  const detected = detectVercelConfig(await readFiles(projectId), project.framework);
  // A Git deploy builds the repo, not these files — don't block on the editor's contents.
  if (source === "git" && !detected.deployable) {
    detected.deployable = true;
    detected.blockedReason = null;
    detected.reason = "Couldn't detect a framework from this project's files — Vercel will detect it from the repo.";
  }

  const suggestedName = link?.vercelProjectName ?? slugifyProjectName(project.title);
  const name = await checkName(ctxFor(connection), suggestedName, link?.vercelProjectId ?? null);
  return { ...detected, suggestedName, nameAvailable: name.available, nameSuggestion: name.suggestion };
}

/** Recent deploys, newest first. Also reconciles a Vercel-initiated (git push) deploy we never saw. */
export async function listDeployments(userId: number, projectId: number) {
  await requireOwnProject(userId, projectId);
  const link = await prisma.vercelProjectLink.findUnique({ where: { projectId }, include: { connection: true } });
  if (!link) return { deployments: [] };

  if (link.source === "GIT") {
    try {
      await reconcileGitDeploys(link, ctxFor(link.connection));
    } catch (error) {
      console.warn("[vercel] reconcile failed", error);
    }
  }

  const rows = await prisma.vercelDeployment.findMany({ where: { projectId }, orderBy: { startedAt: "desc" }, take: 10 });
  return { deployments: rows.map(toDeploymentDto) };
}

interface VercelListedDeployment {
  uid: string;
  url: string | null;
  state?: string;
  readyState?: string;
  created: number;
  meta?: { githubCommitRef?: string; githubCommitSha?: string } | null;
}

async function reconcileGitDeploys(link: LinkRow & { connection: { id: number } }, ctx: VercelCtx) {
  const res = await vercelJson<{ deployments: VercelListedDeployment[] }>(
    `/v6/deployments?projectId=${encodeURIComponent(link.vercelProjectId)}&target=production&limit=5`,
    ctx,
  );
  const known = new Set(
    (await prisma.vercelDeployment.findMany({
      where: { vercelDeploymentId: { in: res.deployments.map((d) => d.uid) } },
      select: { vercelDeploymentId: true },
    })).map((r) => r.vercelDeploymentId),
  );
  for (const d of res.deployments) {
    if (known.has(d.uid)) continue;
    const state = (d.readyState ?? d.state ?? "QUEUED").toUpperCase();
    await prisma.vercelDeployment.create({
      data: {
        linkId: link.id,
        projectId: link.projectId,
        vercelDeploymentId: d.uid,
        source: "GIT",
        readyState: state,
        url: withHttps(d.url),
        branch: d.meta?.githubCommitRef ?? link.gitBranch,
        commitSha: d.meta?.githubCommitSha ?? null,
        startedAt: new Date(d.created),
        finishedAt: ["READY", "ERROR", "CANCELED"].includes(state) ? new Date(d.created) : null,
      },
    });
  }
}

export async function getDeployment(userId: number, projectId: number, deploymentId: string) {
  await requireOwnProject(userId, projectId);
  const row = await prisma.vercelDeployment.findFirst({ where: { projectId, vercelDeploymentId: deploymentId } });
  if (!row) throw new ApiError("Deployment not found", STATUS_CODES.NOT_FOUND);
  return { ...toDeploymentDto(row), logTail: row.logTail ?? "" };
}

export async function unlinkProject(userId: number, projectId: number) {
  await requireOwnProject(userId, projectId);
  // Deployments cascade from the link. The Vercel project and its site stay up.
  await prisma.vercelProjectLink.deleteMany({ where: { projectId } });
  return { unlinked: true };
}

/* ------------------------------------------------------------------ *
 * Deploy — pre-flight only. Everything that can fail with a code the UI
 * branches on happens here, before the controller opens the SSE stream.
 * ------------------------------------------------------------------ */

export interface StartedDeploy {
  rowId: number;
  vercelDeploymentId: string;
  projectId: number;
  linkId: number;
  ctx: VercelCtx;
  projectName: string;
  source: VercelSource;
  readyState: string;
  url: string | null;
  inspectorUrl: string | null;
  dashboardUrl: string;
  envWarnings: { key: string; message: string }[];
}

function settingsOf(input: DeployInput): ProjectSettings {
  return {
    framework: input.framework,
    buildCommand: input.buildCommand,
    installCommand: input.installCommand,
    devCommand: input.devCommand,
    outputDirectory: input.outputDirectory,
    rootDirectory: input.rootDirectory,
    nodeVersion: input.nodeVersion,
  };
}

function inProgress(deploymentId: string) {
  return Object.assign(
    new ApiError("A deployment for this project is already running", STATUS_CODES.CONFLICT),
    { code: "DEPLOY_IN_PROGRESS", details: { deploymentId } },
  );
}

export async function startDeploy(userId: number, projectId: number, input: DeployInput): Promise<StartedDeploy> {
  assertConfigured();
  const connection = await requireConnection(userId);
  const ctx = ctxFor(connection);
  const project = await requireOwnProject(userId, projectId);
  if (project.status === "GENERATING") {
    throw Object.assign(
      new ApiError("The AI is still writing this project — publish it when it finishes", STATUS_CODES.CONFLICT),
      { code: "PROJECT_GENERATING" },
    );
  }

  const source: VercelSource = input.source === "git" ? "GIT" : "FILES";
  if (source === "GIT") {
    const github = await prisma.githubConnection.findUnique({ where: { userId }, select: { isActive: true } });
    if (!github?.isActive) {
      throw Object.assign(new ApiError("Connect your GitHub account first", STATUS_CODES.CONFLICT), {
        code: "GITHUB_NOT_CONNECTED",
      });
    }
  }

  const active = await findActiveDeployment(projectId);
  if (active) throw inProgress(active.vercelDeploymentId);

  return serialise(projectId, async () => {
    // Re-check inside the queue: a second click may have been waiting behind the first.
    const raced = await findActiveDeployment(projectId);
    if (raced) throw inProgress(raced.vercelDeploymentId);

    const settings = settingsOf(input);
    const existing = await prisma.vercelProjectLink.findUnique({ where: { projectId } });

    let encoded: ReturnType<typeof encodeFiles> | null = null;
    let version: number | null = null;
    if (source === "GIT") {
      // A git deploy ships what is on the repo, not what is in the editor. The
      // GitHub mirror knows which project version that repo holds, so record it
      // to compare against. Only when the mirror is the same repo being deployed.
      const mirror = await prisma.githubRepoLink.findUnique({
        where: { projectId },
        select: { owner: true, repo: true, lastPushedVersion: true },
      });
      const sameRepo =
        !!mirror &&
        mirror.owner.toLowerCase() === input.git!.owner.toLowerCase() &&
        mirror.repo.toLowerCase() === input.git!.repo.toLowerCase();
      version = sameRepo ? mirror!.lastPushedVersion : null;
    }
    if (source === "FILES") {
      // Same as the GitHub Push button: editor edits become a USER version
      // first, so "what's live" maps to exactly one version.
      await snapshotUserEditsIfDirty(projectId);
      const files = await readFiles(projectId);
      const fresh = await prisma.codeProject.findUniqueOrThrow({ where: { id: projectId }, select: { currentVersion: true } });
      version = fresh.currentVersion;

      const detected = detectVercelConfig(files, project.framework);
      if (!detected.deployable) {
        throw Object.assign(new ApiError(detected.blockedReason ?? "This project can't be published", STATUS_CODES.BAD_REQUEST), {
          code: "NOT_DEPLOYABLE",
          details: { reason: detected.blockedReason },
        });
      }
      encoded = encodeFiles(files);
    }

    const vercelProject = await ensureVercelProject(ctx, {
      // Switching FILES -> GIT keeps the same Vercel project; ensureVercelProject links it.
      existingId: existing?.vercelProjectId ?? null,
      name: input.name,
      settings,
      git: source === "GIT" ? { owner: input.git!.owner, repo: input.git!.repo } : undefined,
    });

    const envWarnings = await syncEnvVars(ctx, vercelProject.id, input.envVars);

    const meta = { source: "colab-code-workspace", codeProjectId: String(projectId), ...(version !== null ? { codeVersion: String(version) } : {}) };
    const deployment =
      source === "FILES"
        ? await deployFiles(ctx, { project: vercelProject, files: encoded!, settings, meta })
        : await deployGit(ctx, { project: vercelProject, repoId: input.git!.repoId, branch: input.git!.branch, meta });

    const state = deploymentState(deployment);
    const linkData = {
      connectionId: connection.id,
      vercelProjectId: vercelProject.id,
      vercelProjectName: vercelProject.name,
      source,
      ...settings,
      gitRepoId: source === "GIT" ? input.git!.repoId : null,
      gitOwner: source === "GIT" ? input.git!.owner : null,
      gitRepo: source === "GIT" ? input.git!.repo : null,
      gitBranch: source === "GIT" ? input.git!.branch : null,
      productionUrl: productionUrlOf(vercelProject) ?? existing?.productionUrl ?? null,
      lastDeploymentId: deployment.id,
      lastDeploymentUrl: withHttps(deployment.url),
      lastDeployState: state,
      lastError: null,
    };

    const { link, row } = await prisma.$transaction(async (tx) => {
      const link = await tx.vercelProjectLink.upsert({
        where: { projectId },
        create: { projectId, ...linkData },
        update: linkData,
      });
      const row = await tx.vercelDeployment.create({
        data: {
          linkId: link.id,
          projectId,
          vercelDeploymentId: deployment.id,
          source,
          readyState: state,
          url: withHttps(deployment.url),
          branch: source === "GIT" ? input.git!.branch : null,
          version,
          fileCount: encoded?.files.length ?? null,
        },
      });
      return { link, row };
    });

    return {
      rowId: row.id,
      vercelDeploymentId: deployment.id,
      projectId,
      linkId: link.id,
      ctx,
      projectName: vercelProject.name,
      source,
      readyState: state,
      url: withHttps(deployment.url),
      inspectorUrl: deployment.inspectorUrl ?? null,
      dashboardUrl: dashboardUrl(connection.accountSlug, vercelProject.name),
      envWarnings,
    };
  });
}

/** Redeploy with the link's stored settings — no dialog, no questions. */
export async function redeploy(userId: number, projectId: number, envVars: VercelEnvVarInput[]): Promise<StartedDeploy> {
  const link = await prisma.vercelProjectLink.findUnique({ where: { projectId } });
  if (!link) throw new ApiError("This project hasn't been published yet", STATUS_CODES.NOT_FOUND);
  const isGit = link.source === "GIT";
  if (isGit && (!link.gitRepoId || !link.gitOwner || !link.gitRepo)) {
    throw new ApiError("This project's GitHub link is incomplete — publish it again from the Publish dialog", STATUS_CODES.BAD_REQUEST);
  }
  return startDeploy(userId, projectId, {
    source: isGit ? "git" : "files",
    name: link.vercelProjectName,
    framework: link.framework as DeployInput["framework"],
    buildCommand: link.buildCommand,
    installCommand: link.installCommand,
    devCommand: link.devCommand,
    outputDirectory: link.outputDirectory,
    rootDirectory: link.rootDirectory,
    nodeVersion: link.nodeVersion,
    envVars,
    git: isGit ? { repoId: link.gitRepoId!, owner: link.gitOwner!, repo: link.gitRepo!, branch: link.gitBranch ?? "main" } : undefined,
  });
}

/** For re-attaching a log stream: the row, plus a context to keep following it. */
export async function prepareAttach(userId: number, projectId: number, deploymentId: string) {
  await requireOwnProject(userId, projectId);
  const row = await prisma.vercelDeployment.findFirst({
    where: { projectId, vercelDeploymentId: deploymentId },
    include: { link: { select: { vercelProjectName: true } } },
  });
  if (!row) throw new ApiError("Deployment not found", STATUS_CODES.NOT_FOUND);
  const connection = await requireConnection(userId);
  return { row, ctx: ctxFor(connection), dashboardUrl: dashboardUrl(connection.accountSlug, row.link.vercelProjectName) };
}

export async function cancel(userId: number, projectId: number, deploymentId: string) {
  const { row, ctx } = await prepareAttach(userId, projectId, deploymentId);
  await cancelDeployment(ctx, row.vercelDeploymentId);
  return { canceled: true };
}
