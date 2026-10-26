/**
 * Lets code outside the mind-map panel (the chat composer) wait for pending
 * edits to be saved.
 *
 * Edits autosave on a 5 s debounce, so at any moment there can be changes that
 * exist only in the browser. An AI follow-up ("add more use cases") revises the
 * STORED map on the server, so sending one without flushing first would revise
 * the version from before the user's edits and silently discard them.
 */
type Flush = () => Promise<void>;

const flushers = new Set<Flush>();

export const registerMindmapFlush = (flush: Flush): (() => void) => {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
};

/** Resolves once every open mind map has saved (or failed trying). Never rejects. */
export const flushMindmapEdits = async (): Promise<void> => {
  await Promise.all([...flushers].map((flush) => flush().catch(() => undefined)));
};
