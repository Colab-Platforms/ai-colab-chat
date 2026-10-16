import prisma from "@root/prisma.js";
import { ApiError } from "@/utils/ApiError.js";
import STATUS_CODES from "@/utils/statusCodes.js";
import { reauthError } from "./vercel.app.js";
import { VERCEL_API } from "./vercel.types.js";

/**
 * Thin wrapper over api.vercel.com, shaped like github.api.ts. Every failure
 * becomes an ApiError with a message a user can act on — Vercel's raw error
 * bodies are never forwarded wholesale.
 *
 * Two things differ from GitHub:
 *  - `teamId` is appended to EVERY call here, never by callers. A team
 *    installation that forgets it gets a silent 403 on everything.
 *  - No status we return is ever 401: the frontend logs the user out of the app
 *    on any 401, and a revoked Vercel token is not a revoked app session.
 */

export interface VercelRequestOptions {
  token: string;
  /** VercelConnection.teamId — appended as ?teamId= when set. */
  teamId?: string | null;
  /** When set, a revoked/disabled token flips this connection to inactive. */
  connectionId?: number;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Statuses the caller handles itself (e.g. 404 for "project does not exist yet"). */
  allowStatuses?: number[];
}

export class VercelHttpError extends ApiError {
  constructor(
    message: string,
    statusCode: number,
    readonly vercelStatus: number,
    readonly vercelCode: string | null,
    readonly vercelMessage: string,
  ) {
    super(message, statusCode);
    Object.setPrototypeOf(this, VercelHttpError.prototype);
  }
}

/** Appends teamId. The only place a Vercel API URL is built. */
export function vercelPath(path: string, teamId?: string | null): string {
  const url = new URL(path.startsWith("http") ? path : `${VERCEL_API}${path}`);
  if (teamId) url.searchParams.set("teamId", teamId);
  return url.toString();
}

/** Vercel's error envelope is `{ error: { code, message } }`. */
export function parseVercelError(errorText: string): { code: string | null; message: string } {
  try {
    const parsed = JSON.parse(errorText) as { error?: { code?: string; message?: string } };
    return { code: parsed.error?.code ?? null, message: parsed.error?.message ?? "" };
  } catch {
    return { code: null, message: errorText.slice(0, 300) };
  }
}

/**
 * Whether Vercel refused a GitHub link because the user's Vercel account has no
 * GitHub connection (or Vercel's GitHub App can't see the repo's owner).
 *
 * Vercel's error code for this is not stable, so match a code allowlist AND the
 * message. Keep this the only place that knows the wording — it is the one
 * piece guaranteed to need maintenance.
 */
export function isGitIntegrationMissing(status: number, errorText: string): boolean {
  if (status !== 400 && status !== 403 && status !== 404) return false;
  const { code, message } = parseVercelError(errorText);
  if (
    code &&
    ["missing_github_integration", "github_integration_not_installed", "not_linked_to_github", "missing_git_integration"].includes(code)
  ) {
    return true;
  }
  // "repository ... couldn't be found" is Vercel's answer when its GitHub App can't see the repo —
  // the same fix (give Vercel access to it), so it takes the same guided path.
  return /install the github integration|github integration first|not connected to github|link a github repository|connect your github account|login connection|repository .*couldn.?t be found|make sure there aren.?t any typos/i.test(
    message || errorText,
  );
}

async function markInactive(connectionId: number | undefined) {
  if (!connectionId) return;
  await prisma.vercelConnection.update({ where: { id: connectionId }, data: { isActive: false } }).catch(() => undefined);
}

function friendlyMessage(status: number, path: string, errorText: string, headers: Headers): { message: string; code: number } {
  const { code, message } = parseVercelError(errorText);

  if (status === 402) {
    // Plan or usage limits on the user's own account — surfaced, never gated by us.
    return { message: message || "Your Vercel plan does not allow this — check your Vercel account", code: STATUS_CODES.BAD_REQUEST };
  }
  if (status === 403) {
    return {
      message: "Vercel denied this request — check the integration's permissions in your Vercel account",
      code: STATUS_CODES.FORBIDDEN,
    };
  }
  if (status === 404) {
    return { message: "Not found on Vercel — it may have been deleted", code: STATUS_CODES.NOT_FOUND };
  }
  if (status === 409) {
    return { message: message || "That already exists on Vercel", code: STATUS_CODES.CONFLICT };
  }
  if (status === 429) {
    const retryAfter = headers.get("retry-after");
    return {
      message: `Vercel rate limit reached — try again ${retryAfter ? `in ${retryAfter}s` : "in a few minutes"}`,
      code: STATUS_CODES.CONFLICT,
    };
  }
  if (status === 400 || status === 422) {
    return { message: `Vercel rejected the request${message ? `: ${message}` : ""}`, code: STATUS_CODES.BAD_REQUEST };
  }
  console.error(`[vercel] unexpected ${status} for ${path}: ${code ?? ""} ${errorText.slice(0, 300)}`);
  return { message: `Vercel returned an unexpected error (${status})`, code: STATUS_CODES.BAD_REQUEST };
}

export interface VercelRawResponse<T> {
  status: number;
  ok: boolean;
  data: T | null;
  headers: Headers;
  /** Raw body text when the response was not ok (for callers that must inspect it). */
  errorText: string;
}

/**
 * Never throws for HTTP errors — returns the status so callers can branch on it.
 * Still throws for network failures, timeouts, and a revoked token (which no
 * caller can recover from).
 */
export async function vercelRaw<T = unknown>(
  path: string,
  options: Omit<VercelRequestOptions, "allowStatuses">,
): Promise<VercelRawResponse<T>> {
  const { token, teamId, method = "GET", body, connectionId } = options;

  let response: Response;
  try {
    response = await fetch(vercelPath(path, teamId), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error: any) {
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    throw new ApiError(
      timedOut ? "Vercel took too long to respond — try again" : "Could not reach Vercel — check your connection",
      STATUS_CODES.BAD_REQUEST,
    );
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    await throwIfAuthLost(response.status, errorText, connectionId);
    return { status: response.status, ok: false, data: null, headers: response.headers, errorText };
  }
  const data = response.status === 204 ? null : ((await response.json().catch(() => null)) as T | null);
  return { status: response.status, ok: true, data, headers: response.headers, errorText: "" };
}

/** A token Vercel no longer accepts: deactivate the connection and ask for a reconnect. */
async function throwIfAuthLost(status: number, errorText: string, connectionId?: number) {
  if (status === 401) {
    await markInactive(connectionId);
    throw reauthError();
  }
  if (status === 403 && parseVercelError(errorText).code === "integration_configuration_disabled") {
    await markInactive(connectionId);
    throw Object.assign(
      new ApiError("This app's access to your Vercel account was removed — reconnect Vercel", STATUS_CODES.CONFLICT),
      { code: "VERCEL_INTEGRATION_DISABLED", details: { reconnect: true } },
    );
  }
}

/** The user-facing error for a failed raw response — for callers that inspected it first. */
export function vercelError(res: VercelRawResponse<unknown>, path: string): VercelHttpError {
  const { message, code } = friendlyMessage(res.status, path, res.errorText, res.headers);
  const parsed = parseVercelError(res.errorText);
  return new VercelHttpError(message, code, res.status, parsed.code, parsed.message);
}

export async function vercelRequest<T = unknown>(path: string, options: VercelRequestOptions): Promise<T | null> {
  const { allowStatuses = [], ...rest } = options;
  const res = await vercelRaw<T>(path, rest);
  if (allowStatuses.includes(res.status)) return null;
  if (!res.ok) throw vercelError(res, path);
  return res.data;
}

/** Like vercelRequest but the response is required (no allowed-status escape hatch). */
export async function vercelJson<T>(path: string, options: Omit<VercelRequestOptions, "allowStatuses">): Promise<T> {
  return (await vercelRequest<T>(path, options)) as T;
}

/**
 * For the build-log follow stream only. Separate from vercelRaw on purpose: the
 * 30 s request timeout there would kill a follow stream mid-build. The caller
 * owns the AbortSignal (client disconnect + its own hard timeout).
 */
export async function vercelStream(
  path: string,
  options: { token: string; teamId?: string | null; signal: AbortSignal },
): Promise<Response> {
  const response = await fetch(vercelPath(path, options.teamId), {
    headers: { Authorization: `Bearer ${options.token}`, Accept: "application/x-ndjson, application/json" },
    signal: options.signal,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    await throwIfAuthLost(response.status, errorText);
    throw vercelError({ status: response.status, ok: false, data: null, headers: response.headers, errorText }, path);
  }
  return response;
}
