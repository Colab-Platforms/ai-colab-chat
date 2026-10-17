import { layoutMindmap, type LayoutNode } from "./document.mindmapLayout.js";
import { getMindmapThemeTokens } from "./document.mindmapThemes.js";
import type { MindmapSpec } from "./document.types.js";

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Strips characters XML 1.0 forbids (control chars other than tab/LF/CR). A
// single stray one in model text would make the whole SVG unparseable.
const sanitize = (value: string): string =>
  // eslint-disable-next-line no-control-regex
  value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "");

const lineWidth = (depth: number) => (depth <= 1 ? 3 : depth === 2 ? 2 : 1.5);

/**
 * Renders a mind-map spec to a standalone SVG.
 *
 * Model text is escaped, never interpolated as markup, and the layout comes
 * from the same pure function the browser canvas uses, so the file matches what
 * the user sees in the panel.
 */
export const renderSpecToMindmap = async (
  spec: MindmapSpec,
  theme: string,
): Promise<Buffer> => {
  const tokens = getMindmapThemeTokens(theme);
  const layout = layoutMindmap(spec.root);
  const { x, y, width, height } = layout.bounds;

  const colorFor = (branch: number) =>
    branch < 0
      ? tokens.rootBg
      : tokens.branchColors[branch % tokens.branchColors.length];

  const edges = layout.edges
    .map(
      (edge) =>
        `<path d="${edge.d}" fill="none" stroke="${colorFor(edge.branch)}" stroke-width="${lineWidth(edge.depth)}" stroke-linecap="round"/>`,
    )
    .join("");

  const drawNode = (node: LayoutNode): string => {
    const top = node.y - node.h / 2;
    const textX =
      node.anchor === "middle"
        ? node.x + node.w / 2
        : node.anchor === "end"
          ? node.x + node.w - node.padX
          : node.x + node.padX;
    const isRoot = node.depth === 0;
    const fill = isRoot
      ? tokens.rootText
      : node.depth >= 3
        ? tokens.muted
        : tokens.text;
    const weight = node.depth <= 1 ? tokens.headingWeight : 400;

    const tspans = node.lines
      .map(
        (line, i) =>
          `<tspan x="${textX}" y="${top + node.padY + i * node.lineHeight + node.fontSize * 0.98}">${escapeXml(sanitize(line))}</tspan>`,
      )
      .join("");

    const text = `<text font-size="${node.fontSize}" font-weight="${weight}" fill="${fill}" text-anchor="${node.anchor}">${tspans}</text>`;

    if (isRoot) {
      return `<rect x="${node.x}" y="${top}" width="${node.w}" height="${node.h}" rx="14" fill="${tokens.rootBg}"/>${text}`;
    }
    const baseline = node.y + node.h / 2;
    return `${text}<line x1="${node.x}" y1="${baseline}" x2="${node.x + node.w}" y2="${baseline}" stroke="${colorFor(node.branch)}" stroke-width="${lineWidth(node.depth)}" stroke-linecap="round"/>`;
  };

  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${Math.ceil(width)}" height="${Math.ceil(height)}" font-family='${tokens.fontFamily.replace(/'/g, "")}'>`,
    `<title>${escapeXml(sanitize(spec.title))}</title>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${tokens.bg}"/>`,
    edges,
    layout.nodes.map(drawNode).join(""),
    `</svg>`,
  ].join("");

  return Buffer.from(svg, "utf-8");
};
