/**
 * Verbose tracing for the video generation pipeline — mirrors
 * document.logger.ts so both async job pipelines are debuggable the same
 * way.
 *
 * On by default so local debugging needs no setup; set VIDEO_DEBUG=false to
 * silence it in production.
 */

const isEnabled = () => process.env.VIDEO_DEBUG !== "false";
const maxChars = () => Number(process.env.VIDEO_DEBUG_MAX_CHARS ?? 4000);

const clip = (value: string): string => {
  const limit = maxChars();
  if (limit === 0 || value.length <= limit) return value;
  return `${value.slice(0, limit)}\n  …[truncated ${value.length - limit} more chars — raise VIDEO_DEBUG_MAX_CHARS or set it to 0]`;
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
export const vlog = (stage: string, message: string): void => {
  if (!isEnabled()) return;
  console.log(`[vid:${stage}] ${stamp()} ${message}`);
};

/** Event plus a labelled payload block. */
export const vlogBlock = (stage: string, message: string, payload: unknown): void => {
  if (!isEnabled()) return;
  console.log(
    `[vid:${stage}] ${stamp()} ${message}\n${render(payload)
      .split("\n")
      .map((line) => `  │ ${line}`)
      .join("\n")}`,
  );
};

export const vlogError = (stage: string, message: string, error: unknown): void => {
  console.error(`[vid:${stage}] ${stamp()} ${message}: ${(error as any)?.message ?? error}`);
};

/** Wraps an async step and logs how long it took. */
export const vtime = async <T,>(
  stage: string,
  label: string,
  fn: () => Promise<T>,
): Promise<T> => {
  const started = Date.now();
  try {
    const result = await fn();
    vlog(stage, `${label} OK in ${Date.now() - started}ms`);
    return result;
  } catch (error) {
    vlogError(stage, `${label} FAILED after ${Date.now() - started}ms`, error);
    throw error;
  }
};
