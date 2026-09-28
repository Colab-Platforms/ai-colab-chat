// Mirrors languageFromPath in backend/src/modules/code-workspace/code-workspace.parser.ts
// (used for files the user creates in the editor before the server answers).

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

export function languageFromPath(path: string): string {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "dockerfile";
  if (name.startsWith(".env")) return "ini";
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return LANGUAGE_BY_EXTENSION[ext] ?? "plaintext";
}
