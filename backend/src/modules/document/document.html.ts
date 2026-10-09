import { getThemeCss } from "./document.theme.js";
import { parseFormattedText, parseInlineSegments } from "./document.textFormatting.js";
import type {
  DocumentBlock,
  DocumentSpec,
  DocumentTheme,
} from "./document.types.js";

/**
 * Turns a validated DocumentSpec into a self-contained HTML string.
 *
 * Every value that originates from the model goes through `escapeHtml`. That
 * is the whole reason the spec carries semantic blocks rather than markup:
 * there is no code path where model output is interpreted as HTML.
 */

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Renders `**bold**` / `` `code` `` within a single line — no bullets, no line breaks. */
const renderInline = (value: unknown): string =>
  parseInlineSegments(value)
    .map((segment) => {
      const escaped = escapeHtml(segment.text);
      if (segment.bold) return `<strong>${escaped}</strong>`;
      if (segment.code) return `<code class="inline-code">${escaped}</code>`;
      return escaped;
    })
    .join("");

/**
 * Full text-field renderer: inline bold/code plus per-line bullet detection,
 * for the multi-line fields that previously went through `escapeMultiline`.
 */
const renderFormatted = (value: unknown): string =>
  parseFormattedText(value)
    .map((line) => {
      const inner = line.segments
        .map((segment) => {
          const escaped = escapeHtml(segment.text);
          if (segment.bold) return `<strong>${escaped}</strong>`;
          if (segment.code) return `<code class="inline-code">${escaped}</code>`;
          return escaped;
        })
        .join("");
      return line.bullet ? `•&nbsp;${inner}` : inner;
    })
    .join("<br />");

/**
 * Image hosts we are willing to have Chromium fetch. Anything else — including
 * anything resolving to link-local or private ranges — is dropped rather than
 * rendered. The renderer also blocks non-allowlisted requests at the network
 * layer; this is the first of the two gates.
 */
const ALLOWED_IMAGE_HOSTS = (
  process.env.PDF_ALLOWED_IMAGE_HOSTS ??
  "res.cloudinary.com,images.cloudinary.com"
)
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

export const isAllowedImageUrl = (rawUrl: string): boolean => {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_IMAGE_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
};

const renderBlock = (block: DocumentBlock): string => {
  switch (block.type) {
    case "heading": {
      const level = block.level === 1 ? 1 : block.level === 2 ? 2 : 3;
      return `<h${level}>${renderInline(block.text)}</h${level}>`;
    }

    case "paragraph":
      return `<p>${renderFormatted(block.text)}</p>`;

    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items
        .map((item) => `<li>${renderFormatted(item)}</li>`)
        .join("");
      return `<${tag}>${items}</${tag}>`;
    }

    case "table": {
      const head = block.columns
        .map((column) => `<th>${renderInline(column)}</th>`)
        .join("");
      const body = block.rows
        .map((row) => {
          // Pad or trim so a ragged row from the model cannot break the grid.
          const cells = block.columns.map(
            (_column, index) => `<td>${renderFormatted(row?.[index] ?? "")}</td>`,
          );
          return `<tr>${cells.join("")}</tr>`;
        })
        .join("");
      const caption = block.caption
        ? `<div class="table-caption">${renderInline(block.caption)}</div>`
        : "";
      return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${caption}`;
    }

    case "callout": {
      const title = block.title
        ? `<div class="callout__title">${renderInline(block.title)}</div>`
        : "";
      return `<div class="callout callout--${escapeHtml(block.variant)}">${title}<p>${renderFormatted(block.text)}</p></div>`;
    }

    case "keyValue": {
      const rows = block.items
        .map(
          (item) =>
            `<tr><td class="kv__label">${renderInline(item.label)}</td><td>${renderFormatted(item.value)}</td></tr>`,
        )
        .join("");
      return `<table class="kv"><tbody>${rows}</tbody></table>`;
    }

    case "quote": {
      const attribution = block.attribution
        ? `<span class="attribution">— ${renderInline(block.attribution)}</span>`
        : "";
      return `<blockquote>${renderFormatted(block.text)}${attribution}</blockquote>`;
    }

    case "code":
      return `<pre><code>${escapeHtml(block.code)}</code></pre>`;

    case "image": {
      if (!isAllowedImageUrl(block.url)) return "";
      const caption = block.caption
        ? `<figcaption>${renderInline(block.caption)}</figcaption>`
        : "";
      const widthClass = block.width === "half" ? " width--half" : "";
      return `<figure class="figure${widthClass}"><img src="${escapeHtml(block.url)}" />${caption}</figure>`;
    }

    case "divider":
      return "<hr />";

    case "pageBreak":
      return `<div class="page-break"></div>`;

    default:
      return "";
  }
};

const renderCover = (spec: DocumentSpec): string => {
  const subtitle = spec.subtitle
    ? `<div class="cover__subtitle">${escapeHtml(spec.subtitle)}</div>`
    : "";
  const author = spec.author
    ? `<div class="cover__meta">${escapeHtml(spec.author)}</div>`
    : "";
  const date = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return `
    <section class="cover">
      <h1 class="cover__title">${escapeHtml(spec.title)}</h1>
      ${subtitle}
      <div class="cover__rule"></div>
      ${author}
      <div class="cover__meta">${escapeHtml(date)}</div>
    </section>`;
};

const renderInlineHeader = (spec: DocumentSpec): string => {
  const subtitle = spec.subtitle
    ? `<div class="doc-subtitle">${escapeHtml(spec.subtitle)}</div>`
    : "";
  return `
    <header class="doc-header">
      <h1 class="doc-title">${escapeHtml(spec.title)}</h1>
      ${subtitle}
    </header>`;
};

export const renderDocumentHtml = (
  spec: DocumentSpec,
  theme: DocumentTheme,
): string => {
  const heading = spec.coverPage ? renderCover(spec) : renderInlineHeader(spec);
  const body = spec.blocks.map(renderBlock).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(spec.title)}</title>
    <style>${getThemeCss(theme)}</style>
  </head>
  <body>
    ${heading}
    <main>${body}</main>
  </body>
</html>`;
};
