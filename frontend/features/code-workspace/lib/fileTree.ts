export interface TreeNode {
  name: string;
  /** Full path; for folders, the folder path without a trailing slash. */
  path: string;
  kind: "file" | "folder";
  children: TreeNode[];
}

/** Flat paths → nested tree, folders first, then alphabetical. */
export function buildFileTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", kind: "folder", children: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");
      let child = node.children.find((c) => c.name === part && c.kind === (isFile ? "file" : "folder"));
      if (!child) {
        child = { name: part, path: childPath, kind: isFile ? "file" : "folder", children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1));
    nodes.forEach((n) => sort(n.children));
  };
  sort(root.children);
  return root.children;
}

/** Every ancestor folder of `path` ("src/components/Hero.jsx" → ["src", "src/components"]). */
export function ancestorFolders(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}
