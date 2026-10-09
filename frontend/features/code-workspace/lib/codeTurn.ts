import type { CodeStreamEvent, CodeTurnInfo, CodeVersionOnResponse } from "../types";

/**
 * Folds one SSE event into the bubble's turn info (pure — the chat page keeps
 * the result on the model response as `codeTurn`). Deltas are ignored here:
 * the bubble only shows which files were written, not their contents.
 */
export function reduceCodeTurn(turn: CodeTurnInfo | undefined, event: CodeStreamEvent): CodeTurnInfo | undefined {
  if (event.type === "code_project") {
    return {
      projectId: event.projectId,
      title: event.title,
      framework: event.framework,
      previewable: event.previewable,
      isNew: event.isNew,
      plan: "",
      steps: [],
      status: "generating",
      version: null,
    };
  }
  if (!turn) return turn;
  switch (event.type) {
    case "code_plan":
      return { ...turn, plan: turn.plan + event.content };
    case "code_file_start":
      return {
        ...turn,
        steps: [...turn.steps.filter((s) => s.path !== event.path), { path: event.path, state: "writing" }],
      };
    case "code_file_end":
      return {
        ...turn,
        steps: turn.steps.map((s) => (s.path === event.path ? { ...s, state: "done" } : s)),
      };
    case "code_file_delete":
      return {
        ...turn,
        steps: [...turn.steps.filter((s) => s.path !== event.path), { path: event.path, state: "deleted" }],
      };
    case "code_done":
      return {
        ...turn,
        status: event.failed ? "failed" : "done",
        version: event.version,
        steps: turn.steps.map((s) => (s.state === "writing" ? { ...s, state: "done" } : s)),
      };
    default:
      return turn;
  }
}

/** Only events that change what the bubble shows (skips the per-token deltas). */
export function affectsCodeTurn(event: CodeStreamEvent): boolean {
  return event.type !== "code_file_delta";
}

/** Rebuilds the bubble's turn info from a model response fetched from the API. */
export function codeTurnFromResponse(response: {
  codeTurn?: CodeTurnInfo;
  codeVersions?: CodeVersionOnResponse[];
}): CodeTurnInfo | null {
  if (response.codeTurn) return response.codeTurn;
  const v = response.codeVersions?.[0];
  if (!v) return null;
  return {
    projectId: v.project.id,
    title: v.project.title,
    framework: v.project.framework,
    previewable: v.project.previewable,
    isNew: v.version === 1,
    plan: v.plan ?? "",
    steps: v.changedPaths.map((p) =>
      p.startsWith("-") ? { path: p.slice(1), state: "deleted" as const } : { path: p, state: "done" as const },
    ),
    status: v.project.status === "FAILED" ? "failed" : "done",
    version: v.version,
  };
}
