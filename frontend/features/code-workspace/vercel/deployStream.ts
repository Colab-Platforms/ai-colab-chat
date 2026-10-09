import type { DeployBody, DeployStreamEvent, EnvVarInput } from "./types";

/**
 * The deploy and log endpoints stream Server-Sent Events from a POST, the same
 * way /chats/:id/send does — read with fetch() + getReader(), because
 * EventSource can't send the Authorization header (and axios can't stream).
 *
 * A failure *before* the stream starts (VERCEL_GIT_NOT_CONNECTED,
 * PROJECT_NAME_TAKEN, DEPLOY_IN_PROGRESS, ...) comes back as the normal JSON
 * envelope. It is rethrown shaped like an axios error, so readVercelError()
 * handles both kinds of failure the same way.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export class StreamHttpError extends Error {
  readonly response: { status: number; data: unknown };
  constructor(status: number, data: unknown) {
    const message = (data as { message?: unknown } | null)?.message;
    super(typeof message === "string" && message ? message : `Request failed (${status})`);
    this.response = { status, data };
  }
}

async function stream(path: string, body: unknown, onEvent: (event: DeployStreamEvent) => void, signal: AbortSignal) {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Required: the server's compression() skips only requests that ask for
      // an event stream. Without it the build log arrives in buffered chunks.
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
    signal,
  });

  const isStream = response.headers.get("content-type")?.includes("text/event-stream");
  if (!response.ok || !isStream) {
    throw new StreamHttpError(response.status, await response.json().catch(() => null));
  }

  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const line = chunk.trim();
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        onEvent(JSON.parse(data) as DeployStreamEvent);
      } catch {
        // A malformed event must not end the stream.
      }
    }
  }
}

/** Creates a deployment and streams its build until it settles. */
export function streamDeploy(
  projectId: number,
  body: DeployBody,
  onEvent: (event: DeployStreamEvent) => void,
  signal: AbortSignal,
) {
  return stream(`/vercel/projects/${projectId}/deploy`, body, onEvent, signal);
}

/** Deploys again with the stored settings. */
export function streamRedeploy(
  projectId: number,
  envVars: EnvVarInput[],
  onEvent: (event: DeployStreamEvent) => void,
  signal: AbortSignal,
) {
  return stream(`/vercel/projects/${projectId}/redeploy`, { envVars }, onEvent, signal);
}

/** Re-attaches to a deployment — live if it is still building, a replay if it finished. */
export function attachLogs(
  projectId: number,
  deploymentId: string,
  onEvent: (event: DeployStreamEvent) => void,
  signal: AbortSignal,
) {
  return stream(`/vercel/projects/${projectId}/deploy/${encodeURIComponent(deploymentId)}/logs`, {}, onEvent, signal);
}
