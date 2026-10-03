import type { Response } from "express";
import { buildSystemMessage } from "@/utils/systemPrompt.js";
import { detectCodeIntent } from "./code-workspace.intent.js";
import { pushAfterAiTurn } from "@/modules/github/github.sync.js";
import { CodeStreamParser } from "./code-workspace.parser.js";
import { buildCodeTurnNote, CODE_SYSTEM_PROMPT } from "./code-workspace.protocol.js";
import {
  createProject,
  findActiveProject,
  findActiveProjectSummary,
  readFiles,
  removeFile,
  setProjectStatus,
  snapshotUserEditsIfDirty,
  snapshotVersion,
  writeFile,
} from "./code-workspace.service.js";
import {
  CODE_ASSISTANT_SLUG,
  CODE_CHAT_TYPE,
  type CodeIntent,
  type CodeParserEvent,
} from "./code-workspace.types.js";

/**
 * Bridge between the chat stream (chat.stream.ts) and the code workspace.
 * The chat stream calls, in order:
 *
 *   1. resolveCodeChatType()  — turn the "CODE" pill into a flag
 *   2. prepareCodeTurn()      — before the token budget: intent + prompt blocks
 *   3. injectCodeTurnMessages()
 *   4. CodeSession.start()    — after SSE headers are sent: project row + code_project event
 *   5. session.push(delta)    — for every model delta (instead of a `token` event)
 *   6. session.closeStream()  — stream over; visible text for the chat bubble
 *   7. session.complete()     — after the ModelResponse row exists: version snapshot + code_done
 *
 * Billing, wallet checks and message rows stay entirely in chat.stream.ts.
 */

/** Raw completion cap for code turns (the chat default is 10k). */
export const CODE_MAX_COMPLETION = 32_000;

/**
 * The "CODE" pill is not a real ModelCapability (UsageLog.capability is an
 * enum without it), so it becomes a flag here and the rest of the pipeline
 * sees a STANDARD turn.
 */
export function resolveCodeChatType(chatType: string | undefined): { chatType: string | undefined; forceCode: boolean } {
  if (chatType === CODE_CHAT_TYPE) return { chatType: "STANDARD", forceCode: true };
  return { chatType, forceCode: false };
}

export interface CodeTurn {
  intent: CodeIntent;
  /** Existing project for EDIT/ASK; null for NEW. */
  projectId: number | null;
  /** The stable protocol prompt — null for ASK turns, which answer in plain chat. */
  protocolPrompt: string | null;
  /** Per-turn note: turn kind + current project files. */
  note: string;
}

/**
 * Never throws — any failure leaves the turn as a normal chat turn.
 * Returns null for non-code turns (and always for non Software Engineer chats).
 */
export async function prepareCodeTurn(params: {
  userId: number;
  chatId: number;
  userPrompt: string;
  assistantSlug: string | null | undefined;
  forceCode: boolean;
}): Promise<CodeTurn | null> {
  if (params.assistantSlug !== CODE_ASSISTANT_SLUG) return null;
  try {
    const project = await findActiveProjectSummary(params.chatId, params.userId);
    const intent = await detectCodeIntent({
      message: params.userPrompt,
      assistantSlug: params.assistantSlug,
      forced: params.forceCode,
      project: project
        ? { title: project.title, framework: project.framework, paths: project.files.map((f) => f.path) }
        : null,
    });
    if (intent.intent === "NONE") return null;

    // Only EDIT/ASK turns need the actual source attached.
    const files = project && intent.intent !== "NEW" ? await readFiles(project.id) : [];
    const note = buildCodeTurnNote({
      intent,
      project: project ? { title: project.title, framework: project.framework, files } : null,
      userPrompt: params.userPrompt,
    });
    console.log(`[code-workspace] chat=${params.chatId} intent=${intent.intent} title="${intent.title}"`);
    return {
      intent,
      projectId: intent.intent === "NEW" ? null : (project?.id ?? null),
      protocolPrompt: intent.intent === "ASK" ? null : CODE_SYSTEM_PROMPT,
      note,
    };
  } catch (error: any) {
    console.error(`[code-workspace] prepare failed, continuing as normal chat: ${error?.message ?? error}`);
    return null;
  }
}

/**
 * Inserts the code blocks right after the leading system messages (persona,
 * user context). The protocol prompt is stable → cache-controlled; the note
 * changes every turn → plain, and after it so it doesn't break the cache.
 */
export function injectCodeTurnMessages(history: any[], turn: CodeTurn, modelExternalId: string): void {
  const firstNonSystem = history.findIndex((m: any) => m.role !== "system" && m.role !== "SYSTEM");
  const at = firstNonSystem === -1 ? history.length : firstNonSystem;
  const blocks: any[] = [];
  if (turn.protocolPrompt) blocks.push(buildSystemMessage(turn.protocolPrompt, modelExternalId));
  if (turn.note) blocks.push({ role: "system", content: turn.note });
  history.splice(at, 0, ...blocks);
}

function writeSse(res: Response, payload: Record<string, unknown>) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if (typeof (res as any).flush === "function") (res as any).flush();
}

export class CodeSession {
  private readonly parser: CodeStreamParser;
  /** File writes run strictly in order (a delete then a re-create of the same path must not race). */
  private writes: Promise<void> = Promise.resolve();
  private readonly truncatedPaths = new Set<string>();
  private readonly deletedPaths = new Set<string>();
  private closed = false;
  private fallbackText = "";

  private constructor(
    private readonly res: Response,
    readonly projectId: number,
    readonly title: string,
    readonly isNew: boolean,
  ) {
    this.parser = new CodeStreamParser((event) => this.onParserEvent(event));
  }

  /**
   * Creates (NEW) or reopens (EDIT) the project and tells the client to open
   * the panel. Returns null for ASK turns — those stream as normal chat.
   * Must run after the SSE headers are sent.
   */
  static async start(params: { res: Response; turn: CodeTurn; userId: number; chatId: number }): Promise<CodeSession | null> {
    const { res, turn, userId, chatId } = params;
    if (turn.intent.intent === "ASK") return null;

    let project: { id: number; title: string; framework: string; previewable: boolean; currentVersion: number };
    if (turn.intent.intent === "NEW" || !turn.projectId) {
      project = await createProject({ userId, chatId, title: turn.intent.title, framework: turn.intent.framework });
    } else {
      await snapshotUserEditsIfDirty(turn.projectId);
      await setProjectStatus(turn.projectId, "GENERATING");
      const existing = await findActiveProject(chatId, userId);
      if (!existing || existing.id !== turn.projectId) return null;
      project = existing;
    }

    const isNew = turn.intent.intent === "NEW" || !turn.projectId;
    writeSse(res, {
      type: "code_project",
      projectId: project.id,
      title: project.title,
      framework: project.framework,
      previewable: project.previewable,
      version: project.currentVersion,
      isNew,
    });
    return new CodeSession(res, project.id, project.title, isNew);
  }

  push(delta: string): void {
    this.parser.push(delta);
  }

  private onParserEvent(event: CodeParserEvent): void {
    switch (event.type) {
      case "text":
        writeSse(this.res, { type: "token", content: event.content });
        return;
      case "code_file_end": {
        const { path, content, truncated } = event;
        if (truncated) this.truncatedPaths.add(path);
        this.deletedPaths.delete(path);
        this.enqueueWrite(() => writeFile(this.projectId, path, content));
        writeSse(this.res, { type: "code_file_end", path, truncated: !!truncated });
        return;
      }
      case "code_file_delete": {
        const { path } = event;
        this.deletedPaths.add(path);
        this.enqueueWrite(() => removeFile(this.projectId, path));
        writeSse(this.res, event);
        return;
      }
      default:
        writeSse(this.res, event);
    }
  }

  private enqueueWrite(op: () => Promise<void>) {
    this.writes = this.writes.then(op).catch((error) => {
      console.error(`[code-workspace] project=${this.projectId} file write failed:`, error);
    });
  }

  /**
   * Stream finished (or was stopped). Flushes the parser and returns the text
   * that belongs in the chat bubble — never the raw tagged output.
   */
  async closeStream(): Promise<string> {
    if (!this.closed) {
      this.parser.end();
      this.closed = true;
      await this.writes;
      if (!this.parser.visibleText) {
        const count = this.parser.writtenPaths.length;
        this.fallbackText = count
          ? `${this.isNew ? "Created" : "Updated"} **${this.title}** — ${count} file${count === 1 ? "" : "s"} ${this.isNew ? "written" : "changed"}.`
          : this.deletedPaths.size
            ? `Removed ${this.deletedPaths.size} file${this.deletedPaths.size === 1 ? "" : "s"} from **${this.title}**.`
            : "";
        if (this.fallbackText) writeSse(this.res, { type: "token", content: this.fallbackText });
      }
    }
    return this.parser.visibleText || this.fallbackText;
  }

  get fileCount(): number {
    return this.parser.writtenPaths.length;
  }

  /**
   * After the ModelResponse row exists: snapshot the result as a version tied
   * to that response (this is how the chat bubble finds its project card) and
   * tell the client the editor can unlock.
   */
  async complete(modelResponseId: number | null | undefined): Promise<void> {
    await this.closeStream();
    const touched = this.parser.writtenPaths.length + this.deletedPaths.size;
    let version: number | null = null;
    try {
      if (touched > 0) {
        version = await snapshotVersion(this.projectId, "AI", {
          modelResponseId: modelResponseId ?? null,
          plan: this.parser.planText,
          changedPaths: [...this.parser.writtenPaths, ...[...this.deletedPaths].map((p) => `-${p}`)],
        });
      }
      // A brand-new project with no files means the model ignored the format;
      // its answer is still in the chat bubble as plain text.
      await setProjectStatus(this.projectId, this.isNew && touched === 0 ? "FAILED" : "READY");
    } catch (error) {
      console.error(`[code-workspace] project=${this.projectId} finalize failed:`, error);
      await setProjectStatus(this.projectId, "READY").catch(() => {});
    }
    writeSse(this.res, {
      type: "code_done",
      projectId: this.projectId,
      version,
      fileCount: this.parser.writtenPaths.length,
      truncatedPaths: [...this.truncatedPaths],
      failed: this.isNew && touched === 0,
    });

    // Mirror the new version to GitHub. Deliberately after code_done and not
    // awaited: a slow or failing GitHub call must never hold up the chat stream.
    // A no-op for projects without a linked repo, and for servers without
    // GitHub credentials (pushAfterAiTurn checks both and never throws).
    if (version !== null) void pushAfterAiTurn(this.projectId);
  }
}
