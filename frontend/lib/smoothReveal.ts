/**
 * Decouples how fast text is *displayed* from how fast it *arrives* over SSE.
 * Tokens from the backend can arrive in uneven bursts (a few chars, then a
 * multi-word chunk); revealing them the instant they land looks jerky. This
 * ticks the visible text toward the latest known full string at a steady
 * cadence, catching up faster when the backlog grows so a long burst doesn't
 * cause a multi-second lag behind the real stream.
 */

interface SmoothRevealOptions {
  onUpdate: (text: string) => void;
  /** Text already considered "shown" up front — e.g. a Continue action's
   *  existing content, which shouldn't be re-typed, only appended to. */
  initialShown?: string;
  tickMs?: number;
  minCharsPerTick?: number;
  maxCharsPerTick?: number;
  catchUpFraction?: number;
  disabled?: boolean;
}

export interface SmoothRevealer {
  /** Update the target text; reveal starts/continues automatically. */
  push: (fullText: string) => void;
  /** Resolves once the visible text has caught up to the latest push. */
  finish: () => Promise<void>;
  /** Stop ticking and release any pending finish() waiters immediately. */
  stop: () => void;
}

export function createSmoothRevealer(
  options: SmoothRevealOptions,
): SmoothRevealer {
  const {
    onUpdate,
    initialShown = "",
    tickMs = 24,
    minCharsPerTick = 1,
    maxCharsPerTick = 32,
    catchUpFraction = 0.25,
    disabled = false,
  } = options;

  let target = initialShown;
  let shown = initialShown;
  let timer: ReturnType<typeof setInterval> | null = null;
  let waiters: Array<() => void> = [];

  const settleWaiters = () => {
    const toResolve = waiters;
    waiters = [];
    toResolve.forEach((resolve) => resolve());
  };

  const stopTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  const tick = () => {
    const backlog = target.length - shown.length;
    if (backlog <= 0) {
      stopTimer();
      settleWaiters();
      return;
    }
    const chars = Math.min(
      backlog,
      Math.max(
        minCharsPerTick,
        Math.min(maxCharsPerTick, Math.ceil(backlog * catchUpFraction)),
      ),
    );
    shown = target.slice(0, shown.length + chars);
    onUpdate(shown);
    if (shown.length >= target.length) {
      stopTimer();
      settleWaiters();
    }
  };

  return {
    push(fullText: string) {
      target = fullText;
      const shouldBypass = disabled || fullText.includes("data:image/");
      if (shouldBypass) {
        stopTimer();
        shown = fullText;
        onUpdate(shown);
        settleWaiters();
        return;
      }
      if (!timer && target.length > shown.length) {
        timer = setInterval(tick, tickMs);
      }
    },
    finish() {
      return new Promise<void>((resolve) => {
        const shouldBypass = disabled || target.includes("data:image/");
        if (shouldBypass || shown.length >= target.length) {
          resolve();
          return;
        }
        waiters.push(resolve);
      });
    },
    stop() {
      stopTimer();
      settleWaiters();
    },
  };
}
