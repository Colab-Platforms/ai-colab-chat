/**
 * Self-check for the Vercel build-config detector (the repo has no test framework).
 *
 *   npx tsx src/modules/vercel/vercel.detect.check.ts
 */
import assert from "node:assert/strict";
import { detectVercelConfig, isValidProjectName, slugifyProjectName } from "./vercel.detect.js";
import type { CodeFileSnapshot } from "@/modules/code-workspace/code-workspace.types.js";

function files(entries: Record<string, string>): CodeFileSnapshot[] {
  return Object.entries(entries).map(([path, content]) => ({ path, language: "plaintext", content }));
}

const pkg = (deps: Record<string, string>, scripts: Record<string, string> = { build: "vite build" }, extra = {}) =>
  JSON.stringify({ name: "app", scripts, dependencies: deps, ...extra });

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ok  ${name}`);
}

console.log("vercel.detect");

// What the code workspace generates for nearly every project.
check("vite + react SPA", () => {
  const r = detectVercelConfig(
    files({
      "package.json": pkg({ react: "^18.3.1", "react-dom": "^18.3.1", vite: "^5.4.0", "@vitejs/plugin-react": "^4.3.1" }),
      "index.html": "<div id=root></div>",
      "vite.config.js": "export default {}",
      "src/main.jsx": "const url = import.meta.env.VITE_API_URL; const m = import.meta.env.MODE;",
    }),
    "react",
  );
  assert.equal(r.deployable, true);
  assert.equal(r.framework, "vite");
  assert.equal(r.outputDirectory, "dist");
  assert.equal(r.buildCommand, null);
  assert.equal(r.installCommand, null);
  assert.equal(r.rootDirectory, null);
  assert.deepEqual(r.suggestedEnvKeys, ["VITE_API_URL"]);
  assert.match(r.reason, /Vite detected from package\.json \("vite": "\^5\.4\.0"\)/);
});

check("vite detected from vite.config alone", () => {
  const r = detectVercelConfig(
    files({ "package.json": pkg({ react: "^18" }), "index.html": "", "vite.config.ts": "" }),
    "react",
  );
  assert.equal(r.framework, "vite");
  assert.match(r.reason, /from vite\.config/);
});

check("bare static site", () => {
  const r = detectVercelConfig(files({ "index.html": "<h1>hi</h1>", "style.css": "", "app.js": "" }), "static");
  assert.equal(r.deployable, true);
  assert.equal(r.framework, null);
  assert.equal(r.outputDirectory, ".");
  assert.match(r.reason, /Static site/);
});

check("next.js", () => {
  const r = detectVercelConfig(
    files({ "package.json": pkg({ next: "14.2.0", react: "18" }, { build: "next build" }), "app/page.tsx": "" }),
    "react",
  );
  assert.equal(r.framework, "nextjs");
  assert.equal(r.outputDirectory, null);
  assert.equal(r.deployable, true);
});

check("create-react-app", () => {
  const r = detectVercelConfig(
    files({ "package.json": pkg({ "react-scripts": "5.0.1" }, { build: "react-scripts build" }), "public/index.html": "" }),
    "react",
  );
  assert.equal(r.framework, "create-react-app");
});

check("vite + vue maps to the vite preset, not vue", () => {
  const r = detectVercelConfig(files({ "package.json": pkg({ vue: "^3", vite: "^5" }), "index.html": "" }), "vue");
  assert.equal(r.framework, "vite");
});

check("python is never deployable", () => {
  const r = detectVercelConfig(files({ "app.py": "from flask import Flask", "index.html": "" }), "python");
  assert.equal(r.deployable, false);
  assert.match(r.blockedReason!, /Python/);
});

check("express server is not deployable", () => {
  const r = detectVercelConfig(
    files({ "package.json": pkg({ express: "^4" }, { start: "node index.js" }), "index.js": "require('express')" }),
    "node",
  );
  assert.equal(r.deployable, false);
  assert.match(r.blockedReason!, /server-side/);
});

check("a node project that ships vercel.json is allowed", () => {
  const r = detectVercelConfig(
    files({ "package.json": pkg({ express: "^4" }, { start: "node index.js" }), "vercel.json": "{}", "api/index.js": "" }),
    "node",
  );
  assert.equal(r.deployable, true);
});

check("empty project", () => {
  const r = detectVercelConfig([], "react");
  assert.equal(r.deployable, false);
});

check("app nested in a single top-level folder", () => {
  const r = detectVercelConfig(
    files({ "web/package.json": pkg({ vite: "^5" }), "web/index.html": "", "README.md": "" }),
    "react",
  );
  assert.equal(r.rootDirectory, "web");
  assert.equal(r.framework, "vite");
});

check("engines.node pins the node version", () => {
  const r = detectVercelConfig(
    files({ "package.json": pkg({ vite: "^5" }, { build: "vite build" }, { engines: { node: ">=20" } }), "index.html": "" }),
    "react",
  );
  assert.equal(r.nodeVersion, "20.x");
});

check("process.env keys, built-ins and VERCEL_* skipped", () => {
  const r = detectVercelConfig(
    files({
      "package.json": pkg({ next: "14" }, { build: "next build" }),
      "lib/db.ts": "process.env.DATABASE_URL; process.env.NODE_ENV; process.env.VERCEL_URL; process.env.STRIPE_KEY",
      "README.md": "process.env.NOT_SOURCE",
    }),
    "react",
  );
  assert.deepEqual(r.suggestedEnvKeys, ["DATABASE_URL", "STRIPE_KEY"]);
});

check("slugifyProjectName", () => {
  assert.equal(slugifyProjectName("My Portfolio Website!"), "my-portfolio-website");
  assert.equal(slugifyProjectName("---Café   Menu---"), "cafe-menu");
  assert.equal(slugifyProjectName("   "), "my-project");
  assert.equal(slugifyProjectName("a".repeat(150)).length, 100);
  for (const t of ["Todo App", "x---y", "__hidden", "Résumé 2024", "a.b_c-d"]) {
    assert.ok(isValidProjectName(slugifyProjectName(t)), `${t} -> ${slugifyProjectName(t)}`);
  }
});

check("isValidProjectName", () => {
  assert.ok(isValidProjectName("my-app"));
  assert.ok(!isValidProjectName("My-App"));
  assert.ok(!isValidProjectName("my---app"));
  assert.ok(!isValidProjectName("-app"));
});

console.log(`\n${passed} checks passed`);
