"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { postPopupResult } from "@/features/code-workspace/vercel/popupChannel";

/**
 * Landing page of the Vercel connect popup. The backend has already stored the
 * connection by the time Vercel redirects here, so this only reports the result
 * to the editor window and closes itself.
 *
 * It must not depend on `window.opener`: after the popup has visited
 * vercel.com the browser may have severed that link. The result goes out over a
 * BroadcastChannel (see vercel/popupChannel.ts), and if the browser still refuses
 * to let the page close itself, it says so plainly instead of pretending to work.
 */
function VercelCallback() {
  const params = useSearchParams();
  const ok = params.get("status") === "success";
  const message = params.get("message") || "Vercel could not be connected.";
  const account = params.get("account");
  const [couldNotClose, setCouldNotClose] = useState(false);

  useEffect(() => {
    postPopupResult(ok ? { type: "vercel:connected", account } : { type: "vercel:error", message });

    // Brief pause so the user sees the result, then try to close. window.close()
    // only works for windows a script opened — if it is ignored the page is still
    // here a moment later, and we tell the user to close it themselves.
    const closeTimer = setTimeout(() => window.close(), ok ? 700 : 2500);
    const fallbackTimer = setTimeout(() => setCouldNotClose(true), ok ? 1600 : 3400);
    return () => {
      clearTimeout(closeTimer);
      clearTimeout(fallbackTimer);
    };
  }, [ok, account, message]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-sm space-y-3 text-center">
        {ok ? (
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
        ) : (
          <XCircle className="mx-auto h-10 w-10 text-red-500" />
        )}
        <h1 className="text-lg font-semibold">{ok ? "Vercel connected" : "Could not connect Vercel"}</h1>
        <p className="text-sm text-muted-foreground">
          {ok ? (account ? `Connected to ${account}.` : "You're all set.") : message}
        </p>
        {couldNotClose ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {ok ? "All done — you can close this window and go back to the editor." : "You can close this window and try again."}
            </p>
            <button
              type="button"
              onClick={() => window.close()}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Close window
            </button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Returning to the editor…</p>
        )}
      </div>
    </main>
  );
}

export default function VercelCallbackPage() {
  return (
    <Suspense fallback={null}>
      <VercelCallback />
    </Suspense>
  );
}
