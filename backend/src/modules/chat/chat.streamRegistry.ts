/**
 * In-flight generations, keyed by user + chat.
 *
 * A generation used to be aborted whenever the browser connection dropped,
 * which made "the user pressed Stop" indistinguishable from "the user
 * navigated away / switched tab / lost network" — so leaving the page killed
 * a half-finished image. Now a dropped connection does NOT stop the job; only
 * an explicit stop request (`POST /chats/:chatId/stop`) aborts it, through this
 * registry. The finished answer is saved to the chat either way and is there
 * when the user comes back.
 */

const active = new Map<string, Set<AbortController>>();

// A generation that never ends must not pin its controller forever.
const MAX_LIFETIME_MS = 15 * 60 * 1000;

const keyOf = (userId: number, chatId: number) => `${userId}:${chatId}`;

/** Registers a running generation; returns a function that unregisters it. */
export function registerStream(
  userId: number,
  chatId: number,
  controller: AbortController,
): () => void {
  const key = keyOf(userId, chatId);
  let set = active.get(key);
  if (!set) {
    set = new Set();
    active.set(key, set);
  }
  set.add(controller);

  let done = false;
  const unregister = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    const current = active.get(key);
    if (!current) return;
    current.delete(controller);
    if (current.size === 0) active.delete(key);
  };
  const timer = setTimeout(unregister, MAX_LIFETIME_MS);
  timer.unref?.();
  return unregister;
}

/** Aborts every running generation of this chat; returns how many were stopped. */
export function abortChatStreams(userId: number, chatId: number): number {
  const set = active.get(keyOf(userId, chatId));
  if (!set) return 0;
  let stopped = 0;
  for (const controller of set) {
    if (!controller.signal.aborted) {
      controller.abort();
      stopped += 1;
    }
  }
  return stopped;
}
