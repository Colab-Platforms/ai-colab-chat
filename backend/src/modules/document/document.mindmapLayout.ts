import { hierarchy, tree } from "d3-hierarchy";

/**
 * Pure mind-map layout: a spec tree in, absolute positions and connector paths
 * out. No DOM, no colours, no theme.
 *
 * KEEP IN SYNC with frontend/components/chat/mindmap/mindmap-layout.ts. The
 * server uses this to bake the downloadable SVG and the browser uses it to draw
 * the interactive canvas; the two files are intentionally byte-for-byte the same
 * apart from this header, because there is no shared package between the
 * frontend and backend. A layout that differed would make the download not match
 * what the user saw.
 *
 * Shape: the central node sits at the origin, its branches are split between the
 * right and left so the map stays roughly balanced, and each branch is laid out
 * as an ordinary tidy tree growing away from the centre. Every node is "text on
 * an underline" (the underline's colour is the branch colour), and connectors
 * run from the end of a parent's underline to the start of a child's.
 */

export interface LayoutInputNode {
  id: string;
  text: string;
  note?: string;
  children?: LayoutInputNode[];
}

export type MindmapSide = "root" | "left" | "right";

export interface LayoutNode {
  id: string;
  text: string;
  note?: string;
  lines: string[];
  depth: number;
  /** Index of the top-level branch this node belongs to; -1 for the root. */
  branch: number;
  side: MindmapSide;
  /** Left edge, in layout space (root centre is x = 0). */
  x: number;
  /** Vertical centre (root centre is y = 0). */
  y: number;
  w: number;
  h: number;
  fontSize: number;
  lineHeight: number;
  padX: number;
  padY: number;
  anchor: "start" | "end" | "middle";
  parentId: string | null;
  /** Children in the SPEC, whether or not they are currently drawn. */
  childCount: number;
  collapsed: boolean;
}

export interface LayoutEdge {
  id: string;
  from: string;
  to: string;
  d: string;
  branch: number;
  depth: number;
}

export interface MindmapLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  bounds: { x: number; y: number; width: number; height: number };
}

const ROOT_GAP = 44;
const COL_GAP = 52;
const SIBLING_GAP = 9;
const COUSIN_GAP = 20;
const MARGIN = 48;

const fontSizeFor = (depth: number) => (depth === 0 ? 20 : depth === 1 ? 15 : 13);
const wrapAt = (depth: number) => (depth === 0 ? 22 : depth === 1 ? 26 : 32);

/** Rough glyph advance, as a fraction of the font size. Good enough to avoid clipping. */
const glyphUnits = (ch: string): number => {
  const code = ch.charCodeAt(0);
  if (code > 0x2e80) return 1;
  if (/[A-Z0-9MW@%#&]/.test(ch)) return 0.64;
  if (/[ilj.,;:'!|ft() ]/.test(ch)) return 0.34;
  return 0.54;
};

const measureLine = (line: string, fontSize: number, bold: boolean) =>
  Array.from(line).reduce((sum, ch) => sum + glyphUnits(ch), 0) *
  fontSize *
  (bold ? 1.08 : 1);

const wrapText = (text: string, maxChars: number): string[] => {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
};

interface Prepared {
  src: LayoutInputNode;
  depth: number;
  branch: number;
  lines: string[];
  w: number;
  h: number;
  fontSize: number;
  lineHeight: number;
  padX: number;
  padY: number;
  collapsed: boolean;
  children: Prepared[];
  /** Set while laying out. */
  cy: number;
  parent: Prepared | null;
}

const prepare = (
  src: LayoutInputNode,
  depth: number,
  branch: number,
  collapsed: ReadonlySet<string>,
  parent: Prepared | null,
): Prepared => {
  const fontSize = fontSizeFor(depth);
  const lineHeight = Math.round(fontSize * 1.28);
  const lines = wrapText(src.text, wrapAt(depth));
  const padX = depth === 0 ? 20 : 6;
  const padY = depth === 0 ? 12 : 4;
  const bold = depth <= 1;
  const textW = Math.max(...lines.map((l) => measureLine(l, fontSize, bold)));
  const isCollapsed = collapsed.has(src.id) && (src.children?.length ?? 0) > 0;

  const node: Prepared = {
    src,
    depth,
    branch,
    lines,
    w: Math.ceil(textW + padX * 2),
    h: lines.length * lineHeight + padY * 2,
    fontSize,
    lineHeight,
    padX,
    padY,
    collapsed: isCollapsed,
    children: [],
    cy: 0,
    parent,
  };

  if (!isCollapsed) {
    node.children = (src.children ?? []).map((child, index) =>
      prepare(child, depth + 1, depth === 0 ? index : branch, collapsed, node),
    );
  }
  return node;
};

const leafCount = (node: Prepared): number =>
  node.children.length === 0
    ? 1
    : node.children.reduce((sum, child) => sum + leafCount(child), 0);

export const layoutMindmap = (
  root: LayoutInputNode,
  collapsed: ReadonlySet<string> = new Set(),
): MindmapLayout => {
  const rootNode = prepare(root, 0, -1, collapsed, null);

  const total = rootNode.children.reduce((sum, c) => sum + leafCount(c), 0);
  const rightGroup: Prepared[] = [];
  const leftGroup: Prepared[] = [];
  let running = 0;
  for (const branch of rootNode.children) {
    (running < total / 2 ? rightGroup : leftGroup).push(branch);
    running += leafCount(branch);
  }

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const positioned = new Map<string, LayoutNode>();

  const emit = (p: Prepared, side: MindmapSide, x: number) => {
    const node: LayoutNode = {
      id: p.src.id,
      text: p.src.text,
      note: p.src.note,
      lines: p.lines,
      depth: p.depth,
      branch: p.branch,
      side,
      x,
      y: p.cy,
      w: p.w,
      h: p.h,
      fontSize: p.fontSize,
      lineHeight: p.lineHeight,
      padX: p.padX,
      padY: p.padY,
      anchor: side === "root" ? "middle" : side === "left" ? "end" : "start",
      parentId: p.parent ? p.parent.src.id : null,
      childCount: p.src.children?.length ?? 0,
      collapsed: p.collapsed,
    };
    nodes.push(node);
    positioned.set(node.id, node);
  };

  emit(rootNode, "root", -rootNode.w / 2);

  const layoutSide = (group: Prepared[], side: "left" | "right") => {
    if (group.length === 0) return;

    // d3 needs a single root, so the branches hang off an invisible one that
    // is later discarded; its own position is the vertical centre of the side.
    const virtual: Prepared = {
      ...rootNode,
      children: group,
      w: 0,
      h: 0,
      parent: null,
    };
    const laid = tree<Prepared>()
      .nodeSize([1, 1])
      .separation((a, b) =>
        (a.data.h + b.data.h) / 2 +
        (a.parent === b.parent ? SIBLING_GAP : COUSIN_GAP),
      )(hierarchy<Prepared>(virtual, (d) => d.children));

    const centre = laid.x ?? 0;
    const maxWidthAtDepth = new Map<number, number>();
    laid.each((n) => {
      if (n === laid) return;
      n.data.cy = (n.x ?? 0) - centre;
      maxWidthAtDepth.set(
        n.data.depth,
        Math.max(maxWidthAtDepth.get(n.data.depth) ?? 0, n.data.w),
      );
    });

    // Column starts, measured outward from the centre line.
    const columnStart = new Map<number, number>();
    let cursor = rootNode.w / 2 + ROOT_GAP;
    for (let depth = 1; maxWidthAtDepth.has(depth); depth += 1) {
      columnStart.set(depth, cursor);
      cursor += (maxWidthAtDepth.get(depth) ?? 0) + COL_GAP;
    }

    laid.each((n) => {
      if (n === laid) return;
      const p = n.data;
      const start = columnStart.get(p.depth) ?? 0;
      emit(p, side, side === "right" ? start : -start - p.w);
    });
  };

  layoutSide(rightGroup, "right");
  layoutSide(leftGroup, "left");

  // Connectors, drawn from the parent's outer end to the child's inner end.
  const baseline = (n: LayoutNode) => n.y + n.h / 2;
  for (const node of nodes) {
    if (!node.parentId) continue;
    const parent = positioned.get(node.parentId);
    if (!parent) continue;

    const rightSide = node.side === "right";
    // The root's x is its left edge, so the same rule serves it too.
    const x1 = rightSide ? parent.x + parent.w : parent.x;
    const y1 = parent.side === "root" ? parent.y : baseline(parent);
    const x2 = rightSide ? node.x : node.x + node.w;
    const y2 = baseline(node);
    const mid = (x1 + x2) / 2;

    edges.push({
      id: `${parent.id}>${node.id}`,
      from: parent.id,
      to: node.id,
      d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
      branch: node.branch,
      depth: node.depth,
    });
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x + n.w);
    minY = Math.min(minY, n.y - n.h / 2);
    maxY = Math.max(maxY, n.y + n.h / 2);
  }

  return {
    nodes,
    edges,
    bounds: {
      x: minX - MARGIN,
      y: minY - MARGIN,
      width: maxX - minX + MARGIN * 2,
      height: maxY - minY + MARGIN * 2,
    },
  };
};
