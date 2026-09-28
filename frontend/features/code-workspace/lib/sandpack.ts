import type { SandpackFiles, SandpackPredefinedTemplate } from "@codesandbox/sandpack-react";

export interface SandpackSetup {
  template: SandpackPredefinedTemplate;
  files: SandpackFiles;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

function parsePackageJson(content: string | undefined): PackageJson | null {
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Sandpack's browser-side Node runtime ("Nodebox") can't run real esbuild
 * (it needs a native binary), so Vite only works there through a WASM build
 * of esbuild that Nodebox resolves specially — and only for the exact Vite
 * version its own default templates ship, `4.1.4`. A model writing a newer
 * Vite (5.x/6.x, whatever it knows as "current") resolves fine on the user's
 * own machine but fails inside Sandpack with
 * `Cannot find module 'esbuild-wasm' from '.../vite@5.x.x/...'`.
 *
 * These exact versions are copied from `@codesandbox/sandpack-react`'s own
 * VITE_REACT_TEMPLATE / VITE_VUE_TEMPLATE — the versions Nodebox is actually
 * built and tested against.
 */
const NODEBOX_VITE_DEPS: Record<"vite-react" | "vite-vue", Record<string, string>> = {
  "vite-react": { vite: "4.1.4", "@vitejs/plugin-react": "3.1.0", "esbuild-wasm": "0.17.12" },
  "vite-vue": { vite: "4.1.4", "@vitejs/plugin-vue": "3.2.0", "esbuild-wasm": "0.17.12" },
};

/**
 * Maps the project's files onto a Sandpack template. The system prompt steers
 * the model to a Vite layout (index.html → /src/main.jsx), so the vite
 * templates run it as-is; the template's own default files only fill gaps.
 *
 * package.json is patched *for the preview only* (never saved, never in the
 * ZIP) — whatever Vite/plugin version the model wrote is overridden with the
 * Nodebox-compatible pins above so the preview can actually build, while the
 * saved files and the downloaded ZIP keep the model's real choice, which
 * works fine on the user's own Node.js.
 */
export function toSandpackSetup(files: { path: string; content: string }[], framework: string): SandpackSetup {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const pkg = parsePackageJson(byPath.get("package.json"));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);

  let template: SandpackPredefinedTemplate;
  if (has("vue") || framework === "vue") template = "vite-vue";
  else if (has("react") || framework === "react") template = "vite-react";
  else if (has("vite")) template = "vite";
  else template = "static";

  const out: SandpackFiles = {};
  for (const [path, code] of byPath) out[`/${path}`] = { code };

  if ((template === "vite-react" || template === "vite-vue") && pkg) {
    const devDependencies = { ...(pkg.devDependencies ?? {}), ...NODEBOX_VITE_DEPS[template] };
    const scripts = { ...(pkg.scripts ?? {}) };
    if (!scripts.dev || !String(scripts.dev).includes("vite")) scripts.dev = "vite";
    out["/package.json"] = { code: JSON.stringify({ ...pkg, scripts, devDependencies }, null, 2) };
  }

  return { template, files: out };
}
