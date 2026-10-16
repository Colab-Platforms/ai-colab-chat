export const GITHUB_API = "https://api.github.com";
export const GITHUB_WEB = "https://github.com";
export const GITHUB_API_VERSION = "2022-11-28";

/**
 * Prefix on GithubRepoLink.lastError when GitHub has commits this project has
 * not seen. Stored in the text column (rather than a new one) and mapped to
 * `needsPull` in the DTO, so the UI can offer Pull / Force push.
 */
export const REMOTE_AHEAD_MARK = "[remote-ahead]";

/** Resolved from env by getGithubConfig(). Never read at module load. */
export interface GithubConfig {
  appId: string;
  appSlug: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string | null;
  callbackUrl: string;
  frontendCallbackUrl: string;
}

/** Signed into the OAuth `state` param — the callback has no Bearer header. */
export interface GithubOauthState {
  nonce: string;
  userId: number;
  projectId: number | null;
  redirectPath: string;
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
  /** False when the installation can't reach it, so the UI can grey it out. */
  accessible: boolean;
}

export interface GithubConnectionDto {
  login: string;
  accountType: string;
  avatarUrl: string | null;
  /** GitHub page where the user grants the app access to more repositories. */
  manageUrl: string;
}

export type GithubSyncState = "IDLE" | "SYNCING" | "ERROR";

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
  /** GitHub has commits the project lacks — the UI offers Pull or Force push. */
  needsPull: boolean;
  /** The project's current version — ahead of lastPushedVersion means unpushed work. */
  currentVersion: number;
  /** True when the editor has edits not yet in any version. */
  dirty: boolean;
}

/** GET /api/github/status — the single source of truth the header button reads. */
export interface GithubStatusDto {
  configured: boolean;
  connected: boolean;
  connection: GithubConnectionDto | null;
  link: GithubLinkDto | null;
}

export interface GithubPushResultDto {
  pushed: boolean;
  commitSha: string | null;
  commitUrl: string | null;
  fileCount: number;
  /** Set when nothing needed pushing (tree identical to the last commit). */
  skippedReason?: string;
}

export interface GithubPullResultDto {
  version: number;
  fileCount: number;
  commitSha: string;
  /** Paths the remote had that we refused to import, with the reason. */
  skipped: { path: string; reason: string }[];
}

/**
 * Above this, inline tree contents are replaced by individually created blobs.
 * GitHub accepts large tree payloads but gets slow and error-prone near the cap.
 */
export const MAX_INLINE_TREE_BYTES = 4_000_000;

/** Concurrency when downloading blobs during a pull. */
export const BLOB_FETCH_CONCURRENCY = 8;

/** Not source code — never import these into the editor. */
export const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "tiff", "psd",
  "ico", "icns", "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "mp4", "wav", "ogg", "webm", "mov", "avi", "mkv",
  "zip", "gz", "tar", "rar", "7z", "bz2", "xz",
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "exe", "dll", "so", "dylib", "bin", "wasm", "class", "jar",
  "sqlite", "db", "pyc", "node",
]);
