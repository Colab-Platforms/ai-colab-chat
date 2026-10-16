import type { CodeFileSnapshot } from "@/modules/code-workspace/code-workspace.types.js";
import type { DetectedConfig, VercelFramework } from "./vercel.types.js";

/**
 * Works out Vercel build settings from a project's files. Pure — no network,
 * no Prisma — so /detect and the deploy itself both run it, and
 * vercel.detect.check.ts can test it.
 *
 * Every command defaults to null ("let Vercel decide"), which is right almost
 * everywhere: Vercel runs `npm run build` when a build script exists and picks
 * the package manager from the lockfile. Detection is mostly here so the dialog
 * can show the user something real, and for the override case.
 *
 * Sibling heuristic: frontend/features/code-workspace/lib/sandpack.ts reads the
 * same package.json for the *preview*. It is deliberately not shared — that
 * code rewrites package.json for Nodebox (pinning vite@4.1.4), where a deploy
 * must keep the project's real versions. Keep the two in mind together.
 */

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  engines?: { node?: string };
  [key: string]: unknown;
}

function parsePackageJson(content: string | undefined): PackageJson | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === "object" ? (parsed as PackageJson) : null;
  } catch {
    return null;
  }
}

/** First match wins — meta-frameworks before the bundlers they're built on. */
const FRAMEWORK_RULES: { test: (has: (dep: string) => boolean, deps: string[]) => boolean; framework: VercelFramework; label: string; output: string | null }[] = [
  { test: (has) => has("next"), framework: "nextjs", label: "Next.js", output: null },
  { test: (has) => has("@remix-run/dev"), framework: "remix", label: "Remix", output: null },
  { test: (has) => has("@react-router/dev"), framework: "react-router", label: "React Router", output: null },
  { test: (has) => has("astro"), framework: "astro", label: "Astro", output: null },
  { test: (has) => has("nuxt") || has("nuxt3"), framework: "nuxtjs", label: "Nuxt", output: null },
  { test: (has) => has("@sveltejs/kit"), framework: "sveltekit", label: "SvelteKit", output: null },
  { test: (has) => has("gatsby"), framework: "gatsby", label: "Gatsby", output: null },
  { test: (has) => has("@angular/core"), framework: "angular", label: "Angular", output: null },
  { test: (_has, deps) => deps.some((d) => d.startsWith("@docusaurus/")), framework: "docusaurus-2", label: "Docusaurus", output: null },
  { test: (has) => has("react-scripts"), framework: "create-react-app", label: "Create React App", output: null },
  { test: (has) => has("vite"), framework: "vite", label: "Vite", output: "dist" },
  { test: (has) => has("vue"), framework: "vue", label: "Vue", output: "dist" },
  { test: (has) => has("svelte"), framework: "svelte", label: "Svelte", output: "dist" },
  { test: (has) => has("preact"), framework: "preact", label: "Preact", output: "dist" },
];

/** Built-ins every bundler provides — never worth an env row. */
const BUILTIN_ENV = new Set(["NODE_ENV", "MODE", "BASE_URL", "DEV", "PROD", "SSR", "PORT", "PUBLIC_URL"]);
const MAX_SUGGESTED_ENV = 20;

const SOURCE_EXT = /\.(m?[jt]sx?|vue|svelte|astro)$/;

function suggestEnvKeys(files: CodeFileSnapshot[]): string[] {
  const keys = new Set<string>();
  const patterns = [/import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g, /process\.env\.([A-Z_][A-Z0-9_]*)/g];
  for (const file of files) {
    if (!SOURCE_EXT.test(file.path)) continue;
    for (const pattern of patterns) {
      for (const match of file.content.matchAll(pattern)) {
        const key = match[1];
        if (!BUILTIN_ENV.has(key) && !key.startsWith("VERCEL")) keys.add(key);
      }
    }
  }
  return [...keys].sort().slice(0, MAX_SUGGESTED_ENV);
}

function nodeVersionFrom(engines: string | undefined): string | null {
  const major = engines?.match(/(\d+)/)?.[1];
  return major && ["22", "20", "18"].includes(major) ? `${major}.x` : null;
}

const ENTRY_FILES = ["package.json", "index.html", "vercel.json"];

/**
 * Where the app lives: the repo root, or — for a project pulled from a
 * monorepo-shaped repo — the single top-level folder holding the entry files.
 */
function findRoot(paths: Set<string>): string | null {
  if (ENTRY_FILES.some((f) => paths.has(f))) return null;
  const candidates = new Set<string>();
  for (const path of paths) {
    const parts = path.split("/");
    if (parts.length === 2 && ENTRY_FILES.includes(parts[1])) candidates.add(parts[0]);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}

export function detectVercelConfig(files: CodeFileSnapshot[], projectFramework: string): DetectedConfig {
  const blocked = (blockedReason: string): DetectedConfig => ({
    framework: null,
    buildCommand: null,
    installCommand: null,
    outputDirectory: null,
    rootDirectory: null,
    devCommand: null,
    nodeVersion: null,
    deployable: false,
    blockedReason,
    reason: blockedReason,
    suggestedEnvKeys: [],
  });

  if (files.length === 0) return blocked("This project has no files yet.");
  if (projectFramework === "python") {
    return blocked("Python projects can't be published to Vercel from here. Download the ZIP and deploy it yourself.");
  }

  const allPaths = new Set(files.map((f) => f.path));
  const rootDirectory = findRoot(allPaths);
  const prefix = rootDirectory ? `${rootDirectory}/` : "";
  const at = (path: string) => files.find((f) => f.path === prefix + path)?.content;
  const has_ = (path: string) => allPaths.has(prefix + path);

  const pkg = parsePackageJson(at("package.json"));
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const depNames = Object.keys(deps);
  const has = (dep: string) => Object.prototype.hasOwnProperty.call(deps, dep);

  const hasViteConfig = [...allPaths].some((p) => p.startsWith(prefix) && /^vite\.config\.[cm]?[jt]s$/.test(p.slice(prefix.length)));
  const rule = FRAMEWORK_RULES.find((r) => r.test((dep) => has(dep) || (dep === "vite" && hasViteConfig), depNames));
  const buildScript = pkg?.scripts?.build?.trim() || null;
  const indexHtml = has_("index.html") || has_("public/index.html");
  const vercelJson = has_("vercel.json");

  // Something Vercel can serve: a recognised web build, a plain HTML site, or a
  // project that brought its own vercel.json. This is what keeps an Express
  // server (framework "node", no index.html, no build) from a doomed build —
  // without blocking a Node project that does ship a vercel.json.
  const deployable = (!!buildScript && !!rule) || indexHtml || vercelJson;
  if (!deployable) {
    return blocked(
      "This looks like a server-side project (no index.html and no web build script). Publish it from GitHub with your own vercel.json, or download the ZIP.",
    );
  }

  const nodeVersion = nodeVersionFrom(pkg?.engines?.node);
  const suggestedEnvKeys = suggestEnvKeys(files);
  const where = rootDirectory ? ` in ${rootDirectory}/` : "";

  if (rule) {
    const dep = depNames.find((d) => rule.test((x) => x === d, [d]));
    const source = dep ? `package.json ("${dep}": "${deps[dep]}")` : "vite.config";
    return {
      framework: rule.framework,
      buildCommand: null,
      installCommand: null,
      outputDirectory: rule.output,
      rootDirectory,
      devCommand: null,
      nodeVersion,
      deployable: true,
      blockedReason: null,
      reason: `${rule.label} detected from ${source}${where}${rule.output ? `; build output ${rule.output}` : ""}.`,
      suggestedEnvKeys,
    };
  }

  // A plain HTML site (maybe with a package.json that has no web framework).
  // With no build step Vercel serves the folder as-is.
  return {
    framework: null,
    buildCommand: null,
    installCommand: null,
    outputDirectory: buildScript ? null : ".",
    rootDirectory,
    devCommand: null,
    nodeVersion,
    deployable: true,
    blockedReason: null,
    reason: buildScript
      ? `No framework detected${where}; Vercel will run the build script and serve its output.`
      : `Static site${where} — index.html is served as-is, no build step.`,
    suggestedEnvKeys,
  };
}

/**
 * A valid Vercel project name from a free-form title: lowercase, up to 100
 * chars of [a-z0-9._-], starting with a letter or digit, never "---".
 */
export function slugifyProjectName(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[-._]+$/, "")
    .slice(0, 100)
    .replace(/[-._]+$/, "");
  return slug || "my-project";
}

/** Same rules, as a check — mirrored by the Joi schema. */
export function isValidProjectName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,99}$/.test(name) && !name.includes("---");
}
