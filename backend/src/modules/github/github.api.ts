import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { GITHUB_API, GITHUB_API_VERSION } from "./github.types.js";

/**
 * Thin wrapper over api.github.com. Callers pass whichever token fits the
 * call (installation token for git data, user token for repo listing/creation).
 * Every failure becomes an ApiError with a message a user can act on — GitHub's
 * raw error bodies are never forwarded.
 */

export interface GithubRequestOptions {
  token: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Statuses the caller handles itself (e.g. 404 for "branch does not exist yet"). */
  allowStatuses?: number[];
}

export class GithubHttpError extends ApiError {
  constructor(
    message: string,
    statusCode: number,
    readonly githubStatus: number,
  ) {
    super(message, statusCode);
    Object.setPrototypeOf(this, GithubHttpError.prototype);
  }
}

function friendlyMessage(status: number, path: string, detail: string, headers: Headers): { message: string; code: number } {
  if (status === 401) {
    return { message: "GitHub rejected the credentials — reconnect your GitHub account", code: STATUS_CODES.UNAUTHORIZED };
  }
  if (status === 403 || status === 429) {
    const remaining = headers.get("x-ratelimit-remaining");
    const retryAfter = headers.get("retry-after");
    if (remaining === "0" || status === 429 || retryAfter) {
      return { message: "GitHub rate limit reached — try again in a few minutes", code: STATUS_CODES.CONFLICT };
    }
    return {
      message: "GitHub denied access to this repository — check the app's repository access on GitHub",
      code: STATUS_CODES.FORBIDDEN,
    };
  }
  if (status === 404) {
    return {
      message: "Repository not found, or the GitHub app no longer has access to it",
      code: STATUS_CODES.NOT_FOUND,
    };
  }
  if (status === 409) {
    return { message: "The repository changed while syncing — try again", code: STATUS_CODES.CONFLICT };
  }
  if (status === 422) {
    let reason = "";
    try {
      const parsed = JSON.parse(detail) as { message?: string; errors?: { message?: string; field?: string }[] };
      reason = parsed.errors?.[0]?.message || parsed.message || "";
    } catch {
      /* not JSON */
    }
    return { message: `GitHub rejected the request${reason ? `: ${reason}` : ""}`, code: STATUS_CODES.BAD_REQUEST };
  }
  console.error(`[github] unexpected ${status} for ${path}: ${detail.slice(0, 300)}`);
  return { message: `GitHub returned an unexpected error (${status})`, code: STATUS_CODES.BAD_REQUEST };
}

export interface GithubRawResponse<T> {
  status: number;
  ok: boolean;
  data: T | null;
  headers: Headers;
  /** Raw body text when the response was not ok (for callers that must inspect it). */
  errorText: string;
}

/**
 * Never throws for HTTP errors — returns the status so callers can branch on
 * it (an empty repository answers 409 on every git-data call, and a missing
 * branch answers 404; both are normal states, not failures).
 * Still throws ApiError for network failures and timeouts.
 */
export async function githubRaw<T = unknown>(
  path: string,
  options: Omit<GithubRequestOptions, "allowStatuses">,
): Promise<GithubRawResponse<T>> {
  const { token, method = "GET", body } = options;

  let response: Response;
  try {
    response = await fetch(path.startsWith("http") ? path : `${GITHUB_API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error: any) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw new ApiError(
      timedOut ? "GitHub took too long to respond — try again" : "Could not reach GitHub — check your connection",
      STATUS_CODES.BAD_REQUEST,
    );
  }

  if (!response.ok) {
    return { status: response.status, ok: false, data: null, headers: response.headers, errorText: await response.text().catch(() => "") };
  }
  const data = response.status === 204 ? null : ((await response.json().catch(() => null)) as T | null);
  return { status: response.status, ok: true, data, headers: response.headers, errorText: "" };
}

export async function githubRequest<T = unknown>(path: string, options: GithubRequestOptions): Promise<T | null> {
  const { allowStatuses = [], ...rest } = options;
  const res = await githubRaw<T>(path, rest);
  if (allowStatuses.includes(res.status)) return null;
  if (!res.ok) {
    const { message, code } = friendlyMessage(res.status, path, res.errorText, res.headers);
    throw new GithubHttpError(message, code, res.status);
  }
  return res.data;
}

/** Like githubRequest but the response is required (no allowed-status escape hatch). */
export async function githubJson<T>(path: string, options: Omit<GithubRequestOptions, "allowStatuses">): Promise<T> {
  return (await githubRequest<T>(path, options)) as T;
}
