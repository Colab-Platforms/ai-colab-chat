# Code workspace (AI coding assistant)

When a user of the **Software Engineer** assistant asks for something buildable ("create a portfolio website using reactjs"), the AI plans and writes a complete multi-file project. The frontend shows it in a slide-in panel: a live file tree, code streaming into a Monaco editor, a Sandpack preview, manual editing, AI editing by prompt, and ZIP download.

The frontend half lives in `frontend/features/code-workspace/`.

## Scope

Code mode only exists for chats whose assistant has slug `software-engineer` (`CODE_ASSISTANT_SLUG`). The gate is in `code-workspace.intent.ts` and in `prepareCodeTurn`. Any other chat, including one that sends `chatType: "CODE"` directly, gets a normal chat turn. The frontend learns this from `supportsCodeMode` on assistant responses (`assistant.service.ts`).

## Files

| File | What it does |
|---|---|
| `code-workspace.types.ts` | Constants, limits and event types |
| `code-workspace.intent.ts` | SE-only gate, then a free regex gate, then a cheap classifier. Returns `NEW` / `EDIT` / `ASK` / `NONE` |
| `code-workspace.protocol.ts` | `CODE_SYSTEM_PROMPT`, the output format the model must follow, plus the per-turn note that attaches the current files |
| `code-workspace.parser.ts` | `CodeStreamParser`: raw streamed text in, file events out |
| `code-workspace.parser.check.ts` | Parser self-test: `npx tsx src/modules/code-workspace/code-workspace.parser.check.ts` |
| `code-workspace.chat.ts` | Bridge to `chat.stream.ts`: `prepareCodeTurn`, `injectCodeTurnMessages`, `CodeSession` |
| `code-workspace.service.ts` | Project, file and version DB logic. REST calls check ownership |
| `code-workspace.controller.ts` / `.route.ts` / `.validators.ts` | REST API under `/api/code-projects` |

## One chat turn, end to end

```
POST /api/chats/:id/send  (chatType "CODE" if the pill is on)
 └─ chat.stream.ts streamChat
     ├─ resolveCodeChatType      CODE → STANDARD + forceCode (UsageLog.capability has no CODE)
     ├─ prepareCodeTurn          SE gate → intent → protocol prompt + current files note
     ├─ injectCodeTurnMessages   after the persona/context system blocks
     ├─ checkTokenLimits…        no follow-up-questions block, 32k completion cap
     ├─ CodeSession.start        NEW: create project · EDIT: snapshot user edits, reopen
     │                           → SSE code_project  (frontend opens the panel)
     ├─ model stream ─► session.push(delta) ─► CodeStreamParser
     │                           → SSE code_plan / code_file_start / code_file_delta /
     │                             code_file_end / code_file_delete / token
     │                           code_file_end also upserts the CodeFile row
     ├─ finish_reason "length" → one continuation call into the same parser
     ├─ session.closeStream()    the bubble text = plan/summary, never raw tags
     ├─ billing transaction      unchanged; creates the ModelResponse
     └─ session.complete(mrId)   CodeProjectVersion (linked to the response) + SSE code_done
```

`ASK` turns ("how does routing work in this project?") don't open a session. The files are attached as read-only context and the model answers in plain chat.

## Output protocol

```
<plan>…bullets…</plan>
<file path="src/App.jsx">
…complete file…
</file>
<delete path="src/old.js" />
<summary>…shown in the chat…</summary>
```

The parser tolerates these model mistakes:
- markdown fences inside `<file>`
- a missing `</file>` or `</plan>`
- `"</file>"` inside code: it only counts as the closing tag at the start or end of a line
- a stream that ends mid-file: the file is saved and flagged as truncated

If you change the prompt, change the parser too, and rerun the self-test.

## SSE events added

| event | payload |
|---|---|
| `code_project` | `{ projectId, title, framework, previewable, version, isNew }` |
| `code_plan` | `{ content }` (delta) |
| `code_file_start` | `{ path, language }` |
| `code_file_delta` | `{ path, content }` |
| `code_file_end` | `{ path, truncated }` |
| `code_file_delete` | `{ path }` |
| `code_done` | `{ projectId, version, fileCount, truncatedPaths, failed }` |

## Data model (`schema.prisma`)

- **`CodeProject`**: one project in a chat. `dirtySinceSnapshot` is set by manual edits.
- **`CodeFile`**: current content, unique on `(projectId, path)`.
- **`CodeProjectVersion`**: a snapshot after every AI turn (`AI`). The user's own edits are snapshotted before an AI edit or a restore (`USER`), and every restore is recorded too (`RESTORE`). The fields:
  - `modelResponseId` ties a version to a chat bubble. `chat.service.getById` includes it as `modelResponses[].codeVersions`.
  - `changedPaths` lists what the turn touched. A `-` prefix marks a deleted file.

## REST API (`/api/code-projects`)

| Method | Path | Body |
|---|---|---|
| GET | `/:id` | Returns the project and its files |
| PATCH | `/:id` | `{ title }` |
| DELETE | `/:id` | Soft delete |
| PUT | `/:id/files` | `{ path, content }`. Creates or saves a file |
| POST | `/:id/files/delete` | `{ path }`. A folder path deletes everything under it |
| POST | `/:id/files/rename` | `{ from, to }`. Works on files and folders |
| GET | `/:id/versions` | |
| POST | `/:id/versions/:version/restore` | |

Writes return `409` while the AI is still generating (`status = GENERATING`).

## Security notes

- `middlewares/sanitize.ts` skips `xss()` for `/api/code-projects/*` bodies and for `/send` bodies with `chatType: "CODE"`, because it corrupts JSX and HTML. Code is only ever shown as editor text or run in Sandpack's cross-origin iframe.
- Every path goes through `normalizeCodePath`. It rejects `..`, absolute paths, `node_modules/` and `.git/`.
- Limits: 80 files per project, 200k chars per file (`code-workspace.types.ts`).

## Env

`CODE_INTENT_MODEL` falls back to `DOCUMENT_INTENT_MODEL`, then to `google/gemini-2.5-flash`. `CODE_INTENT_TIMEOUT_MS` defaults to 8000.
