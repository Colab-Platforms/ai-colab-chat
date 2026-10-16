/**
 * How the Vercel connect popup tells the editor window it is done.
 *
 * A copy of ../github/popupChannel.ts with its own channel name — sharing
 * "github-connect" would let each integration's popup result reach the other's
 * dialog. Same reasoning applies: once the popup has been to vercel.com, the
 * browser may sever `window.opener`, so a BroadcastChannel (any same-origin
 * window can receive it) is the primary path and `postMessage` the fallback.
 * Messages carry an id so a result delivered on both paths is handled once.
 */

const CHANNEL = "vercel-connect";

export type VercelPopupResult =
  | { type: "vercel:connected"; account?: string | null }
  | { type: "vercel:error"; message: string };

type Envelope = VercelPopupResult & { id: string };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Called from the popup's landing page. */
export function postPopupResult(result: VercelPopupResult): void {
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
export function subscribePopupResult(onResult: (result: VercelPopupResult) => void): () => void {
  const seen = new Set<string>();

  function deliver(raw: unknown) {
    const data = raw as Partial<Envelope> | null;
    if (!data || typeof data.id !== "string" || seen.has(data.id)) return;
    if (data.type !== "vercel:connected" && data.type !== "vercel:error") return;
    seen.add(data.id);
    onResult(
      data.type === "vercel:connected"
        ? { type: "vercel:connected", account: (data as { account?: string | null }).account ?? null }
        : { type: "vercel:error", message: (data as { message?: string }).message || "Vercel could not be connected" },
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
