"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  onReload: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a render-time crash inside Sandpack from taking down the whole page:
 * the preview shows "Reload preview" instead, and chat/editor keep working.
 *
 * Only catches errors thrown while rendering. Sandpack's *async* failures
 * (e.g. Nodebox's unhandled stat rejection on Vite's temp config file) never
 * pass through React — those are handled by lib/nodeboxErrorFilter.ts.
 *
 * Must be a class component — React has no hook equivalent for
 * `getDerivedStateFromError` / `componentDidCatch`.
 */
export class PreviewErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[code-workspace] preview crashed:", error);
  }

  private reload = () => {
    this.setState({ error: null });
    this.props.onReload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm">
          <AlertTriangle className="h-6 w-6 text-amber-500" />
          <p className="font-medium">The preview crashed.</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            This is a known instability in the in-browser bundler, not your project — your files are unaffected.
          </p>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={this.reload}>
            <RotateCw className="h-3.5 w-3.5" /> Reload preview
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
