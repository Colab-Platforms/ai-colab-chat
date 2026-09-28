import type { CodeFileSnapshot, CodeIntent } from "./code-workspace.types.js";

/**
 * System prompt for code-mode turns. Stable across turns on purpose — it is
 * sent with cache_control (see buildSystemMessage), so it must not embed
 * anything per-turn. Per-turn material goes in buildCodeTurnNote().
 *
 * The output format here is what CodeStreamParser reads; change them together.
 */
export const CODE_SYSTEM_PROMPT = `You are now working as a coding agent inside a live code workspace. The user sees a file tree and an editor next to the chat; your answer is parsed and every file you write appears there as it streams.

## Output format (strict)

Answer in exactly this shape and nothing else:

<plan>
- 2–6 short bullets: stack, structure, the files you will write and why
</plan>
<file path="relative/path/to/file.ext">
…the COMPLETE contents of the file…
</file>
<file path="another/file.ext">
…
</file>
<summary>
2–4 sentences for the chat: what you built or changed and how to use it. No code here.
</summary>

Rules:
- Every file goes inside its own <file path="…"> … </file> block. Put "<file …>" and "</file>" on their own lines.
- Never wrap file contents in markdown code fences (\`\`\`). Never put code in <plan> or <summary>.
- Always write the COMPLETE file. Never use placeholders like "// …rest unchanged" or "/* existing code */".
- To remove a file, write <delete path="relative/path.ext" /> on its own line.
- Paths are relative to the project root, use forward slashes, no leading "/" or "./".
- Write the files in dependency order: config and entry files first, then components, then styles.

## Stack rules (so the in-browser preview can run the project)

For web apps and UI requests, default to React unless the user asks for something else:
- Files: package.json, index.html, src/main.jsx, src/App.jsx, src/components/*.jsx, src/index.css (plus others as needed).
- package.json lists "dependencies" (react, react-dom, and any npm packages you import, e.g. lucide-react, framer-motion) and a "scripts" block with "dev": "vite", "build": "vite build"; put "vite" and "@vitejs/plugin-react" in "devDependencies" and add a vite.config.js.
- index.html loads Tailwind with <script src="https://cdn.tailwindcss.com"></script> in <head> and has <div id="root"></div> and <script type="module" src="/src/main.jsx"></script>.
- Use Tailwind classes for styling. Import local files with relative paths ("./components/Hero.jsx").
- No binary assets (images, fonts). Use https://picsum.photos, https://images.unsplash.com URLs, inline SVG, or lucide-react icons instead.
- Vue: same idea with src/main.js + src/App.vue. Plain HTML/CSS/JS sites: index.html, styles.css, script.js.
- Backends (Node/Express, Python, etc.) are fine when asked for — write them completely; they just cannot be previewed in the browser.

## Quality bar

Write production-quality, idiomatic code with real content (no lorem ipsum unless asked), responsive layout, accessible markup, and sensible component boundaries. Keep each file focused; prefer 4–15 files for a typical app.`;

const EDIT_RULES = `This turn EDITS the existing project shown below.
- Output ONLY files you create or change, each as a complete file. Do not re-send unchanged files.
- Use <delete path="…" /> for files that should be removed.
- Keep the existing stack, structure and style unless the user asks otherwise.
- The files below are the CURRENT state, including any manual edits the user made in the editor — build on them, do not revert them.`;

const ASK_RULES = `The user is asking about the project shown below. Answer normally in chat (markdown, short code snippets are fine). Do NOT use <plan>, <file>, <delete> or <summary> tags this turn and do not rewrite files.`;

/** Upper bound on project source attached to a turn (~20k tokens). */
const MAX_CONTEXT_CHARS = 80_000;

/**
 * Chooses which files to include when the project is too big to attach whole:
 * files the prompt mentions first, then the smallest remaining files, until
 * the budget is spent. The rest are listed by path only.
 */
function selectFilesForContext(files: CodeFileSnapshot[], userPrompt: string) {
  const total = files.reduce((n, f) => n + f.content.length, 0);
  if (total <= MAX_CONTEXT_CHARS) return { included: files, omitted: [] as string[] };

  const prompt = userPrompt.toLowerCase();
  const mentioned = (f: CodeFileSnapshot) => {
    const base = f.path.split("/").pop()!.toLowerCase();
    const stem = base.replace(/\.[^.]+$/, "");
    return prompt.includes(f.path.toLowerCase()) || prompt.includes(base) || (stem.length > 3 && prompt.includes(stem));
  };
  const ordered = [...files].sort((a, b) => {
    const ma = mentioned(a) ? 0 : 1;
    const mb = mentioned(b) ? 0 : 1;
    return ma - mb || a.content.length - b.content.length;
  });

  const included: CodeFileSnapshot[] = [];
  const omitted: string[] = [];
  let used = 0;
  for (const f of ordered) {
    if (used + f.content.length <= MAX_CONTEXT_CHARS) {
      included.push(f);
      used += f.content.length;
    } else {
      omitted.push(f.path);
    }
  }
  return { included, omitted };
}

function renderProject(title: string, framework: string, files: CodeFileSnapshot[], userPrompt: string): string {
  const { included, omitted } = selectFilesForContext(files, userPrompt);
  const tree = files.map((f) => `- ${f.path}`).join("\n");
  const body = included.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join("\n");
  const omittedNote = omitted.length
    ? `\n\n(Not attached to save space — ask the user or keep them unchanged unless you must rewrite them: ${omitted.join(", ")})`
    : "";
  return `<current_project title="${title}" framework="${framework}">\nFile tree:\n${tree}\n\n${body}\n</current_project>${omittedNote}`;
}

/**
 * The per-turn system note: what kind of turn this is, plus the current
 * project for EDIT/ASK. Inserted after the stable system blocks so it does
 * not invalidate their prompt cache.
 */
export function buildCodeTurnNote(params: {
  intent: CodeIntent;
  project?: { title: string; framework: string; files: CodeFileSnapshot[] } | null;
  userPrompt: string;
}): string {
  const { intent, project, userPrompt } = params;
  if (intent.intent === "NEW") {
    return `This turn creates a NEW project titled "${intent.title}" (${intent.framework}). Follow the output format exactly.`;
  }
  if (!project) return "";
  const rendered = renderProject(project.title, project.framework, project.files, userPrompt);
  return `${intent.intent === "EDIT" ? EDIT_RULES : ASK_RULES}\n\n${rendered}`;
}

/** Sent as the user turn when an answer was cut off by max_tokens. */
export const CODE_CONTINUE_PROMPT = `Your previous answer was cut off by the length limit. Continue EXACTLY where it stopped — the very next character. Do not repeat anything already written, do not re-open the file that was being written, and do not add any preamble. Keep following the same output format until the <summary>.`;
