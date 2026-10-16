/**
 * Self-check for CodeStreamParser (the repo has no test framework).
 *
 *   npx tsx src/modules/code-workspace/code-workspace.parser.check.ts
 *
 * Every sample is fed once whole and then hundreds of times split into random
 * chunk sizes (1–20 chars), the way OpenRouter deltas actually arrive. The
 * result must be identical for every split and match the expected output.
 */
import assert from "node:assert/strict";
import { CodeStreamParser } from "./code-workspace.parser.js";
import type { CodeParserEvent } from "./code-workspace.types.js";

interface Result {
  plan: string;
  visible: string;
  files: Record<string, { content: string; truncated: boolean }>;
  deleted: string[];
}

function run(chunks: string[]): Result {
  const events: CodeParserEvent[] = [];
  const parser = new CodeStreamParser((e) => events.push(e));
  for (const c of chunks) parser.push(c);
  parser.end();

  const files: Result["files"] = {};
  const streamed: Record<string, string> = {};
  const deleted: string[] = [];
  let open: string | null = null;
  for (const e of events) {
    if (e.type === "code_file_start") {
      assert.equal(open, null, `file_start ${e.path} while ${open} still open`);
      open = e.path;
      streamed[e.path] = "";
    } else if (e.type === "code_file_delta") {
      assert.equal(e.path, open, "delta for a file that is not open");
      streamed[e.path] += e.content;
    } else if (e.type === "code_file_end") {
      assert.equal(e.path, open, "end for a file that is not open");
      // What the client assembled from deltas must equal what the server saves.
      assert.equal(streamed[e.path], e.content, `deltas != saved content for ${e.path}`);
      files[e.path] = { content: e.content, truncated: !!e.truncated };
      open = null;
    } else if (e.type === "code_file_delete") {
      deleted.push(e.path);
    }
  }
  assert.equal(open, null, "a file was left open after end()");
  return { plan: parser.planText, visible: parser.visibleText, files, deleted };
}

function randomChunks(text: string, seed: number): string[] {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: string[] = [];
  for (let i = 0; i < text.length; ) {
    const n = 1 + Math.floor(rand() * 20);
    out.push(text.slice(i, i + n));
    i += n;
  }
  return out;
}

function check(name: string, input: string, expected: Result) {
  const whole = run([input]);
  assert.deepEqual(whole, expected, `${name}: whole-input result differs`);
  for (let seed = 1; seed <= 400; seed++) {
    assert.deepEqual(run(randomChunks(input, seed)), expected, `${name}: differs for seed ${seed}`);
  }
  // One char at a time — the harshest split.
  assert.deepEqual(run([...input]), expected, `${name}: differs for 1-char chunks`);
  console.log(`✓ ${name}`);
}

// ---------------------------------------------------------------------------

check(
  "standard response",
  `Sure — here is the project.
<plan>
- React + Tailwind
- 2 files
</plan>
<file path="src/App.jsx">
import React from 'react';

export default function App() {
  return <div className="p-4">Hi</div>;
}
</file>
<file path="./index.html">
<!doctype html>
<html><body><div id="root"></div></body></html>
</file>
<summary>
Your app is ready. Edit \`src/App.jsx\` to start.
</summary>`,
  {
    plan: "- React + Tailwind\n- 2 files",
    visible: "Sure — here is the project.\n\nYour app is ready. Edit `src/App.jsx` to start.",
    files: {
      "src/App.jsx": {
        content: "import React from 'react';\n\nexport default function App() {\n  return <div className=\"p-4\">Hi</div>;\n}\n",
        truncated: false,
      },
      "index.html": {
        content: '<!doctype html>\n<html><body><div id="root"></div></body></html>\n',
        truncated: false,
      },
    },
    deleted: [],
  },
);

check(
  "markdown fence inside <file> is dropped",
  `<file path="a.js">
\`\`\`javascript
const x = \`template\`;
console.log(x);
\`\`\`
</file>`,
  {
    plan: "",
    visible: "",
    files: { "a.js": { content: "const x = `template`;\nconsole.log(x);\n", truncated: false } },
    deleted: [],
  },
);

check(
  'literal "</file>" inside code is kept, close at line end works',
  `<file path="s.js">
const tag = "</file>"; // not the end
function f() {}</file>
<summary>done</summary>`,
  {
    plan: "",
    visible: "done",
    files: { "s.js": { content: 'const tag = "</file>"; // not the end\nfunction f() {}', truncated: false } },
    deleted: [],
  },
);

check(
  "missing </file> and missing </plan>",
  `<plan>
two files
<file path="a.css">
body { margin: 0; }
<file path="b.css">
p { color: red; }
</file>`,
  {
    plan: "two files",
    visible: "",
    files: {
      "a.css": { content: "body { margin: 0; }\n", truncated: false },
      "b.css": { content: "p { color: red; }\n", truncated: false },
    },
    deleted: [],
  },
);

check(
  "delete tag, unsafe paths skipped, html in prose stays text",
  `Use a <div> or <p> here.
<delete path="src/old.js" />
<file path="../etc/passwd">
nope
</file>
<file path="node_modules/x/index.js">
nope
</file>
<file path='src/ok.ts'>
export const ok = 1 < 2;
</file>`,
  {
    plan: "",
    visible: "Use a <div> or <p> here.",
    files: { "src/ok.ts": { content: "export const ok = 1 < 2;\n", truncated: false } },
    deleted: ["src/old.js"],
  },
);

check(
  "stream cut mid-file is kept as truncated",
  `<plan>big app</plan>
<file path="src/App.tsx">
export function App() {
  return null;
</fi`,
  {
    plan: "big app",
    visible: "",
    files: { "src/App.tsx": { content: "export function App() {\n  return null;\n", truncated: true } },
    deleted: [],
  },
);

check(
  "no tags at all — everything is chat text",
  "Closures capture variables from the enclosing scope.\n\nExample: `const f = () => x;`",
  {
    plan: "",
    visible: "Closures capture variables from the enclosing scope.\n\nExample: `const f = () => x;`",
    files: {},
    deleted: [],
  },
);

console.log("\nAll parser checks passed.");
