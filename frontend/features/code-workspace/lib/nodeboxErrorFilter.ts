// No "use client": app/layout.tsx (a server component) imports the string
// below directly — importing it through the feature's index.ts would turn it
// into a client reference instead of plain text.

/**
 * Inline script for app/layout.tsx (`<Script strategy="beforeInteractive">`).
 *
 * Why it exists: when the Sandpack preview's Vite server starts, Vite writes
 * `vite.config.js.timestamp-<n>.mjs`, loads it and deletes it straight away
 * (normal Vite behaviour). Nodebox — Sandpack's in-browser Node runtime, which
 * runs in *this* page's JS context — stats that path a moment later, the stat
 * rejects, and `@codesandbox/nodebox` never catches it. The result is a global
 * unhandled rejection: harmless (the preview keeps working), but Next.js's dev
 * overlay shows every such rejection as a full-screen "Runtime Error".
 *
 * React error boundaries can't catch it (it's async, outside render), and the
 * listener has to run before Next's own overlay listener — hence an inline
 * script in <head> that runs before hydration, on the capture phase.
 *
 * Deliberately narrow: only this exact stat-a-Vite-temp-file failure is
 * silenced (and still logged as a warning); every other error reaches the
 * overlay and the console exactly as before.
 */
export const NODEBOX_ERROR_FILTER_SCRIPT = `(function () {
  var benign = /failed to stat file at path[^\\n]*\\.timestamp-\\d+\\.m?[jt]s/i;
  function text(reason) {
    try { return reason && reason.message ? String(reason.message) : String(reason || ""); }
    catch (e) { return ""; }
  }
  function filter(event, reason) {
    var message = text(reason);
    if (!benign.test(message)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    console.warn("[code-workspace] ignored a known, harmless Sandpack/Nodebox race:", message);
  }
  window.addEventListener("unhandledrejection", function (e) { filter(e, e.reason); }, true);
  window.addEventListener("error", function (e) { filter(e, e.error || e.message); }, true);
})();`;
