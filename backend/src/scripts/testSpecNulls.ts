/**
 * Regression: models emit null for absent optional fields. Rejecting that
 * forces a full retry and doubles the cost of a document, so every optional
 * field must accept null exactly like an omitted key.
 *
 * Usage: npx tsx src/scripts/testSpecNulls.ts
 */

import { validateDocumentSpec } from "@/modules/document/document.validators.js";

const CASES: Array<{ label: string; spec: unknown }> = [
  {
    // The exact shape that failed in production on attempt 1.
    label: "quote with attribution: null",
    spec: {
      title: "T",
      blocks: [{ type: "quote", text: "What is the weather?", attribution: null }],
    },
  },
  {
    label: "spec-level subtitle/author null",
    spec: {
      title: "T",
      subtitle: null,
      author: null,
      coverPage: null,
      showPageNumbers: null,
      blocks: [{ type: "paragraph", text: "x" }],
    },
  },
  { label: "table caption null", spec: { title: "T", blocks: [{ type: "table", columns: ["A"], rows: [["1"]], caption: null }] } },
  { label: "callout title null", spec: { title: "T", blocks: [{ type: "callout", variant: "info", title: null, text: "x" }] } },
  { label: "code language null", spec: { title: "T", blocks: [{ type: "code", language: null, code: "x" }] } },
  { label: "list ordered null", spec: { title: "T", blocks: [{ type: "list", ordered: null, items: ["a"] }] } },
  { label: "table row cell null", spec: { title: "T", blocks: [{ type: "table", columns: ["A", "B"], rows: [["1", null]] }] } },
  {
    label: "image caption/width null",
    spec: { title: "T", blocks: [{ type: "image", url: "https://res.cloudinary.com/x.png", caption: null, width: null }] },
  },
];

// These must STILL be rejected — loosening nulls must not loosen the schema.
const MUST_FAIL: Array<{ label: string; spec: unknown }> = [
  { label: "required text null", spec: { title: "T", blocks: [{ type: "paragraph", text: null }] } },
  { label: "http image url", spec: { title: "T", blocks: [{ type: "image", url: "http://evil.com/x.png" }] } },
  { label: "unknown block type", spec: { title: "T", blocks: [{ type: "chart", data: [] }] } },
  { label: "missing title", spec: { blocks: [{ type: "paragraph", text: "x" }] } },
];

let pass = 0;
const total = CASES.length + MUST_FAIL.length;

console.log("\nShould ACCEPT (null == omitted):");
for (const c of CASES) {
  const { error } = validateDocumentSpec(c.spec);
  const ok = !error;
  if (ok) pass += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.label}${error ? ` → ${error.message}` : ""}`);
}

console.log("\nShould still REJECT:");
for (const c of MUST_FAIL) {
  const { error } = validateDocumentSpec(c.spec);
  const ok = Boolean(error);
  if (ok) pass += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${c.label}`);
}

console.log(`\n  ${pass}/${total} correct\n`);
if (pass !== total) process.exit(1);
