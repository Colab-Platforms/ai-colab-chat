/**
 * Shared types for the code workspace (AI coding assistant) feature.
 * See README.md in this folder for the end-to-end flow.
 */

/** Only chats with this assistant can enter code mode. */
export const CODE_ASSISTANT_SLUG = "software-engineer";

/** `chatType` the frontend's "Code" pill sends to force code mode. */
export const CODE_CHAT_TYPE = "CODE";

export const CODE_FRAMEWORKS = [
  "react",
  "vue",
  "vanilla",
  "static",
  "node",
  "python",
  "other",
] as const;
export type CodeFramework = (typeof CODE_FRAMEWORKS)[number];

/** Frameworks the Sandpack preview can run in the browser. */
export const PREVIEWABLE_FRAMEWORKS: ReadonlySet<CodeFramework> = new Set([
  "react",
  "vue",
  "vanilla",
  "static",
]);

/**
 * NEW  — scaffold a fresh project.
 * EDIT — change the chat's current project.
 * ASK  — a question about the current project; answered in chat with the
 *        files attached as read-only context, no files are written.
 * NONE — an ordinary chat turn.
 */
export type CodeIntentKind = "NEW" | "EDIT" | "ASK" | "NONE";

export interface CodeIntent {
  intent: CodeIntentKind;
  title: string;
  framework: CodeFramework;
}

export interface CodeFileSnapshot {
  path: string;
  language: string;
  content: string;
}

/** Hard limits — a runaway model must not be able to fill the database. */
export const MAX_FILES_PER_PROJECT = 80;
export const MAX_FILE_CHARS = 200_000;
export const MAX_PATH_CHARS = 200;
export const MAX_TITLE_CHARS = 80;

/**
 * Events the stream parser produces. `code_file_end` carries the full file
 * content for the server-side upsert; it is stripped before going over SSE
 * because the client already has every delta.
 */
export type CodeParserEvent =
  | { type: "text"; content: string }
  | { type: "code_plan"; content: string }
  | { type: "code_file_start"; path: string; language: string }
  | { type: "code_file_delta"; path: string; content: string }
  | { type: "code_file_end"; path: string; content: string; truncated?: boolean }
  | { type: "code_file_delete"; path: string };
