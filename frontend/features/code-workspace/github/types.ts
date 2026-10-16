// Mirrors backend/src/modules/github/github.types.ts (DTOs only — tokens never reach the browser).

export type GithubSyncState = "IDLE" | "SYNCING" | "ERROR";

export interface GithubConnectionDto {
  login: string;
  accountType: string;
  avatarUrl: string | null;
  /** GitHub page where the user grants the app access to more repositories. */
  manageUrl: string;
}

export interface GithubLinkDto {
  owner: string;
  repo: string;
  branch: string;
  htmlUrl: string;
  isPrivate: boolean;
  autoPush: boolean;
  lastCommitSha: string | null;
  lastPushedVersion: number | null;
  lastSyncedAt: string | null;
  syncState: GithubSyncState;
  lastError: string | null;
  /** GitHub has commits the project lacks — offer Pull or Force push. */
  needsPull: boolean;
  currentVersion: number;
  /** Editor edits not yet held by any version. */
  dirty: boolean;
}

/** GET /api/github/status */
export interface GithubStatusDto {
  /** False when the server has no GitHub App credentials — the button is hidden entirely. */
  configured: boolean;
  connected: boolean;
  connection: GithubConnectionDto | null;
  link: GithubLinkDto | null;
}

export interface GithubRepoDto {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  htmlUrl: string;
  defaultBranch: string;
  updatedAt: string | null;
  accessible: boolean;
}

export interface GithubPushResultDto {
  pushed: boolean;
  commitSha: string | null;
  commitUrl: string | null;
  fileCount: number;
  skippedReason?: string;
}

export interface GithubPullResultDto {
  version: number;
  fileCount: number;
  commitSha: string;
  skipped: { path: string; reason: string }[];
}

/** Codes the backend attaches to an error's `data` so the UI can branch without parsing text. */
export type GithubErrorCode = "REPO_NOT_EMPTY" | "REMOTE_AHEAD" | "REPO_CREATE_FORBIDDEN" | "invalid_oauth_state";

/** The parts of an axios error the GitHub UI cares about. */
export function readGithubError(
  error: unknown,
  fallback: string,
): { message: string; code: string | null; status: number | null; authorizeUrl: string | null } {
  const res = (
    error as {
      response?: { status?: number; data?: { message?: unknown; data?: { code?: unknown; authorizeUrl?: unknown } | null } };
    }
  )?.response;
  const message = typeof res?.data?.message === "string" && res.data.message ? res.data.message : fallback;
  const code = typeof res?.data?.data?.code === "string" ? res.data.data.code : null;
  // Only ever follow an https GitHub URL the backend handed us.
  const url = res?.data?.data?.authorizeUrl;
  const authorizeUrl = typeof url === "string" && url.startsWith("https://github.com/") ? url : null;
  return { message, code, status: res?.status ?? null, authorizeUrl };
}
