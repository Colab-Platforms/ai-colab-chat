import PptxGenJS from "pptxgenjs";
import { dlog } from "./document.logger.js";

/**
 * pptxgenjs ships both a CJS and an ESM build, and the interop wrapper differs
 * between running the TypeScript directly (tsx, in dev) and the compiled
 * output. Under ESM the default import arrives as `{ default: ctor }`, so
 * `new PptxGenJS()` throws "not a constructor". Unwrapping a nested default
 * covers both rather than working in dev and failing in production.
 *
 * The imported binding is still used for its *types* below - only the runtime
 * value needs unwrapping.
 */
const PptxGen = ((PptxGenJS as unknown as { default?: typeof PptxGenJS })
  .default ?? PptxGenJS) as typeof PptxGenJS;
import { isAllowedImageUrl } from "./document.html.js";
import { getCalloutColors } from "./document.theme.js";
import {
  getPptxTemplateTokens,
  type PptxTemplateTokens,
} from "./document.pptxTemplates.js";
import type { PresentationSpec, SlideBlock, SlideSpec } from "./document.types.js";

/**
 * Renders a validated PresentationSpec to a .pptx buffer.
 *
 * Unlike the PDF and DOCX renderers this one does not consume `DocumentSpec`:
 * a slide is a fixed-size canvas, so *what goes on each slide* is a content
 * decision the model has to make. See the note on PresentationSpec in
 * document.types.ts.
 *
 * Everything here is absolute-positioned in inches on a 13.33 x 7.5in stage
 * (16:9). Blocks are laid out top-down from a cursor, and anything that would
 * overflow the stage is dropped rather than allowed to spill off the slide -
 * PowerPoint has no reflow, so overflow is silent and invisible until someone
 * presents it.
 *
 * Visual design (colors/fonts/decoration/photos) is owned entirely by the
 * PPTX template tokens (document.pptxTemplates.ts) - a *separate*, richer set
 * of tokens from the flat `ThemeTokens` that PDF/DOCX/XLSX share, since only a
 * slide has fixed-canvas layout decisions (photo placement, split panels,
 * decorative shapes) to make.
 */

/* ------------------------------------------------------------------ *
 * Stage geometry (inches)
 * ------------------------------------------------------------------ */

const STAGE_W = 13.33;
const STAGE_H = 7.5;
const MARGIN_X = 0.6;
const CONTENT_W = STAGE_W - MARGIN_X * 2;
const TITLE_Y = 0.45;
const TITLE_H = 0.9;
const BODY_TOP = TITLE_Y + TITLE_H + 0.25;
const BODY_BOTTOM = STAGE_H - 0.6;

/** pptxgenjs wants bare hex, same as OOXML. */
const hex = (color: string): string => color.replace(/^#/, "").toUpperCase();

/** A safe photo URL, or null if missing/not on the allowlist. */
const safePhoto = (url: string | undefined): string | null =>
  url && isAllowedImageUrl(url) ? url : null;

/**
 * Estimated rendered height, in inches.
 *
 * PowerPoint cannot measure text for us, so the layout cursor needs a guess.
 * It is deliberately generous: over-estimating costs whitespace, whereas
 * under-estimating overlaps two blocks on top of each other.
 */
const estimateTextHeight = (
  text: string,
  fontPt: number,
  widthIn: number,
): number => {
  const charsPerLine = Math.max(
    10,
    Math.floor((widthIn * 96) / (fontPt * 0.58)),
  );
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)),
      0,
    );
  return (lines * fontPt * 1.35) / 72;
};

/* ------------------------------------------------------------------ *
 * Blocks
 * ------------------------------------------------------------------ */

interface LayoutCursor {
  y: number;
}

/** The horizontal band a block is laid out into - the full content width on
 * a plain slide, or one column of a two-column (text + photo) content slide. */
interface LayoutRegion {
  x: number;
  w: number;
}

const FULL_REGION: LayoutRegion = { x: MARGIN_X, w: CONTENT_W };

/**
 * Places one block and advances the cursor.
 *
 * Returns false when the block did not fit, which stops the slide - carrying
 * on would stack later blocks off the bottom edge.
 */
const placeBlock = (
  slide: PptxGenJS.Slide,
  block: SlideBlock,
  t: PptxTemplateTokens,
  cursor: LayoutCursor,
  region: LayoutRegion = FULL_REGION,
): boolean => {
  const bodyPt = 16;
  const remaining = BODY_BOTTOM - cursor.y;
  if (remaining <= 0.4) return false;

  const base = {
    x: region.x,
    w: region.w,
    fontFace: t.bodyFontName,
    color: hex(t.text),
  };

  switch (block.type) {
    case "paragraph": {
      const h = Math.min(
        estimateTextHeight(block.text, bodyPt, region.w),
        remaining,
      );
      slide.addText(block.text, {
        ...base,
        y: cursor.y,
        h,
        fontSize: bodyPt,
        valign: "top",
      });
      cursor.y += h + 0.15;
      return true;
    }

    case "list": {
      const items = block.items.filter(
        (item): item is string => typeof item === "string",
      );
      const h = Math.min(
        items.reduce(
          (total, item) =>
            total + estimateTextHeight(item, bodyPt, region.w - 0.4) + 0.08,
          0,
        ),
        remaining,
      );
      slide.addText(
        items.map((item) => ({
          text: item,
          options: {
            bullet: block.ordered ? { type: "number" as const } : true,
          },
        })),
        {
          ...base,
          y: cursor.y,
          h,
          fontSize: bodyPt,
          valign: "top",
          lineSpacingMultiple: 1.2,
        },
      );
      cursor.y += h + 0.15;
      return true;
    }

    case "table": {
      const columns = block.columns.slice(0, 6);
      const rowHeight = 0.38;
      const rows = block.rows.slice(
        0,
        Math.max(1, Math.floor((remaining - rowHeight) / rowHeight)),
      );

      const header = columns.map((column) => ({
        text: String(column ?? ""),
        options: {
          bold: true,
          color: hex(t.tableHeaderText),
          fill: { color: hex(t.tableHeaderBg) },
        },
      }));

      const body = rows.map((row, rowIndex) =>
        // Pad or trim: pptxgenjs renders a ragged row as a broken grid.
        // Every cell gets an explicit fill (not just the tinted ones) -
        // PowerPoint applies its own default table style to any cell an
        // XML `<a:tc>` leaves unstyled, which would punch light stripes
        // through a dark template's background.
        columns.map((_column, columnIndex) => ({
          text: String(row?.[columnIndex] ?? ""),
          options: {
            color: hex(t.text),
            fill: { color: hex(rowIndex % 2 === 1 ? t.bgSoft : t.bg) },
          },
        })),
      );

      const h = (rows.length + 1) * rowHeight;
      slide.addTable([header, ...body], {
        x: region.x,
        y: cursor.y,
        w: region.w,
        fontFace: t.bodyFontName,
        fontSize: 12,
        border: { type: "solid", pt: 0.5, color: hex(t.border) },
        rowH: rowHeight,
      });
      cursor.y += h + 0.2;

      if (block.caption && cursor.y < BODY_BOTTOM) {
        slide.addText(block.caption, {
          ...base,
          y: cursor.y,
          h: 0.25,
          fontSize: 11,
          italic: true,
          color: hex(t.muted),
        });
        cursor.y += 0.3;
      }
      return true;
    }

    case "callout": {
      const colors = getCalloutColors(block.variant);
      const text = block.title ? `${block.title}\n${block.text}` : block.text;
      const h = Math.min(
        estimateTextHeight(text, bodyPt, region.w - 0.5) + 0.3,
        remaining,
      );

      slide.addShape("rect", {
        x: region.x,
        y: cursor.y,
        w: region.w,
        h,
        fill: { color: hex(colors.bg) },
        line: { color: hex(colors.border), width: 0 },
      });
      // A left accent bar, drawn as its own shape - PowerPoint shapes cannot
      // carry a single-sided border.
      slide.addShape("rect", {
        x: region.x,
        y: cursor.y,
        w: 0.07,
        h,
        fill: { color: hex(colors.border) },
        line: { color: hex(colors.border), width: 0 },
      });
      slide.addText(
        [
          ...(block.title
            ? [
                {
                  text: block.title,
                  options: { bold: true, color: hex(colors.border), breakLine: true },
                },
              ]
            : []),
          { text: block.text, options: { color: hex(t.text) } },
        ],
        {
          x: region.x + 0.22,
          y: cursor.y + 0.1,
          w: region.w - 0.4,
          h: h - 0.2,
          fontFace: t.bodyFontName,
          fontSize: bodyPt - 1,
          valign: "top",
        },
      );
      cursor.y += h + 0.15;
      return true;
    }

    case "keyValue": {
      // Explicit fill on every cell - same reasoning as the "table" case
      // above: an unstyled cell picks up PowerPoint's own default table
      // style rather than staying transparent over a dark background.
      const rows = block.items.map((item) => [
        {
          text: item.label,
          options: { bold: true, color: hex(t.muted), fill: { color: hex(t.bg) } },
        },
        { text: item.value, options: { color: hex(t.text), fill: { color: hex(t.bg) } } },
      ]);
      const rowHeight = 0.34;
      const h = rows.length * rowHeight;
      if (h > remaining) return false;

      slide.addTable(rows, {
        x: region.x,
        y: cursor.y,
        w: region.w,
        colW: [region.w * 0.32, region.w * 0.68],
        fontFace: t.bodyFontName,
        fontSize: 14,
        border: { type: "none" },
        rowH: rowHeight,
      });
      cursor.y += h + 0.2;
      return true;
    }

    case "quote": {
      const text = block.attribution
        ? `“${block.text}”\n- ${block.attribution}`
        : `“${block.text}”`;
      const h = Math.min(
        estimateTextHeight(text, bodyPt + 2, region.w - 0.6),
        remaining,
      );
      slide.addText(text, {
        x: region.x + 0.3,
        y: cursor.y,
        w: region.w - 0.6,
        h,
        fontFace: t.bodyFontName,
        fontSize: bodyPt + 2,
        italic: true,
        color: hex(t.muted),
        valign: "top",
      });
      cursor.y += h + 0.2;
      return true;
    }

    case "code": {
      const h = Math.min(
        estimateTextHeight(block.code, 12, region.w - 0.3) + 0.2,
        remaining,
      );
      slide.addShape("rect", {
        x: region.x,
        y: cursor.y,
        w: region.w,
        h,
        fill: { color: hex(t.bgSoft) },
        line: { color: hex(t.border), width: 0.5 },
      });
      slide.addText(block.code, {
        x: region.x + 0.12,
        y: cursor.y + 0.08,
        w: region.w - 0.24,
        h: h - 0.16,
        fontFace: t.monoFontName,
        fontSize: 12,
        color: hex(t.text),
        valign: "top",
      });
      cursor.y += h + 0.15;
      return true;
    }

    case "image": {
      // Same allowlist as the other renderers. PowerPoint fetches nothing at
      // open time - pptxgenjs downloads the bytes while packing - so a
      // disallowed URL is dropped here rather than becoming a broken link.
      const url = safePhoto(block.url);
      if (!url) {
        dlog("pptx", `image dropped - not on the allowlist: ${block.url.slice(0, 120)}`);
        return true;
      }

      const w = block.width === "half" ? region.w / 2 : region.w * 0.72;
      const h = Math.min(remaining - 0.2, 3.6);
      if (h < 0.8) return false;

      slide.addImage({
        path: url,
        x: region.x + (region.w - w) / 2,
        y: cursor.y,
        w,
        h,
        sizing: { type: "contain", w, h },
      });
      cursor.y += h + 0.12;

      if (block.caption && cursor.y < BODY_BOTTOM) {
        slide.addText(block.caption, {
          x: region.x,
          y: cursor.y,
          w: region.w,
          h: 0.25,
          fontFace: t.bodyFontName,
          fontSize: 11,
          align: "center",
          color: hex(t.muted),
        });
        cursor.y += 0.3;
      }
      return true;
    }

    default:
      return true;
  }
};

/* ------------------------------------------------------------------ *
 * Decoration - small per-template flourishes shared by section/content
 * slides, so a deck reads as "designed" even on text-only slides.
 * ------------------------------------------------------------------ */

const addDecoration = (
  slide: PptxGenJS.Slide,
  t: PptxTemplateTokens,
  variant: "section" | "content",
  bigNumberText?: string,
): void => {
  switch (t.decoration) {
    case "cornerBlob":
      // A soft, oversized translucent circle bleeding off the top-right
      // corner - cheap to draw, reads as "designed" on an otherwise flat bg.
      slide.addShape("ellipse", {
        x: STAGE_W - 3.2,
        y: -1.8,
        w: 4.2,
        h: 4.2,
        fill: { color: hex(t.accent2), transparency: 80 },
        line: { color: hex(t.accent2), width: 0 },
      });
      slide.addShape("ellipse", {
        x: STAGE_W - 1.6,
        y: -0.6,
        w: 2.2,
        h: 2.2,
        fill: { color: hex(t.accent), transparency: 72 },
        line: { color: hex(t.accent), width: 0 },
      });
      return;

    case "thinBar":
      slide.addShape("rect", {
        x: 0,
        y: 0,
        w: STAGE_W,
        h: 0.12,
        fill: { color: hex(t.accent) },
        line: { color: hex(t.accent), width: 0 },
      });
      return;

    case "bigNumber":
      if (variant === "section" && bigNumberText) {
        slide.addText(bigNumberText, {
          x: STAGE_W - 4.2,
          y: STAGE_H - 4.6,
          w: 4,
          h: 4,
          fontFace: t.headingFontName,
          fontSize: 220,
          bold: true,
          color: hex(t.bgSoft),
          align: "right",
          valign: "bottom",
        });
      }
      return;

    case "none":
    default:
      return;
  }
};

/* ------------------------------------------------------------------ *
 * Slides
 * ------------------------------------------------------------------ */

/** Per-template geometry for the "splitPhoto" title layout - how much of the
 * slide the text panel occupies, and a small kicker label above the title. */
const SPLIT_PHOTO_LAYOUT: Partial<Record<string, { textRatio: number; kicker?: string }>> = {
  corporate: { textRatio: 0.36 },
  emerald: { textRatio: 0.48, kicker: "PRESENTATION" },
};

const addSolidTitleSlide = (
  pptx: PptxGenJS,
  spec: PresentationSpec,
  slideSpec: SlideSpec,
  t: PptxTemplateTokens,
): PptxGenJS.Slide => {
  const slide = pptx.addSlide();
  slide.background = { color: hex(t.accent) };

  slide.addText(slideSpec.title || spec.title, {
    x: MARGIN_X,
    y: 2.5,
    w: CONTENT_W,
    h: 1.4,
    fontFace: t.headingFontName,
    fontSize: 40,
    bold: t.headingBold,
    color: hex(t.onAccent),
    align: "center",
    valign: "middle",
  });

  const subtitle = slideSpec.subtitle || spec.subtitle;
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN_X,
      y: 3.9,
      w: CONTENT_W,
      h: 0.6,
      fontFace: t.bodyFontName,
      fontSize: 18,
      color: hex(t.onAccent),
      align: "center",
    });
  }

  if (spec.author) {
    slide.addText(spec.author, {
      x: MARGIN_X,
      y: 4.7,
      w: CONTENT_W,
      h: 0.4,
      fontFace: t.bodyFontName,
      fontSize: 13,
      color: hex(t.onAccent),
      align: "center",
    });
  }

  return slide;
};

const addFullBleedPhotoTitleSlide = (
  pptx: PptxGenJS,
  spec: PresentationSpec,
  slideSpec: SlideSpec,
  t: PptxTemplateTokens,
  photoUrl: string,
): PptxGenJS.Slide => {
  const slide = pptx.addSlide();
  slide.background = { color: hex(t.bg) };

  slide.addImage({
    path: photoUrl,
    x: 0,
    y: 0,
    w: STAGE_W,
    h: STAGE_H,
    sizing: { type: "cover", w: STAGE_W, h: STAGE_H },
  });

  // Dark scrim so white title text stays legible over an arbitrary photo.
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: STAGE_W,
    h: STAGE_H,
    fill: { color: "000000", transparency: 42 },
    line: { color: "000000", width: 0 },
  });
  slide.addShape("rect", {
    x: 0,
    y: STAGE_H - 0.14,
    w: STAGE_W,
    h: 0.14,
    fill: { color: hex(t.accent) },
    line: { color: hex(t.accent), width: 0 },
  });

  slide.addText(slideSpec.title || spec.title, {
    x: MARGIN_X,
    y: 2.7,
    w: CONTENT_W,
    h: 1.4,
    fontFace: t.headingFontName,
    fontSize: 40,
    bold: t.headingBold,
    color: "FFFFFF",
    align: "center",
    valign: "middle",
  });

  const subtitle = slideSpec.subtitle || spec.subtitle;
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN_X,
      y: 4.1,
      w: CONTENT_W,
      h: 0.6,
      fontFace: t.bodyFontName,
      fontSize: 18,
      color: "F2F2F2",
      align: "center",
    });
  }

  if (spec.author) {
    slide.addText(spec.author, {
      x: MARGIN_X,
      y: 4.9,
      w: CONTENT_W,
      h: 0.4,
      fontFace: t.bodyFontName,
      fontSize: 13,
      color: "E4E4E4",
      align: "center",
    });
  }

  return slide;
};

const addSplitPhotoTitleSlide = (
  pptx: PptxGenJS,
  spec: PresentationSpec,
  slideSpec: SlideSpec,
  t: PptxTemplateTokens,
  photoUrl: string,
): PptxGenJS.Slide => {
  const layout = SPLIT_PHOTO_LAYOUT[t.key] ?? { textRatio: 0.4 };
  const textW = STAGE_W * layout.textRatio;

  const slide = pptx.addSlide();
  slide.background = { color: hex(t.accent) };

  slide.addImage({
    path: photoUrl,
    x: textW,
    y: 0,
    w: STAGE_W - textW,
    h: STAGE_H,
    sizing: { type: "cover", w: STAGE_W - textW, h: STAGE_H },
  });

  const panelPadX = 0.55;
  const panelW = textW - panelPadX * 2;

  if (layout.kicker) {
    slide.addText(layout.kicker, {
      x: panelPadX,
      y: 2.1,
      w: panelW,
      h: 0.4,
      fontFace: t.bodyFontName,
      fontSize: 12,
      bold: true,
      color: hex(t.accent2),
      charSpacing: 2,
    });
  }

  slide.addText(slideSpec.title || spec.title, {
    x: panelPadX,
    y: layout.kicker ? 2.55 : 2.4,
    w: panelW,
    h: 2.2,
    fontFace: t.headingFontName,
    fontSize: 32,
    bold: t.headingBold,
    color: hex(t.onAccent),
    valign: "top",
  });

  const subtitle = slideSpec.subtitle || spec.subtitle;
  if (subtitle) {
    slide.addText(subtitle, {
      x: panelPadX,
      y: 4.6,
      w: panelW,
      h: 0.8,
      fontFace: t.bodyFontName,
      fontSize: 15,
      color: hex(t.onAccent),
    });
  }

  if (spec.author) {
    slide.addText(spec.author, {
      x: panelPadX,
      y: STAGE_H - 0.7,
      w: panelW,
      h: 0.4,
      fontFace: t.bodyFontName,
      fontSize: 12,
      color: hex(t.onAccent),
    });
  }

  return slide;
};

const addTitleSlide = (
  pptx: PptxGenJS,
  spec: PresentationSpec,
  slideSpec: SlideSpec,
  t: PptxTemplateTokens,
): void => {
  const photoUrl = safePhoto(slideSpec.photoUrl ?? spec.coverPhotoUrl);
  let slide: PptxGenJS.Slide;

  // A missing photo (Pexels miss, disabled key, or an odd topic with no
  // results) always falls back to the solid layout - the deck must never be
  // left half-built because a stock-photo lookup didn't land anything.
  if (t.titleLayout === "fullBleedPhoto" && photoUrl) {
    slide = addFullBleedPhotoTitleSlide(pptx, spec, slideSpec, t, photoUrl);
  } else if (t.titleLayout === "splitPhoto" && photoUrl) {
    slide = addSplitPhotoTitleSlide(pptx, spec, slideSpec, t, photoUrl);
  } else {
    slide = addSolidTitleSlide(pptx, spec, slideSpec, t);
  }

  if (slideSpec.notes) slide.addNotes(slideSpec.notes);
};

const addSectionSlide = (
  pptx: PptxGenJS,
  slideSpec: SlideSpec,
  t: PptxTemplateTokens,
  sectionIndex: number,
): void => {
  const slide = pptx.addSlide();
  slide.background = { color: hex(t.bg) };

  addDecoration(slide, t, "section", String(sectionIndex).padStart(2, "0"));

  slide.addText(slideSpec.title, {
    x: MARGIN_X,
    y: 3.1,
    w: CONTENT_W,
    h: 1.2,
    fontFace: t.headingFontName,
    fontSize: 32,
    bold: t.headingBold,
    color: hex(t.accent),
    align: "center",
    valign: "middle",
  });

  if (slideSpec.subtitle) {
    slide.addText(slideSpec.subtitle, {
      x: MARGIN_X,
      y: 4.3,
      w: CONTENT_W,
      h: 0.5,
      fontFace: t.bodyFontName,
      fontSize: 16,
      color: hex(t.muted),
      align: "center",
    });
  }

  if (slideSpec.notes) slide.addNotes(slideSpec.notes);
};

/** Rounded "pill" page-number badge, standing in for the old bare gray text. */
const addPageNumberBadge = (
  slide: PptxGenJS.Slide,
  t: PptxTemplateTokens,
  index: number,
  total: number,
): void => {
  const w = 0.9;
  const h = 0.32;
  const x = STAGE_W - MARGIN_X - w;
  const y = STAGE_H - 0.5;

  slide.addShape("roundRect", {
    x,
    y,
    w,
    h,
    rectRadius: h / 2,
    fill: { color: hex(t.bgSoft) },
    line: { color: hex(t.border), width: 0.5 },
  });
  slide.addText(`${index} / ${total}`, {
    x,
    y,
    w,
    h,
    fontFace: t.bodyFontName,
    fontSize: 10,
    color: hex(t.muted),
    align: "center",
    valign: "middle",
  });
};

const addContentSlide = (
  pptx: PptxGenJS,
  slideSpec: SlideSpec,
  t: PptxTemplateTokens,
  index: number,
  total: number,
): number => {
  const slide = pptx.addSlide();
  slide.background = { color: hex(t.bg) };
  addDecoration(slide, t, "content");

  const photoUrl = t.contentImageLayout ? safePhoto(slideSpec.photoUrl) : null;
  const photoW = CONTENT_W * 0.4;
  const textRegion: LayoutRegion = photoUrl
    ? { x: MARGIN_X, w: CONTENT_W - photoW - 0.35 }
    : FULL_REGION;

  slide.addText(slideSpec.title, {
    x: MARGIN_X,
    y: TITLE_Y,
    w: CONTENT_W,
    h: TITLE_H,
    fontFace: t.headingFontName,
    fontSize: 26,
    bold: t.headingBold,
    color: hex(t.accent),
    valign: "middle",
  });

  // Accent rule under the title, mirroring the document header.
  slide.addShape("rect", {
    x: MARGIN_X,
    y: TITLE_Y + TITLE_H,
    w: 1.1,
    h: 0.04,
    fill: { color: hex(t.accent) },
    line: { color: hex(t.accent), width: 0 },
  });

  if (photoUrl) {
    const photoH = Math.min(BODY_BOTTOM - BODY_TOP, 4.4);
    slide.addImage({
      path: photoUrl,
      x: MARGIN_X + textRegion.w + 0.35,
      y: BODY_TOP,
      w: photoW,
      h: photoH,
      sizing: { type: "cover", w: photoW, h: photoH },
    });
  }

  const cursor: LayoutCursor = { y: BODY_TOP };
  let dropped = 0;
  for (const block of slideSpec.blocks) {
    if (!placeBlock(slide, block, t, cursor, textRegion)) {
      dropped += 1;
    }
  }

  addPageNumberBadge(slide, t, index, total);

  if (slideSpec.notes) slide.addNotes(slideSpec.notes);
  return dropped;
};

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

export const renderSpecToPptx = async (
  spec: PresentationSpec,
  theme: string,
): Promise<Buffer> => {
  const t = getPptxTemplateTokens(theme);
  const pptx = new PptxGen();

  pptx.layout = "LAYOUT_WIDE";
  pptx.title = spec.title;
  if (spec.author) pptx.author = spec.author;

  dlog(
    "pptx",
    `template=${t.key} slides=${spec.slides.length} - building presentation`,
  );

  let droppedBlocks = 0;
  let sectionIndex = 0;
  spec.slides.forEach((slideSpec, index) => {
    const layout = slideSpec.layout ?? "content";
    if (layout === "title") {
      addTitleSlide(pptx, spec, slideSpec, t);
    } else if (layout === "section") {
      sectionIndex += 1;
      addSectionSlide(pptx, slideSpec, t, sectionIndex);
    } else {
      droppedBlocks += addContentSlide(
        pptx,
        slideSpec,
        t,
        index + 1,
        spec.slides.length,
      );
    }
  });

  if (droppedBlocks) {
    // Worth surfacing: the model over-filled a slide past what the stage can
    // hold, which is a prompt problem rather than a rendering one.
    dlog(
      "pptx",
      `${droppedBlocks} block(s) dropped for overflow - slides are over-filled`,
    );
  }

  const data = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  dlog("pptx", `packed ${data.length} bytes`);
  return Buffer.from(data);
};
