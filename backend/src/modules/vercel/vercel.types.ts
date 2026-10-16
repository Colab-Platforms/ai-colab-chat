export const VERCEL_API = "https://api.vercel.com";
export const VERCEL_WEB = "https://vercel.com";

/**
 * Where we send the user when Vercel refuses to link a GitHub repo because
 * their Vercel account has no GitHub connection (the guided "git-setup" step).
 * Neither page calls us back, so the UI asks the user to retry by hand.
 */
export const VERCEL_GIT_AUTH_URL = "https://vercel.com/account/settings/authentication";
export const VERCEL_GITHUB_APP_URL = "https://github.com/apps/vercel/installations/new";

/**
 * Vercel's `projectSettings.framework` presets we let the user pick. Vercel adds
 * presets over time; adding one here is a one-line change. `null` (no preset)
 * is always allowed on top of these.
 */
export const VERCEL_FRAMEWORKS = [
  "nextjs",
  "vite",
  "astro",
  "remix",
  "react-router",
  "nuxtjs",
  "sveltekit",
  "gatsby",
  "create-react-app",
  "vue",
  "svelte",
  "preact",
  "angular",
  "docusaurus-2",
] as const;
export type VercelFramework = (typeof VERCEL_FRAMEWORKS)[number];

export const VERCEL_NODE_VERSIONS = ["22.x", "20.x", "18.x"] as const;

/**
 * Cap on the inline `files` payload (base64). Projects are text-only and capped
 * at 80 files, so real ones are ~100 KB; past this, publishing from GitHub has
 * no limit and the `POST /v2/files` blob flow stays out of v1.
 */
export const MAX_DEPLOY_BYTES = 8_000_000;
/** Build log kept on VercelDeployment.logTail for replay. Trimmed from the front. */
export const LOG_TAIL_CHARS = 32_000;
/** After this many lines the stream stops forwarding logs (state is still tracked). */
export const MAX_LOG_LINES_STREAMED = 5_000;
export const DEPLOY_HARD_TIMEOUT_MS = 15 * 60_000;
/** How often the stream asks Vercel for readyState — the authority on "done". */
export const STATE_POLL_MS = 3_000;
/** The same, for a deploy whose browser went away. */
export const DETACHED_POLL_MS = 5_000;
/** Consecutive detached-poll failures before we stop tracking a deploy. */
export const MAX_DETACHED_FAILURES = 4;

export const ACTIVE_STATES = ["QUEUED", "INITIALIZING", "BUILDING"] as const;
export const TERMINAL_STATES = ["READY", "ERROR", "CANCELED"] as const;
export type DeployState = (typeof ACTIVE_STATES)[number] | (typeof TERMINAL_STATES)[number];

export function isTerminalState(state: string): boolean {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}

/** Resolved from env by getVercelConfig(). Never read at module load. */
export interface VercelConfig {
  clientId: string;
  clientSecret: string;
  integrationSlug: string;
  callbackUrl: string;
  frontendCallbackUrl: string;
}

/** Signed into the OAuth `state` param — the callback has no Bearer header. */
export interface VercelOauthState {
  nonce: string;
  userId: number;
  projectId: number | null;
  redirectPath: string;
}

/** Codes attached to an ApiError's `data` so the UI can branch without parsing text. */
export type VercelErrorCode =
  | "invalid_oauth_state"
  | "VERCEL_NOT_CONNECTED"
  | "VERCEL_REAUTH"
  | "VERCEL_INTEGRATION_DISABLED"
  | "VERCEL_GIT_NOT_CONNECTED"
  | "GITHUB_NOT_CONNECTED"
  | "PROJECT_NAME_TAKEN"
  | "NOT_DEPLOYABLE"
  | "NO_FILES"
  | "PROJECT_TOO_LARGE"
  | "PROJECT_GENERATING"
  | "DEPLOY_IN_PROGRESS"
  | "BRANCH_NOT_FOUND"
  | "DEPLOY_TIMEOUT";

/* ------------------------------------------------------------------ *
 * DTOs — tokens never appear in any of these.
 * ------------------------------------------------------------------ */

export interface VercelConnectionDto {
  accountName: string | null;
  accountSlug: string | null;
  avatarUrl: string | null;
  /** True when installed on a Team rather than a personal account. */
  isTeam: boolean;
}

export type VercelSource = "FILES" | "GIT";

export interface VercelLinkDto {
  vercelProjectId: string;
  vercelProjectName: string;
  source: VercelSource;
  framework: string | null;
  buildCommand: string | null;
  installCommand: string | null;
  outputDirectory: string | null;
  rootDirectory: string | null;
  nodeVersion: string | null;
  gitRepoId: string | null;
  gitOwner: string | null;
  gitRepo: string | null;
  gitBranch: string | null;
  productionUrl: string | null;
  dashboardUrl: string;
  lastDeploymentId: string | null;
  lastDeploymentUrl: string | null;
  lastDeployState: string;
  lastDeployedVersion: number | null;
  lastDeployedAt: string | null;
  lastError: string | null;
  /** The project's current version — ahead of lastDeployedVersion means unpublished work. */
  currentVersion: number;
  /** True when the editor has edits not yet in any version. */
  dirty: boolean;
}

export interface VercelDeploymentDto {
  /** Our row id is internal; this is Vercel's dpl_ id, used in every URL. */
  deploymentId: string;
  source: VercelSource;
  readyState: string;
  url: string | null;
  aliasUrl: string | null;
  branch: string | null;
  version: number | null;
  fileCount: number | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** GET /api/vercel/status — the single source of truth the header button reads. */
export interface VercelStatusDto {
  /** False when the server has no Vercel credentials — the button is hidden entirely. */
  configured: boolean;
  connected: boolean;
  connection: VercelConnectionDto | null;
  link: VercelLinkDto | null;
  /** Non-null while a deploy is mid-flight — drives the spinner and the re-attach. */
  activeDeployment: VercelDeploymentDto | null;
  /** Whether this user's GitHub integration is connected (gates "Deploy with GitHub"). */
  githubConnected: boolean;
}

export interface DetectedConfig {
  framework: VercelFramework | null;
  buildCommand: string | null;
  installCommand: string | null;
  outputDirectory: string | null;
  rootDirectory: string | null;
  devCommand: string | null;
  nodeVersion: string | null;
  deployable: boolean;
  blockedReason: string | null;
  /** One sentence shown under the fields: why these values. */
  reason: string;
  /** Env keys referenced in the source — prefills the env editor with empty values. */
  suggestedEnvKeys: string[];
}

/** GET /projects/:id/detect */
export interface VercelDetectDto extends DetectedConfig {
  suggestedName: string;
  nameAvailable: boolean;
  /** Set when the suggested name is taken — the next free one. */
  nameSuggestion: string | null;
}

export interface VercelEnvVarInput {
  key: string;
  value: string;
  target: ("production" | "preview" | "development")[];
  type: "encrypted" | "plain";
}

/** Body of POST /projects/:id/deploy, after Joi. */
export interface DeployInput {
  source: "files" | "git";
  name: string;
  framework: VercelFramework | null;
  buildCommand: string | null;
  installCommand: string | null;
  devCommand: string | null;
  outputDirectory: string | null;
  rootDirectory: string | null;
  nodeVersion: string | null;
  envVars: VercelEnvVarInput[];
  git?: { repoId: string; owner: string; repo: string; branch: string };
}
