/**
 * How the GitHub popup tells the editor window it is done.
 *
 * `window.opener.postMessage` alone is not reliable: once the popup has been to
 * github.com, browsers may sever the opener link (cross-origin-opener-policy,
 * site isolation, privacy settings), leaving `window.opener === null` on the way
 * back. A BroadcastChannel needs no opener — any same-origin window can receive
 * it — so it is the primary path, with `postMessage` kept as a fallback.
 * Messages carry an id so a result delivered on both paths is handled once.
 */

const CHANNEL = "github-connect";

export type GithubPopupResult =
  | { type: "github:connected"; login?: string | null }
  | { type: "github:error"; message: string };

type Envelope = GithubPopupResult & { id: string };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Called from the popup's landing page. */
export function postPopupResult(result: GithubPopupResult): void {
  const message: Envelope = { ...result, id: newId() };

  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel unavailable — the opener path below may still work.
  }

  try {
    const opener = window.opener as Window | null;
    if (opener && !opener.closed) opener.postMessage(message, window.location.origin);
  } catch {
    // Opener was severed or is cross-origin — nothing more to try.
  }
}

/** Called from the editor window. Returns an unsubscribe function. */
export function subscribePopupResult(onResult: (result: GithubPopupResult) => void): () => void {
  const seen = new Set<string>();

  function deliver(raw: unknown) {
    const data = raw as Partial<Envelope> | null;
    if (!data || typeof data.id !== "string" || seen.has(data.id)) return;
    if (data.type !== "github:connected" && data.type !== "github:error") return;
    seen.add(data.id);
    onResult(
      data.type === "github:connected"
        ? { type: "github:connected", login: (data as { login?: string | null }).login ?? null }
        : { type: "github:error", message: (data as { message?: string }).message || "GitHub could not be connected" },
    );
  }

  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => deliver(event.data);
  } catch {
    channel = null;
  }

  function onWindowMessage(event: MessageEvent) {
    if (event.origin !== window.location.origin) return; // only our own landing page
    deliver(event.data);
  }
  window.addEventListener("message", onWindowMessage);

  return () => {
    channel?.close();
    window.removeEventListener("message", onWindowMessage);
  };
}
