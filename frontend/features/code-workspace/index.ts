// Public API of the code workspace feature. Code outside this folder should
// import only from "@/features/code-workspace". See README.md.

export { CodePanel } from "./components/CodePanel";
export { GenerationSteps } from "./components/GenerationSteps";
export { CodeProjectCard } from "./components/CodeProjectCard";
// StandalonePreview is deliberately NOT exported here: it imports Sandpack
// statically, and every chat page imports this index — app/code-preview
// imports it by path instead. (CodePanel lazy-loads Sandpack/Monaco.)
export { codeWorkspace, useCodeWorkspace } from "./store/codeWorkspaceStore";
export { reduceCodeTurn, affectsCodeTurn, codeTurnFromResponse } from "./lib/codeTurn";
export { isCodeStreamEvent } from "./types";
export type { CodeStreamEvent, CodeTurnInfo, CodeVersionOnResponse } from "./types";
