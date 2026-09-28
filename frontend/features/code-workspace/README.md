# Code workspace (frontend)

This is the slide-in panel where the Software Engineer assistant builds and edits projects. It has a live file tree, code streaming into Monaco, a Sandpack preview, manual editing with autosave, version history and ZIP download. The backend half is in `backend/src/modules/code-workspace/`. Its README has the SSE protocol and the API.

Import from `@/features/code-workspace` only. `index.ts` is the public API.

## Folder

```
features/code-workspace/
├── index.ts                    public exports
├── types.ts                    DTOs, SSE event types, CodeTurnInfo
├── api.ts                      REST calls (/api/code-projects)
├── store/codeWorkspaceStore.ts the single workspace store (see below)
├── lib/
│   ├── codeTurn.ts             SSE events / API data → what the chat bubble shows
│   ├── fileTree.ts             flat paths → nested tree
│   ├── language.ts             extension → Monaco language
│   ├── sandpack.ts             files → Sandpack template + files
│   └── download.ts             single file + JSZip
└── components/
    ├── CodePanel.tsx           slide-in/resize/mobile shell, status bar
    ├── CodePanelHeader.tsx     title, Code | Preview, versions, download, close
    ├── FileTree.tsx            live tree + new/rename/delete
    ├── CodeEditor.tsx          Monaco (streaming append + editing)
    ├── PreviewPane.tsx         Sandpack preview
    ├── GenerationSteps.tsx     "Planning → Building" steps in the chat bubble
    └── CodeProjectCard.tsx     project card under the answer (Open / ZIP)
```

## Where it plugs into the app

| File | Hook |
|---|---|
| `components/chat/ChatLayoutView.tsx` | renders `<CodePanel />` next to `<DocumentPanel />` and collapses the sidebar while it's open |
| `app/(chat)/c/[id]/page.tsx` | `streamSingleModel` sends `code_*` SSE events to `codeWorkspace.applyStreamEvent` and to `reduceCodeTurn`, which fills `mr.codeTurn` |
| `components/chat/message-bubble.tsx` | `GenerationSteps` + `CodeProjectCard` from `codeTurnFromResponse(mr)` |
| `components/chat/chat-input.tsx` | the **Code** pill (`supportsCodeMode`), which sends `chatType: "CODE"` for that turn |
| `components/chat/NewChatPage.tsx` | passes `supportsCodeMode`; never saves `CODE` as the chat capability |

`supportsCodeMode` comes from the assistant API. It is true only for the Software Engineer assistant.

## The store

A project arrives as thousands of small deltas, so the store is built around streaming performance:

- **Structural state** is React state, read through `useCodeWorkspace(selector)` with `useSyncExternalStore`. It covers the open/closed state, the project, file metadata, the active file, the view and the save state. It only changes on events such as a file starting or ending.
- **File contents** live in a plain `Map`, outside React state. Every delta is pushed through `subscribeDeltas` to `CodeEditor`. The editor then schedules a single `requestAnimationFrame` sync that appends whatever the store has beyond the Monaco model's length. The sync is idempotent, so switching files mid-stream can't duplicate or drop text.
- The **chat page never re-renders per token** for code. The bubble only gets `codeTurn` updates on file start and end.

Other behaviour:

- **Editing is locked** while the AI is writing, because the server returns 409. After that, typing autosaves per file with a 900 ms debounce and a `PUT /files`.
- **The panel belongs to one chat.** Navigating to another chat closes it. After a reload it reopens on the same chat, using `sessionStorage`.
- **Only one right-hand panel is open at a time.** Opening a document closes the code panel, and opening the code panel closes the document.
- **Preview** mounts Sandpack only the first time the user opens it. After that, edits refresh it with a 1.2 s debounce. `lib/sandpack.ts` adds vite to `package.json` if it's missing, but only for the preview. The saved files are untouched.

## Adding a new SSE event

1. Emit it from `CodeSession` in the backend (`code-workspace.chat.ts`).
2. Add it to `CodeStreamEvent` in `types.ts`.
3. Handle it in `codeWorkspace.applyStreamEvent`, and in `reduceCodeTurn` if the bubble should show it.
