// Mirrors backend/src/modules/vercel/vercel.types.ts (DTOs only — the Vercel token never reaches the browser).

export type VercelSource = "FILES" | "GIT";
export type DeployState = "QUEUED" | "INITIALIZING" | "BUILDING" | "READY" | "ERROR" | "CANCELED";

export const TERMINAL_STATES: readonly string[] = ["READY", "ERROR", "CANCELED"];

export interface VercelConnectionDto {
  accountName: string | null;
  accountSlug: string | null;
  avatarUrl: string | null;
  isTeam: boolean;
}

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
  /** Ahead of lastDeployedVersion means unpublished work. */
  currentVersion: number;
  /** Editor edits not yet held by any version. */
  dirty: boolean;
}

export interface VercelDeploymentDto {
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

/** GET /api/vercel/status */
export interface VercelStatusDto {
  /** False when the server has no Vercel credentials — the button is hidden entirely. */
  configured: boolean;
  connected: boolean;
  connection: VercelConnectionDto | null;
  link: VercelLinkDto | null;
  /** Non-null while a deploy is mid-flight. */
  activeDeployment: VercelDeploymentDto | null;
  githubConnected: boolean;
}

/** GET /api/vercel/projects/:id/detect */
export interface VercelDetectDto {
  framework: string | null;
  buildCommand: string | null;
  installCommand: string | null;
  outputDirectory: string | null;
  rootDirectory: string | null;
  devCommand: string | null;
  nodeVersion: string | null;
  deployable: boolean;
  blockedReason: string | null;
  reason: string;
  suggestedEnvKeys: string[];
  suggestedName: string;
  nameAvailable: boolean;
  nameSuggestion: string | null;
}

export interface EnvVarInput {
  key: string;
  value: string;
}

/** Body of POST /projects/:id/deploy. */
export interface DeployBody {
  source: "files" | "git";
  name: string;
  framework: string | null;
  buildCommand: string | null;
  installCommand: string | null;
  outputDirectory: string | null;
  rootDirectory: string | null;
  nodeVersion: string | null;
  envVars: EnvVarInput[];
  git?: { repoId: string; owner: string; repo: string; branch: string };
}

/** Vercel's presets we offer, in the order shown. "" is "no preset" (Other). */
export const FRAMEWORK_LABELS: Record<string, string> = {
  vite: "Vite",
  nextjs: "Next.js",
  "create-react-app": "Create React App",
  astro: "Astro",
  remix: "Remix",
  "react-router": "React Router",
  nuxtjs: "Nuxt",
  sveltekit: "SvelteKit",
  gatsby: "Gatsby",
  vue: "Vue",
  svelte: "Svelte",
  preact: "Preact",
  angular: "Angular",
  "docusaurus-2": "Docusaurus",
};

export const NODE_VERSIONS = ["22.x", "20.x", "18.x"] as const;

/** Events on the deploy / logs SSE streams. */
export type DeployStreamEvent =
  | {
      type: "deploy_created";
      deploymentId: string;
      url: string | null;
      inspectorUrl?: string | null;
      projectName?: string;
      source?: string;
      dashboardUrl?: string;
      attached?: boolean;
    }
  | { type: "state"; readyState: string }
  | { type: "log"; at: number; level: "info" | "error"; text: string; replay?: boolean }
  | { type: "env_warning"; key: string; message: string }
  | { type: "ping" }
  | { type: "ready"; url: string | null; aliasUrl: string | null; deploymentUrl: string | null; durationMs: number | null }
  | { type: "error"; code: string | null; message: string; details?: Record<string, unknown> | null }
  | { type: "canceled" };

/** Codes the backend attaches to an error's `data` so the UI can branch without parsing text. */
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

export interface VercelErrorInfo {
  message: string;
  code: string | null;
  status: number | null;
  details: {
    vercelAuthUrl: string | null;
    githubAppUrl: string | null;
    suggestion: string | null;
    reason: string | null;
    deploymentId: string | null;
    reconnect: boolean;
  };
}

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * The parts of an axios error (or a stream error shaped like one — see
 * deployStream.ts) the Vercel UI cares about. URLs are allowlisted: we only
 * ever open Vercel's or GitHub's own pages that the backend handed us.
 */
export function readVercelError(error: unknown, fallback: string): VercelErrorInfo {
  const res = (error as { response?: { status?: number; data?: { message?: unknown; data?: Record<string, unknown> | null } } })
    ?.response;
  const data = res?.data?.data ?? {};
  const message = str(res?.data?.message) ?? (error instanceof Error && !res ? error.message : null) ?? fallback;
  const vercelAuthUrl = str(data.vercelAuthUrl);
  const githubAppUrl = str(data.githubAppUrl);
  return {
    message,
    code: str(data.code),
    status: res?.status ?? null,
    details: {
      vercelAuthUrl: vercelAuthUrl?.startsWith("https://vercel.com/") ? vercelAuthUrl : null,
      githubAppUrl: githubAppUrl?.startsWith("https://github.com/") ? githubAppUrl : null,
      suggestion: str(data.suggestion),
      reason: str(data.reason),
      deploymentId: str(data.deploymentId),
      reconnect: data.reconnect === true,
    },
  };
}
