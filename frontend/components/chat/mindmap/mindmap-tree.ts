import type { MindmapNodeSpec, MindmapSpec } from "./mindmap-types";

/**
 * Pure, immutable edits on a mind-map tree. No React, no DOM.
 *
 * Every function either returns the new spec or an `error` string explaining
 * why the edit was refused. Refusals mirror the server's limits (see
 * `MAX_MINDMAP_*` in backend document.types.ts) so a save the user can see
 * on the canvas never bounces: the same rule is enforced here first, where it
 * can be explained, and again on the server, where it cannot be bypassed.
 */

export const MINDMAP_LIMITS = {
  /** A node at this depth (root = 0) cannot have children. */
  depth: 5,
  nodes: 250,
  children: 12,
  text: 120,
  note: 600,
} as const;

export type EditResult = { spec: MindmapSpec; id?: string } | { error: string };

export const isError = (result: EditResult): result is { error: string } =>
  "error" in result;

interface Located {
  node: MindmapNodeSpec;
  parent: MindmapNodeSpec | null;
  index: number;
  depth: number;
}

export const locate = (spec: MindmapSpec, id: string): Located | null => {
  const walk = (
    node: MindmapNodeSpec,
    parent: MindmapNodeSpec | null,
    index: number,
    depth: number,
  ): Located | null => {
    if (node.id === id) return { node, parent, index, depth };
    for (let i = 0; i < node.children.length; i += 1) {
      const found = walk(node.children[i], node, i, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(spec.root, null, 0, 0);
};

export const countNodes = (node: MindmapNodeSpec): number =>
  1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);

/** Levels below `node` (a leaf is 0). */
const heightOf = (node: MindmapNodeSpec): number =>
  node.children.length === 0
    ? 0
    : 1 + Math.max(...node.children.map(heightOf));

export const descendantIds = (node: MindmapNodeSpec): Set<string> => {
  const ids = new Set<string>();
  const walk = (n: MindmapNodeSpec) => {
    for (const child of n.children) {
      ids.add(child.id);
      walk(child);
    }
  };
  walk(node);
  return ids;
};

/** Rebuilds the tree with `fn` applied to the node `id`; other branches are shared, not copied. */
const mapNode = (
  node: MindmapNodeSpec,
  id: string,
  fn: (n: MindmapNodeSpec) => MindmapNodeSpec,
): MindmapNodeSpec => {
  if (node.id === id) return fn(node);
  let changed = false;
  const children = node.children.map((child) => {
    const next = mapNode(child, id, fn);
    if (next !== child) changed = true;
    return next;
  });
  return changed ? { ...node, children } : node;
};

const withRoot = (spec: MindmapSpec, root: MindmapNodeSpec): MindmapSpec => ({
  ...spec,
  root,
});

const makeId = (spec: MindmapSpec): string => {
  for (;;) {
    const id = `n_${Math.random().toString(36).slice(2, 8)}`;
    if (!locate(spec, id)) return id;
  }
};

const cleanText = (value: string) =>
  value.replace(/\s+/g, " ").trim().slice(0, MINDMAP_LIMITS.text);

export const NEW_NODE_TEXT = "New idea";

export const renameNode = (spec: MindmapSpec, id: string, raw: string): EditResult => {
  const text = cleanText(raw);
  if (!text) return { error: "A node needs some text." };
  const found = locate(spec, id);
  if (!found) return { error: "That node no longer exists." };
  if (found.node.text === text) return { spec, id };
  return { spec: withRoot(spec, mapNode(spec.root, id, (n) => ({ ...n, text }))), id };
};

export const setNote = (spec: MindmapSpec, id: string, raw: string): EditResult => {
  const note = raw.replace(/\s+/g, " ").trim().slice(0, MINDMAP_LIMITS.note);
  const found = locate(spec, id);
  if (!found) return { error: "That node no longer exists." };
  if ((found.node.note ?? "") === note) return { spec, id };
  return {
    spec: withRoot(
      spec,
      mapNode(spec.root, id, (n) => {
        const next: MindmapNodeSpec = { ...n };
        if (note) next.note = note;
        else delete next.note;
        return next;
      }),
    ),
    id,
  };
};

export const addChild = (spec: MindmapSpec, parentId: string): EditResult => {
  const parent = locate(spec, parentId);
  if (!parent) return { error: "That node no longer exists." };
  if (parent.depth >= MINDMAP_LIMITS.depth) {
    return { error: `Branches can go at most ${MINDMAP_LIMITS.depth} levels deep.` };
  }
  if (parent.node.children.length >= MINDMAP_LIMITS.children) {
    return { error: `A node can have at most ${MINDMAP_LIMITS.children} children.` };
  }
  if (countNodes(spec.root) >= MINDMAP_LIMITS.nodes) {
    return { error: `A mind map can have at most ${MINDMAP_LIMITS.nodes} nodes.` };
  }
  const id = makeId(spec);
  const child: MindmapNodeSpec = { id, text: NEW_NODE_TEXT, children: [] };
  return {
    spec: withRoot(
      spec,
      mapNode(spec.root, parentId, (n) => ({ ...n, children: [...n.children, child] })),
    ),
    id,
  };
};

export const addSibling = (spec: MindmapSpec, id: string): EditResult => {
  const found = locate(spec, id);
  if (!found) return { error: "That node no longer exists." };
  // The central node has no siblings; a "sibling" of it is a new branch.
  if (!found.parent) return addChild(spec, id);

  const parent = found.parent;
  if (parent.children.length >= MINDMAP_LIMITS.children) {
    return { error: `A node can have at most ${MINDMAP_LIMITS.children} children.` };
  }
  if (countNodes(spec.root) >= MINDMAP_LIMITS.nodes) {
    return { error: `A mind map can have at most ${MINDMAP_LIMITS.nodes} nodes.` };
  }
  const newId = makeId(spec);
  const sibling: MindmapNodeSpec = { id: newId, text: NEW_NODE_TEXT, children: [] };
  return {
    spec: withRoot(
      spec,
      mapNode(spec.root, parent.id, (n) => {
        const children = [...n.children];
        children.splice(found.index + 1, 0, sibling);
        return { ...n, children };
      }),
    ),
    id: newId,
  };
};

export const deleteNode = (spec: MindmapSpec, id: string): EditResult => {
  const found = locate(spec, id);
  if (!found) return { error: "That node no longer exists." };
  if (!found.parent) return { error: "The central node can't be deleted." };
  if (found.parent.id === spec.root.id && spec.root.children.length <= 1) {
    return { error: "A mind map needs at least one branch." };
  }
  const parentId = found.parent.id;
  return {
    spec: withRoot(
      spec,
      mapNode(spec.root, parentId, (n) => ({
        ...n,
        children: n.children.filter((c) => c.id !== id),
      })),
    ),
    // The parent is the natural thing to select next.
    id: parentId,
  };
};

/** Moves `id` to the end of `newParentId`'s children. */
export const moveNode = (
  spec: MindmapSpec,
  id: string,
  newParentId: string,
): EditResult => {
  const moving = locate(spec, id);
  const target = locate(spec, newParentId);
  if (!moving || !target) return { error: "That node no longer exists." };
  if (!moving.parent) return { error: "The central node can't be moved." };
  if (id === newParentId || descendantIds(moving.node).has(newParentId)) {
    return { error: "A node can't be moved into itself." };
  }
  if (moving.parent.id === newParentId) return { spec, id };

  if (target.depth + 1 + heightOf(moving.node) > MINDMAP_LIMITS.depth) {
    return { error: `Branches can go at most ${MINDMAP_LIMITS.depth} levels deep.` };
  }
  if (target.node.children.length >= MINDMAP_LIMITS.children) {
    return { error: `A node can have at most ${MINDMAP_LIMITS.children} children.` };
  }
  // Moving the last top-level branch away would leave the root empty.
  if (moving.parent.id === spec.root.id && spec.root.children.length <= 1) {
    return { error: "A mind map needs at least one branch." };
  }

  const detached = mapNode(spec.root, moving.parent.id, (n) => ({
    ...n,
    children: n.children.filter((c) => c.id !== id),
  }));
  const attached = mapNode(detached, newParentId, (n) => ({
    ...n,
    children: [...n.children, moving.node],
  }));
  return { spec: withRoot(spec, attached), id };
};

export const moveSibling = (
  spec: MindmapSpec,
  id: string,
  direction: -1 | 1,
): EditResult => {
  const found = locate(spec, id);
  if (!found) return { error: "That node no longer exists." };
  if (!found.parent) return { error: "The central node can't be moved." };
  const to = found.index + direction;
  if (to < 0 || to >= found.parent.children.length) return { spec, id };

  return {
    spec: withRoot(
      spec,
      mapNode(spec.root, found.parent.id, (n) => {
        const children = [...n.children];
        [children[found.index], children[to]] = [children[to], children[found.index]];
        return { ...n, children };
      }),
    ),
    id,
  };
};

/** Whether the node can move up (-1) or down (+1) among its siblings. */
export const canMoveSibling = (
  spec: MindmapSpec,
  id: string,
  direction: -1 | 1,
): boolean => {
  const found = locate(spec, id);
  if (!found?.parent) return false;
  const to = found.index + direction;
  return to >= 0 && to < found.parent.children.length;
};
