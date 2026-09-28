export type CodeProjectStatus = "GENERATING" | "READY" | "FAILED";
export type CodeView = "code" | "preview";

export interface CodeProjectInfo {
  id: number;
  chatId: number;
  title: string;
  framework: string;
  previewable: boolean;
  currentVersion: number;
  status: CodeProjectStatus;
}

/** File metadata kept in React state. Content lives outside it (see store). */
export interface CodeFileMeta {
  path: string;
  language: string;
  status: "streaming" | "done";
  truncated?: boolean;
}

/** GET /api/code-projects/:id */
export interface CodeProjectDto extends CodeProjectInfo {
  files: { path: string; language: string; content: string; updatedAt: string }[];
}

export interface CodeVersionDto {
  version: number;
  source: "AI" | "USER" | "RESTORE";
  modelResponseId: number | null;
  createdAt: string;
  fileCount: number;
}

/** SSE events the backend emits for a code-workspace turn. */
export type CodeStreamEvent =
  | {
      type: "code_project";
      projectId: number;
      title: string;
      framework: string;
      previewable: boolean;
      version: number;
      isNew: boolean;
    }
  | { type: "code_plan"; content: string }
  | { type: "code_file_start"; path: string; language: string }
  | { type: "code_file_delta"; path: string; content: string }
  | { type: "code_file_end"; path: string; truncated?: boolean }
  | { type: "code_file_delete"; path: string }
  | {
      type: "code_done";
      projectId: number;
      version: number | null;
      fileCount: number;
      truncatedPaths: string[];
      failed: boolean;
    };

export function isCodeStreamEvent(event: { type?: unknown }): event is CodeStreamEvent {
  return typeof event.type === "string" && event.type.startsWith("code_");
}

/**
 * What a chat bubble shows for a code turn (steps + project card). Built live
 * from SSE events while streaming, and from `modelResponse.codeVersions`
 * after a reload.
 */
export interface CodeTurnInfo {
  projectId: number;
  title: string;
  framework: string;
  previewable: boolean;
  isNew: boolean;
  plan: string;
  steps: { path: string; state: "writing" | "done" | "deleted" }[];
  status: "generating" | "done" | "failed";
  version: number | null;
}

/** `modelResponse.codeVersions[0]` as returned by GET /chats/:id. */
export interface CodeVersionOnResponse {
  version: number;
  plan: string | null;
  /** Paths written this turn; "-path" marks a deletion. */
  changedPaths: string[];
  project: {
    id: number;
    title: string;
    framework: string;
    previewable: boolean;
    status: CodeProjectStatus;
  };
}
