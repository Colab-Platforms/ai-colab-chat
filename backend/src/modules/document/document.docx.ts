import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  LevelFormat,
  PageBreak,
  PageNumber,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  convertInchesToTwip,
  type IParagraphOptions,
} from "docx";
import { dlog } from "./document.logger.js";
import { isAllowedImageUrl } from "./document.html.js";
import { getCalloutColors, getThemeTokens, type ThemeTokens } from "./document.theme.js";
import { parseFormattedText, parseInlineSegments } from "./document.textFormatting.js";
import type {
  DocumentBlock,
  DocumentSpec,
  DocumentTheme,
} from "./document.types.js";

/**
 * Renders a validated spec to a .docx buffer.
 *
 * Shares the spec and the theme tokens with the PDF renderer but nothing else:
 * Word has no CSS, so every token is re-expressed in OOXML terms. The mapping
 * is 1:1 by block type, which is the reason DOCX needed no change to the spec
 * the model produces.
 *
 * Unlike the PDF path there is no browser here, so model-supplied text is
 * never parsed as markup — it is written as literal runs. Image URLs remain
 * gated by the same allowlist, since this renderer *does* make network
 * requests to embed them.
 */

/* ------------------------------------------------------------------ *
 * Units
 * ------------------------------------------------------------------ */

/** Word sizes fonts in half-points. */
const hp = (pt: number): number => Math.round(pt * 2);
/** Word measures spacing in twips (1/20 pt). */
const tw = (pt: number): number => Math.round(pt * 20);
/** OOXML colours are bare hex — a leading "#" is written through literally. */
const hex = (color: string): string => color.replace(/^#/, "").toUpperCase();

const PAGE_MARGIN_INCHES = 1;
/** A4 width less both margins, at 96dpi, with a little slack. */
const MAX_IMAGE_WIDTH_PX = 560;
const IMAGE_FETCH_TIMEOUT_MS = Number(
  process.env.DOCX_IMAGE_TIMEOUT_MS ?? 10_000,
);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

type ImageKind = "png" | "jpg" | "gif";

/**
 * Reads intrinsic pixel dimensions straight from the file header.
 *
 * Word needs an explicit width AND height on every image — there is no
 * "auto". Guessing an aspect ratio would visibly distort the picture, so an
 * image whose real size cannot be determined is dropped instead, matching how
 * the PDF renderer drops images it is not allowed to fetch.
 */
const readImageSize = (
  buffer: Buffer,
): { kind: ImageKind; width: number; height: number } | null => {
  // PNG: 8-byte signature, then an IHDR chunk whose first two fields are the
  // dimensions as big-endian uint32.
  if (
    buffer.length > 24 &&
    buffer[0] === 0x89 &&
    buffer.toString("ascii", 1, 4) === "PNG"
  ) {
    return {
      kind: "png",
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  // GIF: dimensions are little-endian uint16 immediately after the header.
  if (buffer.length > 10 && buffer.toString("ascii", 0, 3) === "GIF") {
    return {
      kind: "gif",
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    };
  }

  // JPEG: no fixed offset — walk the segment chain to the start-of-frame
  // marker, which is the only place the dimensions appear.
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buffer[offset + 1];
      // SOF0..SOF15, excluding the DHT/JPG/DAC markers interleaved with them.
      const isStartOfFrame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc;

      if (isStartOfFrame) {
        return {
          kind: "jpg",
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }

  return null;
};

interface EmbeddableImage {
  data: Buffer;
  kind: ImageKind;
  width: number;
  height: number;
}

const fetchImage = async (url: string): Promise<EmbeddableImage | null> => {
  if (!isAllowedImageUrl(url)) {
    dlog("docx", `image dropped — not on the allowlist: ${url.slice(0, 120)}`);
    return null;
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      dlog("docx", `image dropped — HTTP ${response.status}: ${url.slice(0, 120)}`);
      return null;
    }

    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > MAX_IMAGE_BYTES) {
      dlog("docx", `image dropped — ${data.length} bytes exceeds the cap`);
      return null;
    }

    const size = readImageSize(data);
    if (!size || !size.width || !size.height) {
      dlog("docx", `image dropped — unreadable dimensions: ${url.slice(0, 120)}`);
      return null;
    }

    return { data, kind: size.kind, width: size.width, height: size.height };
  } catch (error: any) {
    dlog("docx", `image dropped — fetch failed: ${error?.message ?? error}`);
    return null;
  }
};

/**
 * Pre-resolves every image in the spec.
 *
 * Block rendering is synchronous, and making it async purely for images would
 * mean awaiting inside every branch. Fetching up front also lets the images
 * download in parallel rather than serially down the document.
 */
const prefetchImages = async (
  spec: DocumentSpec,
): Promise<Map<string, EmbeddableImage>> => {
  const urls = Array.from(
    new Set(
      spec.blocks
        .filter((block): block is Extract<DocumentBlock, { type: "image" }> =>
          block.type === "image",
        )
        .map((block) => block.url),
    ),
  );

  const resolved = new Map<string, EmbeddableImage>();
  await Promise.all(
    urls.map(async (url) => {
      const image = await fetchImage(url);
      if (image) resolved.set(url, image);
    }),
  );

  if (urls.length) {
    dlog("docx", `images: ${resolved.size}/${urls.length} embedded`);
  }
  return resolved;
};

/* ------------------------------------------------------------------ *
 * Blocks
 * ------------------------------------------------------------------ */

const ORDERED_LIST_REFERENCE = "document-ordered-list";

const multilineRuns = (
  t: ThemeTokens,
  value: string,
  extra: object = {},
): TextRun[] => {
  const runs: TextRun[] = [];
  parseFormattedText(value).forEach((line, lineIndex) => {
    const segments = line.bullet
      ? [{ text: "• ", bold: false, code: false }, ...line.segments]
      : line.segments;
    segments.forEach((segment, segmentIndex) => {
      runs.push(
        new TextRun({
          text: segment.text,
          font: segment.code ? t.monoFontName : t.bodyFontName,
          size: hp(t.baseFontPt),
          color: hex(t.text),
          bold: segment.bold || undefined,
          ...(segment.code
            ? { shading: { fill: hex(t.accentSoft) } }
            : {}),
          ...(lineIndex > 0 && segmentIndex === 0 ? { break: 1 } : {}),
          ...extra,
        }),
      );
    });
  });
  return runs;
};


const inlineRuns = (
  t: ThemeTokens,
  value: string,
  extra: object = {},
): TextRun[] =>
  parseInlineSegments(value).map(
    (segment) =>
      new TextRun({
        text: segment.text,
        font: segment.code ? t.monoFontName : t.bodyFontName,
        size: hp(t.baseFontPt),
        color: hex(t.text),
        bold: segment.bold || undefined,
        ...(segment.code ? { shading: { fill: hex(t.accentSoft) } } : {}),
        ...extra,
      }),
  );

const headingParagraph = (t: ThemeTokens, level: 1 | 2 | 3, text: string) => {
  const sizePt = level === 1 ? 20 : level === 2 ? 15 : 12.5;
  return new Paragraph({
    // Word's own "keep with next" — the CSS renderer uses page-break-after.
    keepNext: true,
    spacing: { before: tw(level === 1 ? 18 : 14), after: tw(6) },
    children: parseInlineSegments(text).map(
      (segment) =>
        new TextRun({
          text: segment.text,
          bold: segment.bold || t.headingWeight >= 600,
          font: segment.code ? t.monoFontName : t.headingFontName,
          size: hp(sizePt),
          // h3 drops to body colour, matching the CSS theme.
          color: hex(level === 3 ? t.text : t.accent),
          ...(segment.code ? { shading: { fill: hex(t.accentSoft) } } : {}),
        }),
    ),
  });
};

const tableCell = (
  children: Paragraph[],
  options: { fill?: string; borderColor: string; width?: number },
) =>
  new TableCell({
    children,
    ...(options.fill ? { shading: { fill: hex(options.fill) } } : {}),
    ...(options.width
      ? { width: { size: options.width, type: WidthType.PERCENTAGE } }
      : {}),
    margins: { top: tw(4), bottom: tw(4), left: tw(6), right: tw(6) },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: hex(options.borderColor) },
      bottom: {
        style: BorderStyle.SINGLE,
        size: 4,
        color: hex(options.borderColor),
      },
      left: { style: BorderStyle.SINGLE, size: 4, color: hex(options.borderColor) },
      right: {
        style: BorderStyle.SINGLE,
        size: 4,
        color: hex(options.borderColor),
      },
    },
  });

const renderBlock = (
  block: DocumentBlock,
  t: ThemeTokens,
  images: Map<string, EmbeddableImage>,
  /** Restarts numbering per ordered list instead of continuing across them. */
  nextListInstance: () => number,
): (Paragraph | Table)[] => {
  switch (block.type) {
    case "heading":
      return [headingParagraph(t, block.level, block.text)];

    case "paragraph":
      return [
        new Paragraph({
          spacing: { after: tw(6) },
          children: multilineRuns(t, block.text),
        }),
      ];

    case "list": {
      const instance = block.ordered ? nextListInstance() : undefined;
      return block.items.map((item) => {
        const listOptions: IParagraphOptions = block.ordered
          ? {
              numbering: {
                reference: ORDERED_LIST_REFERENCE,
                level: 0,
                instance,
              },
            }
          : { bullet: { level: 0 } };

        return new Paragraph({
          ...listOptions,
          spacing: { after: tw(2) },
          children: multilineRuns(t, item ?? ""),
        });
      });
    }

    case "table": {
      const header = new TableRow({
        tableHeader: true,
        children: block.columns.map((column) =>
          tableCell(
            [
              new Paragraph({
                children: inlineRuns(t, String(column ?? ""), {
                  bold: true,
                  size: hp(9.5),
                  color: hex(t.tableHeaderText),
                }),
              }),
            ],
            { fill: t.tableHeaderBg, borderColor: t.border },
          ),
        ),
      });

      const rows = block.rows.map((row, rowIndex) => {
        // Pad or trim so a ragged row from the model cannot break the grid —
        // Word is stricter than HTML here and would produce a corrupt table.
        const cells = block.columns.map((_column, columnIndex) =>
          tableCell(
            [
              new Paragraph({
                children: multilineRuns(t, row?.[columnIndex] ?? "", {
                  size: hp(9.5),
                }),
              }),
            ],
            {
              fill: rowIndex % 2 === 1 ? t.accentSoft : undefined,
              borderColor: t.border,
            },
          ),
        );
        return new TableRow({ children: cells });
      });

      const table = new Table({
        rows: [header, ...rows],
        width: { size: 100, type: WidthType.PERCENTAGE },
      });

      if (!block.caption) return [table];
      return [
        table,
        new Paragraph({
          spacing: { before: tw(3), after: tw(8) },
          children: inlineRuns(t, block.caption, {
            italics: true,
            size: hp(9),
            color: hex(t.muted),
          }),
        }),
      ];
    }

    case "callout": {
      const colors = getCalloutColors(block.variant);
      const children: Paragraph[] = [];

      if (block.title) {
        children.push(
          new Paragraph({
            spacing: { after: tw(2) },
            children: inlineRuns(t, block.title, {
              bold: true,
              color: hex(colors.border),
            }),
          }),
        );
      }
      children.push(
        new Paragraph({ children: multilineRuns(t, block.text) }),
      );

      // Word has no "box" primitive, so a callout is a single-cell table with
      // only the accent edge drawn.
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children,
                  shading: { fill: hex(colors.bg) },
                  margins: {
                    top: tw(7),
                    bottom: tw(7),
                    left: tw(9),
                    right: tw(9),
                  },
                  borders: {
                    left: {
                      style: BorderStyle.SINGLE,
                      size: 18,
                      color: hex(colors.border),
                    },
                    top: { style: BorderStyle.NONE, size: 0, color: "auto" },
                    bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
                    right: { style: BorderStyle.NONE, size: 0, color: "auto" },
                  },
                }),
              ],
            }),
          ],
        }),
      ];
    }

    case "keyValue":
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "auto" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "auto" },
            left: { style: BorderStyle.NONE, size: 0, color: "auto" },
            right: { style: BorderStyle.NONE, size: 0, color: "auto" },
            insideHorizontal: {
              style: BorderStyle.NONE,
              size: 0,
              color: "auto",
            },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "auto" },
          },
          rows: block.items.map(
            (item) =>
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 32, type: WidthType.PERCENTAGE },
                    margins: { top: tw(3), bottom: tw(3), right: tw(10) },
                    children: [
                      new Paragraph({
                        children: inlineRuns(t, item.label, {
                          bold: true,
                          color: hex(t.muted),
                        }),
                      }),
                    ],
                  }),
                  new TableCell({
                    margins: { top: tw(3), bottom: tw(3) },
                    children: [
                      new Paragraph({
                        children: multilineRuns(t, item.value),
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
      ];

    case "quote": {
      const runs = multilineRuns(t, block.text, {
        italics: true,
        color: hex(t.muted),
      });
      if (block.attribution) {
        runs.push(
          ...parseInlineSegments(`— ${block.attribution}`).map(
            (segment, index) =>
              new TextRun({
                text: segment.text,
                font: segment.code ? t.monoFontName : t.bodyFontName,
                size: hp(9.5),
                color: hex(t.muted),
                bold: segment.bold || undefined,
                ...(segment.code
                  ? { shading: { fill: hex(t.accentSoft) } }
                  : {}),
                ...(index === 0 ? { break: 1 } : {}),
              }),
          ),
        );
      }
      return [
        new Paragraph({
          indent: { left: tw(16) },
          spacing: { before: tw(4), after: tw(10) },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: hex(t.border), space: 8 },
          },
          children: runs,
        }),
      ];
    }

    case "code": {
      const lines = String(block.code ?? "").split(/\r?\n/);
      return [
        new Paragraph({
          shading: { fill: hex(t.accentSoft) },
          spacing: { before: tw(6), after: tw(10) },
          border: {
            top: { style: BorderStyle.SINGLE, size: 4, color: hex(t.border), space: 6 },
            bottom: {
              style: BorderStyle.SINGLE,
              size: 4,
              color: hex(t.border),
              space: 6,
            },
            left: { style: BorderStyle.SINGLE, size: 4, color: hex(t.border), space: 6 },
            right: {
              style: BorderStyle.SINGLE,
              size: 4,
              color: hex(t.border),
              space: 6,
            },
          },
          children: lines.map(
            (line, index) =>
              new TextRun({
                text: line,
                font: t.monoFontName,
                size: hp(9),
                color: hex(t.text),
                ...(index > 0 ? { break: 1 } : {}),
              }),
          ),
        }),
      ];
    }

    case "image": {
      const image = images.get(block.url);
      // Unfetchable or unreadable images are dropped, exactly as the PDF
      // renderer drops them — a broken placeholder is worse than an omission.
      if (!image) return [];

      const targetWidth = Math.min(
        block.width === "half" ? MAX_IMAGE_WIDTH_PX / 2 : MAX_IMAGE_WIDTH_PX,
        image.width,
      );
      const scale = targetWidth / image.width;

      const out: Paragraph[] = [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: tw(6), after: block.caption ? tw(2) : tw(10) },
          children: [
            new ImageRun({
              data: image.data,
              type: image.kind,
              transformation: {
                width: Math.round(targetWidth),
                height: Math.round(image.height * scale),
              },
            }),
          ],
        }),
      ];

      if (block.caption) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: tw(10) },
            children: inlineRuns(t, block.caption, {
              size: hp(9),
              color: hex(t.muted),
            }),
          }),
        );
      }
      return out;
    }

    case "divider":
      return [
        new Paragraph({
          spacing: { before: tw(10), after: tw(10) },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: hex(t.border) },
          },
          children: [],
        }),
      ];

    case "pageBreak":
      return [new Paragraph({ children: [new PageBreak()] })];

    default:
      return [];
  }
};

/* ------------------------------------------------------------------ *
 * Front matter
 * ------------------------------------------------------------------ */

const renderCover = (spec: DocumentSpec, t: ThemeTokens): Paragraph[] => {
  const date = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const out: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: tw(190), after: tw(10) },
      children: [
        new TextRun({
          text: spec.title,
          bold: true,
          font: t.headingFontName,
          size: hp(30),
          color: hex(t.accent),
        }),
      ],
    }),
  ];

  if (spec.subtitle) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: tw(24) },
        children: [
          new TextRun({
            text: spec.subtitle,
            font: t.bodyFontName,
            size: hp(13),
            color: hex(t.muted),
          }),
        ],
      }),
    );
  }

  for (const line of [spec.author, date].filter(Boolean) as string[]) {
    out.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: line,
            font: t.bodyFontName,
            size: hp(10),
            color: hex(t.muted),
          }),
        ],
      }),
    );
  }

  out.push(new Paragraph({ children: [new PageBreak()] }));
  return out;
};

const renderInlineHeader = (spec: DocumentSpec, t: ThemeTokens): Paragraph[] => {
  const out: Paragraph[] = [
    new Paragraph({
      spacing: { after: spec.subtitle ? tw(2) : tw(16) },
      ...(spec.subtitle
        ? {}
        : {
            border: {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: hex(t.accent),
                space: 8,
              },
            },
          }),
      children: [
        new TextRun({
          text: spec.title,
          bold: true,
          font: t.headingFontName,
          size: hp(22),
          color: hex(t.accent),
        }),
      ],
    }),
  ];

  if (spec.subtitle) {
    out.push(
      new Paragraph({
        spacing: { after: tw(16) },
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 12,
            color: hex(t.accent),
            space: 8,
          },
        },
        children: [
          new TextRun({
            text: spec.subtitle,
            font: t.bodyFontName,
            size: hp(12),
            color: hex(t.muted),
          }),
        ],
      }),
    );
  }

  return out;
};

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export const renderSpecToDocx = async (
  spec: DocumentSpec,
  theme: DocumentTheme,
): Promise<Buffer> => {
  const t = getThemeTokens(theme);
  const images = await prefetchImages(spec);

  dlog(
    "docx",
    `theme=${theme} blocks=${spec.blocks.length} images=${images.size} — building document`,
  );

  let listInstance = 0;
  const nextListInstance = () => ++listInstance;

  const body: (Paragraph | Table)[] = [
    ...(spec.coverPage ? renderCover(spec, t) : renderInlineHeader(spec, t)),
    ...spec.blocks.flatMap((block) =>
      renderBlock(block, t, images, nextListInstance),
    ),
  ];

  const showPageNumbers = spec.showPageNumbers !== false;

  const doc = new Document({
    creator: spec.author || "AI Colab Chat",
    title: spec.title,
    description: spec.subtitle,
    numbering: {
      config: [
        {
          reference: ORDERED_LIST_REFERENCE,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.START,
              style: {
                paragraph: { indent: { left: tw(18), hanging: tw(9) } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(PAGE_MARGIN_INCHES),
              bottom: convertInchesToTwip(PAGE_MARGIN_INCHES),
              left: convertInchesToTwip(PAGE_MARGIN_INCHES),
              right: convertInchesToTwip(PAGE_MARGIN_INCHES),
            },
          },
        },
        ...(showPageNumbers
          ? {
              footers: {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          children: [
                            "Page ",
                            PageNumber.CURRENT,
                            " of ",
                            PageNumber.TOTAL_PAGES,
                          ],
                          font: t.bodyFontName,
                          size: hp(8),
                          color: hex(t.muted),
                        }),
                      ],
                    }),
                  ],
                }),
              },
            }
          : {}),
        children: body,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  dlog("docx", `packed ${buffer.length} bytes`);
  return Buffer.from(buffer);
};
