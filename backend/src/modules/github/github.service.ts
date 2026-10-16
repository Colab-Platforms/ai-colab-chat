import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import {
  exchangeCodeForUserToken,
  forgetInstallationToken,
  getGithubConfig,
  getInstallationToken,
  getPermissionState,
  getUserToken,
  isGithubConfigured,
  userTokenFields,
} from "./github.app.js";
import { GithubHttpError, githubJson, githubRaw, githubRequest } from "./github.api.js";
import { pullProject, pushProject, remoteHasCommits } from "./github.sync.js";
import {
  GITHUB_WEB,
  REMOTE_AHEAD_MARK,
  type GithubLinkDto,
  type GithubOauthState,
  type GithubPullResultDto,
  type GithubPushResultDto,
  type GithubRepoDto,
  type GithubStatusDto,
} from "./github.types.js";

/* ------------------------------------------------------------------ *
 * OAuth state — a signed, 10-minute JWT (same approach as the Google
 * sign-in in auth.service.ts). The callback arrives from GitHub with no
 * Bearer header, so the user id has to travel inside the state.
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

function signState(payload: Omit<GithubOauthState, "nonce">): string {
  const full: GithubOauthState = { nonce: randomUUID(), ...payload, redirectPath: sanitizeRedirectPath(payload.redirectPath) };
  // A distinct `purpose` claim so a login JWT can never be replayed as a state, or vice versa.
  return jwt.sign({ ...full, purpose: "github-oauth" }, jwtSecret(), { expiresIn: "10m" });
}

function verifyState(state: string): GithubOauthState {
  try {
    const decoded = jwt.verify(state, jwtSecret()) as Partial<GithubOauthState> & { purpose?: string };
    if (decoded.purpose !== "github-oauth" || typeof decoded.userId !== "number" || !decoded.nonce) {
      throw new Error("bad state");
    }
    return {
      nonce: decoded.nonce,
      userId: decoded.userId,
      projectId: typeof decoded.projectId === "number" ? decoded.projectId : null,
      redirectPath: sanitizeRedirectPath(decoded.redirectPath),
    };
  } catch {
    throw Object.assign(new ApiError("Invalid or expired GitHub authorization state", STATUS_CODES.BAD_REQUEST), {
      code: "invalid_oauth_state",
    });
  }
}

/* ------------------------------------------------------------------ *
 * Shared lookups (every one is scoped by userId — never trust the body)
 * ------------------------------------------------------------------ */

async function requireConnection(userId: number) {
  const connection = await prisma.githubConnection.findUnique({ where: { userId } });
  if (!connection || !connection.isActive) {
    throw new ApiError("Connect your GitHub account first", STATUS_CODES.NOT_FOUND);
  }
  return connection;
}

async function requireOwnProject(userId: number, projectId: number) {
  const project = await prisma.codeProject.findFirst({
    where: { id: projectId, userId, isDeleted: false },
    select: { id: true, title: true, currentVersion: true, dirtySinceSnapshot: true, status: true },
  });
  if (!project) throw new ApiError("Project not found", STATUS_CODES.NOT_FOUND);
  return project;
}

function assertConfigured() {
  if (!isGithubConfigured()) {
    throw new ApiError("GitHub integration is not enabled on this server", STATUS_CODES.SERVER_ERROR);
  }
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

function toLinkDto(
  link: NonNullable<Awaited<ReturnType<typeof findLinkRow>>>,
  project: { currentVersion: number; dirtySinceSnapshot: boolean },
): GithubLinkDto {
  return {
    owner: link.owner,
    repo: link.repo,
    branch: link.branch,
    htmlUrl: link.htmlUrl,
    isPrivate: link.isPrivate,
    autoPush: link.autoPush,
    lastCommitSha: link.lastCommitSha,
    lastPushedVersion: link.lastPushedVersion,
    lastSyncedAt: link.lastSyncedAt?.toISOString() ?? null,
    syncState: link.syncState as GithubLinkDto["syncState"],
    lastError: link.lastError,
    needsPull: !!link.lastError?.startsWith(REMOTE_AHEAD_MARK),
    currentVersion: project.currentVersion,
    dirty: project.dirtySinceSnapshot,
  };
}

function findLinkRow(projectId: number) {
  return prisma.githubRepoLink.findUnique({ where: { projectId } });
}

export async function getStatus(userId: number, projectId: number | null): Promise<GithubStatusDto> {
  // Cheap and never throws: the frontend hides the button entirely when false.
  if (!isGithubConfigured()) return { configured: false, connected: false, connection: null, link: null };

  const connection = await prisma.githubConnection.findUnique({
    where: { userId },
    select: { accountLogin: true, accountType: true, accountAvatarUrl: true, isActive: true, installationId: true },
  });
  const connected = !!connection?.isActive;

  let link: GithubLinkDto | null = null;
  if (connected && projectId !== null) {
    const project = await prisma.codeProject.findFirst({
      where: { id: projectId, userId, isDeleted: false },
      select: { currentVersion: true, dirtySinceSnapshot: true },
    });
    const row = project ? await findLinkRow(projectId) : null;
    if (project && row) link = toLinkDto(row, project);
  }

  return {
    configured: true,
    connected,
    connection: connected
      ? {
          login: connection!.accountLogin,
          accountType: connection!.accountType,
          avatarUrl: connection!.accountAvatarUrl,
          manageUrl: installationSettingsUrl(connection!.installationId),
        }
      : null,
    link,
  };
}

/* ------------------------------------------------------------------ *
 * Connect flow
 * ------------------------------------------------------------------ */

/**
 * Entry point for the Connect button.
 *
 * Deliberately the OAuth authorize endpoint and NOT
 * `/apps/<slug>/installations/new`: that install URL only runs the
 * install+authorize flow while the app is *not yet installed*. Once it is,
 * GitHub silently sends the user to the installation's settings page instead,
 * which never redirects back here — so the user appears to connect, and nothing
 * is ever stored. `/login/oauth/authorize` works in both states: it prompts to
 * install when needed, and otherwise returns a `code` straight away.
 */
export function createAuthorizeUrl(userId: number, projectId: number | null, redirectPath?: string) {
  assertConfigured();
  const { clientId, callbackUrl } = getGithubConfig();
  const state = signState({ userId, projectId, redirectPath: redirectPath ?? "/" });
  const url = new URL(`${GITHUB_WEB}/login/oauth/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("state", state);
  return { url: url.toString() };
}

/** Where to send someone to add or remove the repositories the app can reach. */
export function installationSettingsUrl(installationId: string | null) {
  const { appSlug } = getGithubConfig();
  return installationId
    ? `${GITHUB_WEB}/settings/installations/${installationId}`
    : `${GITHUB_WEB}/apps/${appSlug}/installations/new`;
}

interface GithubInstallation {
  id: number;
  account: { login: string; type: string; avatar_url: string | null } | null;
  suspended_at?: string | null;
}

/**
 * GitHub redirects the popup here after the user installs (or reconfigures) the
 * app. Returns the frontend URL to send the popup to — success or a readable
 * error, never a raw exception page.
 */
export async function handleCallback(query: {
  code?: string;
  state?: string;
  installation_id?: string;
  error?: string;
  error_description?: string;
}): Promise<string> {
  const { frontendCallbackUrl } = getGithubConfig();
  const back = (params: Record<string, string>) => {
    const url = new URL(frontendCallbackUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
  };

  try {
    if (query.error) {
      return back({ status: "error", message: query.error_description || "GitHub authorization was cancelled" });
    }
    if (!query.state) throw new ApiError("Missing authorization state", STATUS_CODES.BAD_REQUEST);
    const state = verifyState(query.state);

    if (!query.code) {
      throw new ApiError(
        "GitHub did not return an authorization code — enable \"Request user authorization (OAuth) during installation\" on the GitHub App",
        STATUS_CODES.BAD_REQUEST,
      );
    }

    const tokenResponse = await exchangeCodeForUserToken(query.code);
    const userToken = tokenResponse.access_token;

    // Never trust `installation_id` from the query string on its own: a user
    // could paste someone else's. Only accept one the user's own token can see.
    const list = await githubJson<{ installations: GithubInstallation[] }>("/user/installations?per_page=100", { token: userToken });
    const usable = list.installations.filter((i) => !i.suspended_at && i.account);

    // Who actually authorized in the popup. This is the browser's GitHub
    // session, and may not be the account the user expects.
    const me = await githubJson<{ login: string }>("/user", { token: userToken });

    // Only installations this person may legitimately act through: their OWN
    // account's, or an organization's. A *personal* installation belonging to
    // someone else can show up in /user/installations too (shared access), but
    // attaching it would let this user push through another person's account —
    // and `POST /user/repos` would create repos under the wrong account and 403.
    const eligible = usable.filter(
      (i) => i.account!.type === "Organization" || i.account!.login.toLowerCase() === me.login.toLowerCase(),
    );

    // Authorizing does not install. Someone who authorized first (or whose only
    // installation is someone else's) has a token and nothing to use — send them
    // to the install page for their own account instead of a dead end.
    if (eligible.length === 0) {
      return installationSettingsUrl(null) + `?state=${encodeURIComponent(query.state)}`;
    }

    // An explicit installation_id (the install flow) wins; otherwise prefer the
    // authorizing user's own account, then any organization.
    const chosen =
      eligible.find((i) => String(i.id) === query.installation_id) ??
      eligible.find((i) => i.account!.login.toLowerCase() === me.login.toLowerCase()) ??
      eligible[0];
    if (!chosen.account) {
      throw new ApiError("Could not read your GitHub installation — try connecting again", STATUS_CODES.BAD_REQUEST);
    }

    const fields = {
      installationId: String(chosen.id),
      accountLogin: chosen.account.login,
      accountType: chosen.account.type,
      accountAvatarUrl: chosen.account.avatar_url,
      isActive: true,
      ...userTokenFields(tokenResponse),
    };
    await prisma.githubConnection.upsert({
      where: { userId: state.userId },
      create: { userId: state.userId, ...fields },
      update: fields,
    });

    return back({ status: "success", login: chosen.account.login });
  } catch (error: any) {
    if (!error?.statusCode) console.error("[github] callback error", error);
    return back({ status: "error", message: error?.message || "Could not connect GitHub" });
  }
}

/**
 * Removes the connection and its links. Deliberately touches nothing else: no
 * CodeFile, no CodeProjectVersion, and the GitHub repos themselves stay.
 * The GitHub-side installation is left in place too — uninstalling is the
 * user's call, and reconnecting later then needs no reinstall.
 */
export async function disconnect(userId: number) {
  const connection = await prisma.githubConnection.findUnique({ where: { userId }, select: { id: true, installationId: true } });
  if (!connection) return { disconnected: false };
  await prisma.githubConnection.delete({ where: { id: connection.id } }); // links cascade
  forgetInstallationToken(connection.installationId);
  return { disconnected: true };
}

/* ------------------------------------------------------------------ *
 * Repositories
 * ------------------------------------------------------------------ */

interface GithubRepoRaw {
  permissions?: { admin?: boolean; maintain?: boolean; push?: boolean };
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
  updated_at: string | null;
  owner: { login: string };
}

function toRepoDto(r: GithubRepoRaw): GithubRepoDto {
  return {
    id: String(r.id),
    name: r.name,
    fullName: r.full_name,
    owner: r.owner.login,
    isPrivate: r.private,
    htmlUrl: r.html_url,
    defaultBranch: r.default_branch,
    updatedAt: r.updated_at,
    accessible: true,
  };
}

/** Repos the user has granted to the installation. Filtering is server-side: GitHub has no search here. */
export async function listRepos(userId: number, query: string) {
  assertConfigured();
  const connection = await requireConnection(userId);
  const token = await getUserToken(connection);

  const repos: GithubRepoRaw[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await githubJson<{ repositories: GithubRepoRaw[] }>(
      `/user/installations/${connection.installationId}/repositories?per_page=100&page=${page}`,
      { token },
    );
    repos.push(...res.repositories);
    if (res.repositories.length < 100) break;
  }

  const needle = query.trim().toLowerCase();
  const filtered = needle ? repos.filter((r) => r.full_name.toLowerCase().includes(needle)) : repos;
  filtered.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  return { repos: filtered.slice(0, 100).map(toRepoDto), total: filtered.length };
}

/**
 * Builds the error for "GitHub refused to create a repository", including the
 * page where the user can fix it with one click — the Bolt-style "Authorize"
 * step, so the permission is requested at the moment it is needed:
 *
 *   - the installation has not accepted `administration: write` yet
 *       -> that installation's "review new permissions" page
 *   - it has, but the token still cannot create repos (the connection was made
 *     under a different GitHub account than the installation)
 *       -> re-run the authorize flow, which re-attaches the right account
 *   - the App itself does not request the permission
 *       -> no URL: only the app owner can fix it, so the UI shows plain text
 */
async function repoCreationDenied(
  connection: { installationId: string; accountType: string; accountLogin: string },
  userId: number,
) {
  let authorizeUrl: string | null = null;
  let message = "GitHub needs your permission before this app can create repositories.";
  try {
    const { app, installation } = await getPermissionState(connection.installationId);
    if (app.administration !== "write") {
      message =
        "This GitHub App is not set up to create repositories. Create the repository on github.com and pick it from \"Select existing\", or ask the app owner to enable repository administration for the app.";
    } else if (installation.administration !== "write") {
      authorizeUrl =
        connection.accountType === "Organization"
          ? `${GITHUB_WEB}/organizations/${connection.accountLogin}/settings/installations/${connection.installationId}/permissions/update`
          : `${GITHUB_WEB}/settings/installations/${connection.installationId}/permissions/update`;
    } else {
      authorizeUrl = createAuthorizeUrl(userId, null).url;
      message = "GitHub could not confirm this account may create repositories. Authorize again to continue.";
    }
  } catch {
    // Could not inspect — still offer the safe fix.
    authorizeUrl = createAuthorizeUrl(userId, null).url;
  }
  return Object.assign(new ApiError(message, STATUS_CODES.FORBIDDEN), {
    code: "REPO_CREATE_FORBIDDEN",
    details: { authorizeUrl },
  });
}

export async function createRepo(
  userId: number,
  input: { name: string; description?: string; isPrivate: boolean },
): Promise<GithubRepoDto> {
  assertConfigured();
  const connection = await requireConnection(userId);
  const token = await getUserToken(connection);

  // auto_init stays false on purpose: pushes build the tree without a base_tree,
  // so an auto-created README would be erased by the first push.
  const body = { name: input.name, description: input.description || undefined, private: input.isPrivate, auto_init: false };
  const path = connection.accountType === "Organization" ? `/orgs/${connection.accountLogin}/repos` : "/user/repos";
  let created: GithubRepoRaw;
  try {
    created = await githubJson<GithubRepoRaw>(path, { token, method: "POST", body });
  } catch (error) {
    // 403 here is not a per-repo access problem (the repo does not exist yet): the
    // GitHub App itself lacks the permission to create repositories.
    if (error instanceof GithubHttpError && error.githubStatus === 403) {
      throw await repoCreationDenied(connection, userId);
    }
    throw error;
  }

  // A repo made after installing is invisible to the app until it is added.
  // An "All repositories" installation already covers it and answers 403/422 —
  // both are fine; any real access problem surfaces on the first push instead.
  await githubRequest(`/user/installations/${connection.installationId}/repositories/${created.id}`, {
    token,
    method: "PUT",
    allowStatuses: [403, 404, 422],
  });

  return toRepoDto(created);
}

/* ------------------------------------------------------------------ *
 * Project links
 * ------------------------------------------------------------------ */

export async function getLink(userId: number, projectId: number) {
  const project = await requireOwnProject(userId, projectId);
  const row = await findLinkRow(projectId);
  return row ? toLinkDto(row, project) : null;
}

export async function linkProject(
  userId: number,
  projectId: number,
  input: { owner: string; repo: string; initial: "push" | "pull"; overwrite?: boolean },
): Promise<{ link: GithubLinkDto; push: GithubPushResultDto | null; pull: GithubPullResultDto | null }> {
  assertConfigured();
  const connection = await requireConnection(userId);
  const project = await requireOwnProject(userId, projectId);
  if (project.status === "GENERATING") {
    throw new ApiError("The AI is still writing this project — link a repository when it finishes", STATUS_CODES.CONFLICT);
  }

  // Verifies the installation can reach the repo, and learns its default branch.
  const installationToken = await getInstallationToken(connection.installationId);
  const repo = await githubRaw<GithubRepoRaw>(`/repos/${input.owner}/${input.repo}`, { token: installationToken });
  if (!repo.ok || !repo.data) {
    throw new ApiError(
      "The GitHub App cannot access that repository — add it under the app's repository access on GitHub",
      STATUS_CODES.NOT_FOUND,
    );
  }

  // The installation token reaches everything the installation covers, so on its
  // own it proves nothing about THIS user. Make sure the person linking can
  // actually write to the repo — otherwise they could name any repo the
  // installation happens to see and push into it.
  const mine = await githubRaw<GithubRepoRaw>(`/repos/${input.owner}/${input.repo}`, { token: await getUserToken(connection) });
  const perms = mine.data?.permissions;
  if (!mine.ok || (perms && !(perms.push || perms.maintain || perms.admin))) {
    throw new ApiError("You don't have write access to that repository on GitHub", STATUS_CODES.FORBIDDEN);
  }
  const branch = repo.data.default_branch || "main";

  // Pushing over a repo that already has history would wipe it (no base_tree).
  // Make the caller choose explicitly instead of doing it silently.
  const hasCommits = await remoteHasCommits(connection.installationId, input.owner, input.repo, branch);
  if (input.initial === "push" && hasCommits && !input.overwrite) {
    throw Object.assign(
      new ApiError(
        "This repository already has commits. Pull them into the project, or confirm to overwrite them with the project's files.",
        STATUS_CODES.CONFLICT,
      ),
      { code: "REPO_NOT_EMPTY" },
    );
  }
  if (input.initial === "pull" && !hasCommits) {
    throw new ApiError("This repository is empty — there is nothing to pull. Push the project instead.", STATUS_CODES.BAD_REQUEST);
  }

  const data = {
    connectionId: connection.id,
    repoId: String(repo.data.id),
    owner: repo.data.owner.login,
    repo: repo.data.name,
    branch,
    htmlUrl: repo.data.html_url,
    isPrivate: repo.data.private,
    // Reset: a fresh link has no known remote position yet.
    lastCommitSha: null,
    lastPushedVersion: null,
    lastSyncedAt: null,
    syncState: "IDLE",
    lastError: null,
  };
  await prisma.githubRepoLink.upsert({
    where: { projectId },
    create: { projectId, ...data },
    update: data,
  });

  let push: GithubPushResultDto | null = null;
  let pull: GithubPullResultDto | null = null;
  if (input.initial === "push") push = await pushProject(projectId, { manual: true, force: true });
  else pull = await pullProject(projectId);

  const fresh = await requireOwnProject(userId, projectId);
  const row = (await findLinkRow(projectId))!;
  return { link: toLinkDto(row, fresh), push, pull };
}

export async function unlinkProject(userId: number, projectId: number) {
  await requireOwnProject(userId, projectId);
  await prisma.githubRepoLink.deleteMany({ where: { projectId } });
  return { unlinked: true };
}

export async function setAutoPush(userId: number, projectId: number, autoPush: boolean) {
  await requireOwnProject(userId, projectId);
  const result = await prisma.githubRepoLink.updateMany({ where: { projectId }, data: { autoPush } });
  if (result.count === 0) throw new ApiError("This project is not linked to a GitHub repository", STATUS_CODES.NOT_FOUND);
  return { autoPush };
}

export async function push(userId: number, projectId: number, force: boolean, message?: string) {
  assertConfigured();
  await requireOwnProject(userId, projectId);
  return pushProject(projectId, { manual: true, force, message });
}

export async function pull(userId: number, projectId: number) {
  assertConfigured();
  await requireOwnProject(userId, projectId);
  return pullProject(projectId);
}
