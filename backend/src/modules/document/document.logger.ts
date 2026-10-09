/**
 * Verbose tracing for the document pipeline.
 *
 * On by default so local debugging needs no setup; set DOCUMENT_DEBUG=false to
 * silence it in production, where full LLM payloads per request would be both
 * noisy and expensive to store.
 *
 * Long values are truncated at DOCUMENT_DEBUG_MAX_CHARS rather than dropped,
 * so a raw model response is still readable without flooding the terminal.
 * Set it to 0 for untruncated output.
 */

const isEnabled = () => process.env.DOCUMENT_DEBUG !== "false";
const maxChars = () => Number(process.env.DOCUMENT_DEBUG_MAX_CHARS ?? 4000);

const clip = (value: string): string => {
  const limit = maxChars();
  if (limit === 0 || value.length <= limit) return value;
  return `${value.slice(0, limit)}\n  …[truncated ${value.length - limit} more chars — raise DOCUMENT_DEBUG_MAX_CHARS or set it to 0]`;
};

const render = (value: unknown): string => {
  if (typeof value === "string") return clip(value);
  try {
    return clip(JSON.stringify(value, null, 2));
  } catch {
    return String(value);
  }
};

const stamp = () => new Date().toISOString().slice(11, 23);

/** One-line event. */
export const dlog = (stage: string, message: string): void => {
  if (!isEnabled()) return;
  console.log(`[doc:${stage}] ${stamp()} ${message}`);
};

/** Event plus a labelled payload block. */
export const dlogBlock = (
  stage: string,
  message: string,
  payload: unknown,
): void => {
  if (!isEnabled()) return;
  console.log(
    `[doc:${stage}] ${stamp()} ${message}\n${render(payload)
      .split("\n")
      .map((line) => `  │ ${line}`)
      .join("\n")}`,
  );
};

export const dlogError = (stage: string, message: string, error: unknown): void => {
  console.error(
    `[doc:${stage}] ${stamp()} ${message}: ${(error as any)?.message ?? error}`,
  );
};

/** Wraps an async step and logs how long it took. */
export const dtime = async <T,>(
  stage: string,
  label: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const started = Date.now();
  try {
    const result = await fn();
    dlog(stage, `${label} OK in ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    dlogError(stage, `${label} FAILED after ${Date.now() - started}ms`, error);
    throw error;
  }
};
