import type { SandpackFiles, SandpackPredefinedTemplate } from "@codesandbox/sandpack-react";

/**
 * How the preview runs:
 *  - "fast": Sandpack's in-browser bundler. No VM, no `npm install` (packages
 *    come from CodeSandbox's CDN and are browser-cached), so it's up in a
 *    second or two instead of ~15 s.
 *  - "vite": Nodebox — a Node VM in the browser running the project's own
 *    Vite. Slow to boot but faithful; used whenever "fast" can't run the
 *    project as-is (see `fastReactSetup`), or when the user asks for it.
 *  - "static": plain HTML/CSS/JS, no bundling needed.
 */
export type PreviewEngine = "fast" | "vite" | "static";

export interface SandpackSetup {
  template: SandpackPredefinedTemplate;
  files: SandpackFiles;
  engine: PreviewEngine;
  /** A React project the fast engine can run — i.e. the user can switch engines. */
  fastCapable: boolean;
  /** Scripts/stylesheets loaded before the bundle runs (fast engine only). */
  externalResources?: string[];
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
export function toSandpackSetup(
  files: { path: string; content: string }[],
  framework: string,
  opts: { forceVite?: boolean } = {},
): SandpackSetup {
  const byPath = new Map(files.map((f) => [f.path, f.content]));
  const pkg = parsePackageJson(byPath.get("package.json"));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);

  let template: SandpackPredefinedTemplate;
  if (has("vue") || framework === "vue") template = "vite-vue";
  else if (has("react") || framework === "react") template = "vite-react";
  else if (has("vite")) template = "vite";
  else template = "static";

  if (template === "vite-react") {
    const fast = fastReactSetup(byPath, pkg);
    if (fast && !opts.forceVite) return fast;
    if (fast) return { ...viteSetup(byPath, pkg, template), fastCapable: true };
  }
  return viteSetup(byPath, pkg, template);
}

function viteSetup(byPath: Map<string, string>, pkg: PackageJson | null, template: SandpackPredefinedTemplate): SandpackSetup {
  const out: SandpackFiles = {};
  for (const [path, code] of byPath) out[`/${path}`] = { code };

  if ((template === "vite-react" || template === "vite-vue") && pkg) {
    const devDependencies = { ...(pkg.devDependencies ?? {}), ...NODEBOX_VITE_DEPS[template] };
    const scripts = { ...(pkg.scripts ?? {}) };
    if (!scripts.dev || !String(scripts.dev).includes("vite")) scripts.dev = "vite";
    out["/package.json"] = { code: JSON.stringify({ ...pkg, scripts, devDependencies }, null, 2) };
  }

  return { template, files: out, engine: template === "static" ? "static" : "vite", fastCapable: false };
}

/* ------------------------------------------------------------------ *
 * Fast engine: run a Vite + React project on Sandpack's bundler
 * ------------------------------------------------------------------ */

const SOURCE_FILE = /\.(m?[jt]sx?)$/;
/** Vite features the bundler doesn't have. Any of these → run the real Vite. */
const VITE_ONLY_SOURCE = /import\.meta\b|["'][^"'\n]+\?(raw|url|worker|inline|sharedworker)["']/;
/** PostCSS-based styling (npm Tailwind, Sass, …) needs Vite's CSS pipeline. */
const NEEDS_CSS_PIPELINE = /^(tailwind|postcss)\.config\.[cm]?[jt]s$|\.(scss|sass|less|styl)$/;
/** vite.config imports that don't change how the code runs. */
const HARMLESS_VITE_CONFIG_IMPORTS = new Set(["vite", "@vitejs/plugin-react", "@vitejs/plugin-react-swc", "path", "node:path", "url", "node:url"]);

const ENTRY_DIR = "/__preview__";
const ENTRY_FILE = `${ENTRY_DIR}/entry.js`;

/** `<tag attr="x" flag>` → { attr: "x", flag: "" } (enough for model-written HTML). */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z-:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

const isRemote = (url: string) => /^https?:\/\//i.test(url);
/** Project-relative path of a local URL in index.html ("/src/main.jsx", "./x.css" → "src/main.jsx", "x.css"). */
const localPath = (url: string) => url.replace(/^\.?\//, "").split(/[?#]/)[0];

/** Package name of a bare import ("react-dom/client" → "react-dom", "@a/b/c" → "@a/b"). */
function packageName(specifier: string): string | null {
  if (/^[./]|^[a-z]+:/i.test(specifier)) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function importedPackages(sources: string[]): Set<string> {
  const names = new Set<string>();
  const re = /(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*\(?\s*["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/g;
  for (const code of sources) {
    for (const m of code.matchAll(re)) {
      const name = packageName(m[1] ?? m[2] ?? m[3]);
      if (name) names.add(name);
    }
  }
  return names;
}

/**
 * Rewrites a Vite React project so Sandpack's bundler (create-react-app
 * preset) can run it. Returns null when the project relies on something only
 * the real Vite does — then the caller falls back to Nodebox.
 *
 * The bundler sets the page body with innerHTML (scripts in it never run) and
 * takes its entry from package.json `main`, so index.html is taken apart:
 *  - remote <script src> / <link rel=stylesheet> → `externalResources`
 *    (loaded, in order, before the bundle runs — this is how the Tailwind
 *    Play CDN keeps working);
 *  - inline <script>/<style> and local ones → modules imported, in page
 *    order, by a generated entry file, which imports the page's own module
 *    entry (src/main.jsx) last, as the browser would;
 *  - the remaining markup → /public/index.html.
 * The saved files are never changed — this is only what the preview runs.
 */
function fastReactSetup(byPath: Map<string, string>, pkg: PackageJson | null): SandpackSetup | null {
  const html = byPath.get("index.html");
  if (!html) return null;

  const paths = [...byPath.keys()];
  if (paths.some((p) => NEEDS_CSS_PIPELINE.test(p.split("/").pop() ?? p))) return null;
  const sources = paths.filter((p) => SOURCE_FILE.test(p) && !/^vite\.config\./.test(p)).map((p) => byPath.get(p) ?? "");
  if (sources.some((code) => VITE_ONLY_SOURCE.test(code))) return null;
  for (const [path, code] of byPath) {
    if (path.endsWith(".css") && /@tailwind\b|@apply\b|@config\b/.test(code)) return null;
  }
  const viteConfig = paths.find((p) => /^vite\.config\.[cm]?[jt]s$/.test(p));
  if (viteConfig) {
    const code = byPath.get(viteConfig) ?? "";
    if (/\balias\b|\bdefine\s*:/.test(code)) return null;
    if ([...importedPackages([code])].some((name) => !HARMLESS_VITE_CONFIG_IMPORTS.has(name))) return null;
  }

  const externalResources: string[] = [];
  const entryImports: string[] = [];
  const generated: SandpackFiles = {};
  let moduleEntry: string | null = null;
  let inlineCount = 0;
  const addInline = (ext: "js" | "css", code: string) => {
    const file = `${ENTRY_DIR}/inline-${++inlineCount}.${ext}`;
    generated[file] = { code };
    entryImports.push(`.${file.slice(ENTRY_DIR.length)}`);
  };

  // Walk the page's scripts/styles in document order.
  const tagRe = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>|<style\b[^>]*>([\s\S]*?)<\/style\s*>|<link\b([^>]*)\/?>/gi;
  for (const m of html.matchAll(tagRe)) {
    if (m[3] !== undefined) {
      if (m[3].trim()) addInline("css", m[3]);
      continue;
    }
    if (m[4] !== undefined) {
      const a = attrs(m[4]);
      if (!/\bstylesheet\b/i.test(a.rel ?? "") || !a.href) continue;
      if (isRemote(a.href)) {
        // The bundler loads a resource as CSS only when the URL ends in
        // ".css" (or is Google Fonts); the fragment makes that explicit.
        externalResources.push(/\.css$/i.test(a.href.split(/[?#]/)[0]) || a.href.includes("fonts.googleapis") ? a.href : `${a.href}#.css`);
      } else if (byPath.has(localPath(a.href))) {
        entryImports.push(`../${localPath(a.href)}`);
      }
      continue;
    }
    const a = attrs(m[1]);
    const isModule = (a.type ?? "").toLowerCase() === "module";
    if (a.src) {
      if (isRemote(a.src)) {
        if (isModule) return null; // remote ES modules: leave those to Vite
        externalResources.push(a.src);
      } else if (byPath.has(localPath(a.src))) {
        if (isModule) {
          if (moduleEntry) return null; // several module entries — unusual, let Vite handle it
          moduleEntry = localPath(a.src);
        } else {
          entryImports.push(`../${localPath(a.src)}`);
        }
      }
    } else if (m[2].trim()) {
      if (isModule) return null; // inline module code with imports — Vite territory
      if (!a.type || /javascript/i.test(a.type)) addInline("js", m[2]);
    }
  }
  if (!moduleEntry) return null;

  const body = /<body\b[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? '<div id="root"></div>';
  const bodyMarkup = body.replace(tagRe, "").trim();

  // Only what the code actually imports: the bundler downloads every listed
  // dependency, and a build-only package (a Vite plugin, say) can fail there.
  const declared = { ...(pkg?.devDependencies ?? {}), ...(pkg?.dependencies ?? {}) };
  const dependencies: Record<string, string> = { react: declared.react ?? "^18.2.0", "react-dom": declared["react-dom"] ?? "^18.2.0" };
  for (const name of importedPackages(sources)) dependencies[name] = declared[name] ?? "latest";

  const out: SandpackFiles = {};
  for (const [path, code] of byPath) {
    if (path !== "package.json" && path !== "index.html") out[`/${path}`] = { code };
  }
  Object.assign(out, generated);
  out[ENTRY_FILE] = { code: [...entryImports, `../${moduleEntry}`].map((p) => `import "${p}";`).join("\n") + "\n" };
  out["/public/index.html"] = { code: `<!DOCTYPE html>\n<html>\n<head><meta charset="UTF-8" /></head>\n<body>\n${bodyMarkup}\n</body>\n</html>\n` };
  out["/package.json"] = { code: JSON.stringify({ name: "preview", main: ENTRY_FILE, dependencies }, null, 2) };

  return { template: "react", files: out, engine: "fast", fastCapable: true, externalResources };
}
