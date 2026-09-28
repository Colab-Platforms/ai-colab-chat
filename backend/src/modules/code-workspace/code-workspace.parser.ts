import {
  MAX_FILE_CHARS,
  MAX_FILES_PER_PROJECT,
  MAX_PATH_CHARS,
  type CodeParserEvent,
} from "./code-workspace.types.js";

/**
 * Turns the model's raw streamed text into code-workspace events.
 *
 * The model is told (code-workspace.protocol.ts) to answer in this shape:
 *
 *   <plan>…</plan>
 *   <file path="src/App.jsx">
 *   …full file content…
 *   </file>
 *   <delete path="src/old.js" />
 *   <summary>…</summary>
 *
 * Deltas arrive in arbitrary chunks, so a tag can be split across two of
 * them ("<fi" + "le path=…"). The parser holds back only the smallest tail
 * that could still turn into a tag and streams everything else immediately —
 * that is what makes the editor fill up line by line instead of in bursts.
 *
 * Tolerated model mistakes (each seen in practice):
 *  - a file wrapped in a markdown fence inside <file> → fence lines dropped
 *  - a missing </file> before the next <file> → previous file closed there
 *  - a missing </plan> before the first <file> → plan closed there
 *  - "</file>" inside code (a string literal) → only treated as the closing
 *    tag at the start or end of a line
 *  - the stream ending mid-file → the file is kept and flagged truncated
 */

type Mode = "TEXT" | "PLAN" | "SUMMARY" | "FILE";

type Tag =
  | { kind: "plan_open" | "plan_close" | "summary_open" | "summary_close" | "stray_close"; length: number }
  | { kind: "file_open" | "delete"; path: string; length: number };

/** Longest "<…" we are willing to wait on before deciding it is plain text. */
const TAG_LOOKAHEAD = MAX_PATH_CHARS + 40;
const CLOSE_FILE = "</file>";
const TAG_NAMES = ["plan", "/plan", "summary", "/summary", "file", "/file", "delete", "/delete"];

const FILE_OPEN_AT_LINE_START = /(^|\n)<file\s+path\s*=\s*["'][^"'\n]*["']\s*>/g;
/** A trailing line of only backticks (optionally followed by blank lines) — a closing fence in the making. */
const TRAILING_FENCE = /(^|\n)`{1,3}[ \t]*(?:\r?\n[ \t]*)*$/;
const OPENING_FENCE_LINE = /^```[\w.+#-]*$/;

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  json: "json", html: "html", htm: "html", vue: "html", svelte: "html",
  css: "css", scss: "scss", sass: "scss", less: "less",
  md: "markdown", mdx: "markdown", py: "python", rb: "ruby", php: "php",
  java: "java", kt: "kotlin", go: "go", rs: "rust", c: "c", h: "c",
  cpp: "cpp", cc: "cpp", hpp: "cpp", cs: "csharp", swift: "swift",
  sql: "sql", sh: "shell", bash: "shell", yml: "yaml", yaml: "yaml",
  xml: "xml", svg: "xml", toml: "ini", ini: "ini", env: "ini",
  graphql: "graphql", gql: "graphql", txt: "plaintext",
};

/** Monaco language id for a file path. */
export function languageFromPath(path: string): string {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  if (name.startsWith(".env")) return "ini";
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return LANGUAGE_BY_EXTENSION[ext] ?? "plaintext";
}

/**
 * Normalises a model- or user-supplied path to a clean relative project path,
 * or returns null when it must not be written (absolute, escapes the project,
 * or points into dependency/VCS folders).
 */
export function normalizeCodePath(raw: string): string | null {
  let path = raw.trim().replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  path = path.replace(/^(\.\/)+/, "").replace(/^\/+/, "");
  if (!path || path.length > MAX_PATH_CHARS || path.endsWith("/")) return null;
  if (/[\u0000-\u001f<>:"|?*]/.test(path)) return null;
  const segments = path.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  if (segments[0] === "node_modules" || segments[0] === ".git") return null;
  return path;
}

/** True while `tail` (which starts with "<") could still become a file tag. */
function isPartialFileTag(tail: string): boolean {
  if (tail.includes("\n")) return false;
  if (CLOSE_FILE.startsWith(tail)) return true;
  if ('<file path="'.startsWith(tail) || "<file path='".startsWith(tail)) return true;
  return /^<file\s+path\s*=/.test(tail) && !tail.includes(">") && tail.length < TAG_LOOKAHEAD;
}

/** True while `s` (which starts with "<" and has no ">" yet) could still become a known tag. */
function couldBeTag(s: string): boolean {
  if (s.length >= TAG_LOOKAHEAD || s.includes("\n")) return false;
  const rest = s.slice(1).toLowerCase();
  return TAG_NAMES.some(
    (name) =>
      name.startsWith(rest) ||
      (rest.startsWith(name) && /[\s/]/.test(rest[name.length] ?? " ")),
  );
}

function matchTag(s: string, final: boolean): Tag | "wait" | null {
  const gt = s.indexOf(">");
  const nl = s.indexOf("\n");
  if (gt === -1 || (nl !== -1 && nl < gt)) {
    return !final && gt === -1 && couldBeTag(s) ? "wait" : null;
  }
  const tag = s.slice(0, gt + 1);
  const length = tag.length;
  let m: RegExpMatchArray | null;
  if (/^<plan\s*>$/i.test(tag)) return { kind: "plan_open", length };
  if (/^<\/plan\s*>$/i.test(tag)) return { kind: "plan_close", length };
  if (/^<summary\s*>$/i.test(tag)) return { kind: "summary_open", length };
  if (/^<\/summary\s*>$/i.test(tag)) return { kind: "summary_close", length };
  if ((m = tag.match(/^<file\s+path\s*=\s*["']([^"'\n]+)["']\s*>$/i))) {
    return { kind: "file_open", path: m[1], length };
  }
  if ((m = tag.match(/^<delete\s+path\s*=\s*["']([^"'\n]+)["']\s*\/?\s*>$/i))) {
    return { kind: "delete", path: m[1], length };
  }
  if (/^<\/(file|delete)\s*>$/i.test(tag)) return { kind: "stray_close", length };
  return null;
}

export class CodeStreamParser {
  private mode: Mode = "TEXT";
  private buf = "";
  private ended = false;

  // Text shown in the chat bubble (outside tags + <summary>).
  private visible = "";
  private pendingWhitespace = "";
  private plan = "";

  // Current <file> state.
  private filePath: string | null = null;
  private fileSkip = false;
  /** 0 = strip newline after the tag, 1 = check for an opening fence, 2 = streaming */
  private fileStage: 0 | 1 | 2 = 0;
  private fileFenced = false;
  private fileContent = "";
  private fileTruncated = false;

  private readonly seenPaths = new Set<string>();

  constructor(private readonly onEvent: (event: CodeParserEvent) => void) {}

  /** Plan text the model wrote inside <plan>. */
  get planText(): string {
    return this.plan.trim();
  }

  /** Everything the chat bubble should show — no code. */
  get visibleText(): string {
    return this.visible.replace(/\n{3,}/g, "\n\n").trim();
  }

  /** Paths written (or rewritten) during this turn, in order. */
  get writtenPaths(): string[] {
    return [...this.seenPaths];
  }

  push(delta: string): void {
    if (this.ended || !delta) return;
    this.buf += delta;
    this.drain(false);
  }

  /** Call once when the stream is over. Closes an unterminated file as truncated. */
  end(): void {
    if (this.ended) return;
    this.drain(true);
    if (this.mode === "FILE") {
      let tail = this.buf;
      const lastLt = tail.lastIndexOf("<");
      if (lastLt !== -1 && isPartialFileTag(tail.slice(lastLt))) tail = tail.slice(0, lastLt);
      this.finishFile(tail, true);
    } else if (this.buf) {
      this.emitMarkupText(this.buf);
    }
    this.buf = "";
    this.mode = "TEXT";
    this.ended = true;
  }

  private drain(final: boolean): void {
    let progressed = true;
    while (progressed && this.buf.length > 0) {
      progressed = this.mode === "FILE" ? this.drainFile(final) : this.drainMarkup(final);
    }
  }

  // ------------------------------------------------------------------ markup

  private drainMarkup(final: boolean): boolean {
    const lt = this.buf.indexOf("<");
    if (lt === -1) {
      this.emitMarkupText(this.buf);
      this.buf = "";
      return false;
    }
    if (lt > 0) {
      this.emitMarkupText(this.buf.slice(0, lt));
      this.buf = this.buf.slice(lt);
    }
    const tag = matchTag(this.buf, final);
    if (tag === "wait") return false;
    if (tag === null) {
      this.emitMarkupText("<");
      this.buf = this.buf.slice(1);
      return true;
    }
    this.buf = this.buf.slice(tag.length);
    this.applyTag(tag);
    return true;
  }

  private applyTag(tag: Tag): void {
    switch (tag.kind) {
      case "plan_open":
        this.mode = "PLAN";
        break;
      case "summary_open":
        this.mode = "SUMMARY";
        break;
      case "plan_close":
      case "summary_close":
        this.mode = "TEXT";
        break;
      case "file_open":
        this.startFile(tag.path);
        break;
      case "delete": {
        if (this.mode === "PLAN") this.mode = "TEXT";
        const path = normalizeCodePath(tag.path);
        if (path) {
          this.seenPaths.delete(path);
          this.onEvent({ type: "code_file_delete", path });
        }
        break;
      }
      case "stray_close":
        break;
    }
  }

  private emitMarkupText(text: string): void {
    if (!text) return;
    if (this.mode === "PLAN") {
      this.plan += text;
      this.onEvent({ type: "code_plan", content: text });
      return;
    }
    // TEXT / SUMMARY → chat bubble. Whitespace between tags is held until real
    // text follows, so the bubble does not fill with blank lines.
    let combined = this.pendingWhitespace + text;
    if (combined.trim() === "") {
      this.pendingWhitespace = combined;
      return;
    }
    if (this.visible === "") combined = combined.replace(/^\s+/, "");
    const trailing = /\s*$/.exec(combined)?.[0] ?? "";
    const body = combined.slice(0, combined.length - trailing.length);
    this.pendingWhitespace = trailing;
    this.visible += body;
    this.onEvent({ type: "text", content: body });
  }

  // -------------------------------------------------------------------- file

  private startFile(rawPath: string): void {
    const path = normalizeCodePath(rawPath);
    const overLimit = !!path && !this.seenPaths.has(path) && this.seenPaths.size >= MAX_FILES_PER_PROJECT;
    this.mode = "FILE";
    this.filePath = path;
    this.fileSkip = !path || overLimit;
    this.fileStage = 0;
    this.fileFenced = false;
    this.fileContent = "";
    this.fileTruncated = false;
    // A leftover "\n\n" before the file must not be flushed into the bubble later.
    this.pendingWhitespace = this.pendingWhitespace ? "\n\n" : "";
    if (!this.fileSkip && path) {
      this.seenPaths.add(path);
      this.onEvent({ type: "code_file_start", path, language: languageFromPath(path) });
    }
  }

  private drainFile(final: boolean): boolean {
    if (this.fileStage === 0) {
      if (this.buf.startsWith("\r\n")) this.buf = this.buf.slice(2);
      else if (this.buf.startsWith("\n")) this.buf = this.buf.slice(1);
      else if (this.buf === "\r" && !final) return false;
      this.fileStage = 1;
      if (!this.buf) return false;
    }

    if (this.fileStage === 1) {
      if (this.buf.startsWith("`")) {
        const nl = this.buf.indexOf("\n");
        if (nl === -1) {
          if (!final && this.buf.length < 60) return false;
        } else if (OPENING_FENCE_LINE.test(this.buf.slice(0, nl).trim())) {
          this.buf = this.buf.slice(nl + 1);
          this.fileFenced = true;
        }
      }
      this.fileStage = 2;
    }

    // Find where this file ends: an explicit </file>, or (model forgot it) the
    // next <file> tag at the start of a line.
    let holdFrom = Infinity;
    let searchFrom = 0;
    for (;;) {
      const closeIdx = this.buf.indexOf(CLOSE_FILE, searchFrom);
      const nextOpen = this.findNextFileOpen(searchFrom);

      if (nextOpen !== -1 && (closeIdx === -1 || nextOpen < closeIdx)) {
        this.finishFile(this.buf.slice(0, nextOpen), false);
        this.buf = this.buf.slice(nextOpen);
        this.mode = "TEXT";
        return true;
      }
      if (closeIdx === -1) break;

      const atLineStart =
        closeIdx === 0 ? this.fileContent === "" || this.fileContent.endsWith("\n") : this.buf[closeIdx - 1] === "\n";
      const after = this.buf.slice(closeIdx + CLOSE_FILE.length);
      const lineEnd = /^[ \t]*(\r?\n|$)/.exec(after);
      const atLineEnd = !!lineEnd && (lineEnd[1] !== "" || final);

      if (atLineStart || atLineEnd) {
        this.finishFile(this.buf.slice(0, closeIdx), false);
        this.buf = lineEnd ? after.slice(lineEnd[0].length) : after;
        this.mode = "TEXT";
        return true;
      }
      if (lineEnd && lineEnd[1] === "") {
        // "</file>" then only spaces up to the end of what we have — could
        // still be the real close once the next chunk shows a newline.
        holdFrom = closeIdx;
        break;
      }
      searchFrom = closeIdx + 1; // a literal "</file>" in the middle of a line of code
    }

    const safeEnd = Math.min(holdFrom, this.safeEmitEnd());
    this.emitFileContent(this.buf.slice(0, safeEnd));
    this.buf = this.buf.slice(safeEnd);
    return false;
  }

  /** Index of "<" of a complete `<file path="…">` tag at a line start, or -1. */
  private findNextFileOpen(from: number): number {
    FILE_OPEN_AT_LINE_START.lastIndex = from;
    let m: RegExpExecArray | null;
    while ((m = FILE_OPEN_AT_LINE_START.exec(this.buf))) {
      const lt = m.index + m[1].length;
      const atLineStart = lt > 0 || this.fileContent === "" || this.fileContent.endsWith("\n");
      if (atLineStart) return lt;
    }
    return -1;
  }

  /** How much of `buf` can be streamed now without swallowing a tag or closing fence. */
  private safeEmitEnd(): number {
    let end = this.buf.length;
    const lastLt = this.buf.lastIndexOf("<");
    if (lastLt !== -1 && isPartialFileTag(this.buf.slice(lastLt))) end = lastLt;
    if (this.fileFenced) {
      const m = TRAILING_FENCE.exec(this.buf.slice(0, end));
      if (m) end = m.index + m[1].length;
    }
    return end;
  }

  private emitFileContent(text: string): void {
    if (!text || this.fileSkip || !this.filePath) return;
    const room = MAX_FILE_CHARS - this.fileContent.length;
    if (text.length > room) {
      text = text.slice(0, Math.max(0, room));
      this.fileTruncated = true;
      if (!text) return;
    }
    this.fileContent += text;
    this.onEvent({ type: "code_file_delta", path: this.filePath, content: text });
  }

  private finishFile(tail: string, truncated: boolean): void {
    if (this.fileFenced) tail = tail.replace(TRAILING_FENCE, "$1");
    this.emitFileContent(tail);
    if (!this.fileSkip && this.filePath) {
      this.onEvent({
        type: "code_file_end",
        path: this.filePath,
        content: this.fileContent,
        truncated: truncated || this.fileTruncated,
      });
    }
    this.filePath = null;
    this.fileSkip = false;
    this.fileContent = "";
    this.fileFenced = false;
    this.fileTruncated = false;
  }
}
