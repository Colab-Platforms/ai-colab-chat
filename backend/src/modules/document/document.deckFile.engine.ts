import JSZip from "jszip";

/**
 * Fills a real, designed .pptx with new text, instead of drawing a deck from
 * scratch.
 *
 * The decks in frontend/Templates are built from absolutely positioned shapes
 * ("Text 3", "Shape 6"...). Filling one means rewriting the text of named
 * shapes and, for the few data-driven slides (a bar chart, a funnel), moving
 * and resizing named shapes. Everything else the design owns (fonts, colours,
 * decoration) stays exactly as the designer left it, which is the point.
 *
 * Works on the slide XML as a string rather than a parsed tree: the files are
 * machine-generated, shape names are unique per slide, and there is no nesting
 * of <p:sp>, so a targeted rewrite is both smaller and safer than round-tripping
 * the document through an XML serializer.
 */

const EMU_PER_PT = 12700;

export const escapeXml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const RUN_RE = /<a:r>[\s\S]*?<\/a:r>/g;
const XFRM_RE = /<a:off x="(-?\d+)" y="(-?\d+)"\s*\/><a:ext cx="(\d+)" cy="(\d+)"\s*\/>/;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One slide's XML with helpers to edit its shapes by name. Units are points. */
export class SlideXml {
  constructor(public xml: string) {}

  private range(name: string): [number, number] | null {
    const at = this.xml.indexOf(`name="${name}"`);
    if (at < 0) return null;
    const start = this.xml.lastIndexOf("<p:sp>", at);
    const end = this.xml.indexOf("</p:sp>", at);
    if (start < 0 || end < 0) return null;
    return [start, end + "</p:sp>".length];
  }

  private edit(name: string, fn: (block: string) => string): void {
    const r = this.range(name);
    if (!r) throw new Error(`Template shape "${name}" not found`);
    this.xml = this.xml.slice(0, r[0]) + fn(this.xml.slice(r[0], r[1])) + this.xml.slice(r[1]);
  }

  has(name: string): boolean {
    return this.range(name) !== null;
  }

  /** Replaces the shape's text, keeping the first run's formatting. */
  setText(name: string, text: string): void {
    const clean = escapeXml(text.replace(/\s+/g, " ").trim());
    this.edit(name, (block) => {
      let first = true;
      return block.replace(RUN_RE, (run) => {
        if (!first) return "";
        first = false;
        return run.replace(/<a:t>[\s\S]*?<\/a:t>/, () => `<a:t>${clean}</a:t>`);
      });
    });
  }

  /** Sets each run of a multi-run shape (e.g. a bold lead-in then plain text). */
  setRuns(name: string, texts: string[]): void {
    this.edit(name, (block) => {
      let i = 0;
      return block.replace(RUN_RE, (run) => {
        const idx = i++;
        if (idx >= texts.length) return "";
        const clean = escapeXml(texts[idx].replace(/\s+/g, " "));
        return run.replace(/<a:t>[\s\S]*?<\/a:t>/, () => `<a:t>${clean}</a:t>`);
      });
    });
  }

  setTextColor(name: string, hex: string): void {
    this.edit(name, (block) =>
      block.replace(/(<a:rPr[^>]*>\s*<a:solidFill>\s*<a:srgbClr val=")[0-9A-Fa-f]{6}(")/g, (_m, a, b) => `${a}${hex}${b}`),
    );
  }

  /** Colours one run of a multi-run shape. */
  setRunColor(name: string, runIndex: number, hex: string): void {
    this.edit(name, (block) => {
      let i = 0;
      return block.replace(RUN_RE, (run) =>
        i++ === runIndex
          ? run.replace(/(<a:rPr[^>]*>\s*<a:solidFill>\s*<a:srgbClr val=")[0-9A-Fa-f]{6}(")/, (_m, a, b) => `${a}${hex}${b}`)
          : run,
      );
    });
  }

  setFontSize(name: string, hundredthsPt: number): void {
    this.edit(name, (block) => block.replace(/\ssz="\d+"/g, ` sz="${hundredthsPt}"`));
  }

  setAlign(name: string, algn: "l" | "r" | "ctr"): void {
    this.edit(name, (block) => block.replace(/algn="\w+"/g, `algn="${algn}"`));
  }

  getBox(name: string): Box {
    const r = this.range(name);
    if (!r) throw new Error(`Template shape "${name}" not found`);
    const m = XFRM_RE.exec(this.xml.slice(r[0], r[1]));
    if (!m) throw new Error(`Template shape "${name}" has no position`);
    return { x: +m[1] / EMU_PER_PT, y: +m[2] / EMU_PER_PT, w: +m[3] / EMU_PER_PT, h: +m[4] / EMU_PER_PT };
  }

  setBox(name: string, patch: Partial<Box>): void {
    const cur = this.getBox(name);
    const b = { ...cur, ...patch };
    const e = (v: number) => Math.round(v * EMU_PER_PT);
    this.edit(name, (block) =>
      block.replace(XFRM_RE, () => `<a:off x="${e(b.x)}" y="${e(b.y)}"/><a:ext cx="${e(Math.max(b.w, 1))}" cy="${e(Math.max(b.h, 1))}"/>`),
    );
  }

  remove(name: string): void {
    const r = this.range(name);
    if (!r) return;
    this.xml = this.xml.slice(0, r[0]) + this.xml.slice(r[1]);
  }

  /** Font size of the shape's first run, in points. */
  getFontSize(name: string): number {
    const r = this.range(name);
    const m = r ? /\ssz="(\d+)"/.exec(this.xml.slice(r[0], r[1])) : null;
    return m ? Number(m[1]) / 100 : 18;
  }

  /** Sets the text and shrinks the font until it fits the box on one line. */
  fitOneLine(name: string, text: string, charEm = 0.58): void {
    this.setText(name, text);
    const { w } = this.getBox(name);
    const cur = this.getFontSize(name);
    const need = (w - 6) / (Math.max(text.length, 1) * charEm);
    if (need < cur) this.setFontSize(name, Math.max(Math.floor(need), 10) * 100);
  }

  /** Sets the text and shrinks the font until it fits the box's area (wrapping allowed). */
  fitBlock(name: string, text: string, charEm = 0.52, lineHeight = 1.12): void {
    this.setText(name, text);
    const { w, h } = this.getBox(name);
    const cur = this.getFontSize(name);
    const byArea = Math.sqrt((w * h) / (Math.max(text.length, 1) * charEm * lineHeight));
    // A single long word cannot wrap, so it also has to fit the box width.
    const longest = Math.max(...text.split(/\s+/).map((word) => word.length), 1);
    const need = Math.min(byArea, (w - 6) / (longest * (charEm + 0.06)));
    if (need < cur) this.setFontSize(name, Math.max(Math.floor(need), 10) * 100);
  }

  /** Fills a shape (the first solid colour in its geometry properties). */
  setFill(name: string, hex: string): void {
    this.edit(name, (block) => {
      const at = block.indexOf("<p:txBody>");
      const head = at < 0 ? block : block.slice(0, at);
      const tail = at < 0 ? "" : block.slice(at);
      const ln = head.indexOf("<a:ln");
      const geo = ln < 0 ? head : head.slice(0, ln);
      const rest = ln < 0 ? "" : head.slice(ln);
      const solid = /(<a:solidFill>\s*<a:srgbClr val=")[0-9A-Fa-f]{6}(")/;
      const filled = solid.test(geo)
        ? geo.replace(solid, (_m, a, b) => `${a}${hex}${b}`)
        : /<a:noFill\s*\/>/.test(geo)
          ? geo.replace(/<a:noFill\s*\/>/, () => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`)
          : geo + `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
      return filled + rest + tail;
    });
  }

  removePicture(name: string): void {
    const at = this.xml.indexOf(`name="${name}"`);
    if (at < 0) return;
    const start = this.xml.lastIndexOf("<p:pic>", at);
    const end = this.xml.indexOf("</p:pic>", at);
    if (start < 0 || end < 0) return;
    this.xml = this.xml.slice(0, start) + this.xml.slice(end + "</p:pic>".length);
  }

  /** Adds shapes behind everything else on the slide (right after the group header). */
  addShapesBehind(shapesXml: string): void {
    const marker = "</p:grpSpPr>";
    const at = this.xml.indexOf(marker);
    if (at < 0) return;
    const insertAt = at + marker.length;
    this.xml = this.xml.slice(0, insertAt) + shapesXml + this.xml.slice(insertAt);
  }
}

export interface FreeformOptions {
  id: number;
  name: string;
  /** Absolute slide coordinates, in points. */
  points: Array<[number, number]>;
  closed?: boolean;
  fill?: { color: string; alpha?: number };
  line?: { color: string; widthPt: number; dashed?: boolean };
}

/** A freeform polygon or polyline as slide XML (used to draw charts). */
export const freeformXml = (o: FreeformOptions): string => {
  const xs = o.points.map((p) => p[0]);
  const ys = o.points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const e = (v: number) => Math.round(v * EMU_PER_PT);
  const w = Math.max(e(Math.max(...xs) - x0), 1);
  const h = Math.max(e(Math.max(...ys) - y0), 1);
  const pts = o.points.map(([x, y]) => `<a:pt x="${e(x - x0)}" y="${e(y - y0)}"/>`);
  const path =
    `<a:moveTo>${pts[0]}</a:moveTo>` + pts.slice(1).map((p) => `<a:lnTo>${p}</a:lnTo>`).join("") + (o.closed ? "<a:close/>" : "");
  const fill = o.fill
    ? `<a:solidFill><a:srgbClr val="${o.fill.color}">${o.fill.alpha !== undefined ? `<a:alpha val="${Math.round(o.fill.alpha * 100000)}"/>` : ""}</a:srgbClr></a:solidFill>`
    : "<a:noFill/>";
  const line = o.line
    ? `<a:ln w="${e(o.line.widthPt)}" cap="rnd"><a:solidFill><a:srgbClr val="${o.line.color}"/></a:solidFill>${o.line.dashed ? '<a:prstDash val="dash"/>' : ""}<a:round/></a:ln>`
    : "<a:ln><a:noFill/></a:ln>";
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${o.id}" name="${escapeXml(o.name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${e(x0)}" y="${e(y0)}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
    `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="l" t="t" r="r" b="b"/>` +
    `<a:pathLst><a:path w="${w}" h="${h}"${o.closed ? "" : ' fill="none"'}>${path}</a:path></a:pathLst></a:custGeom>${fill}${line}</p:spPr></p:sp>`
  );
};

export interface DeckSlidePlan {
  /** 1-based slide number in the template file. */
  source: number;
  edit: (slide: SlideXml) => void;
  notes?: string;
}

/** Where a slide sits in the finished deck, for page numbers like "03 / 08". */
export interface SlideContext {
  /** 1-based position among the kept slides. */
  pos: number;
  total: number;
}

const slidePart = (n: number) => `ppt/slides/slide${n}.xml`;
const slideRels = (n: number) => `ppt/slides/_rels/slide${n}.xml.rels`;
const notesPart = (n: number) => `ppt/notesSlides/notesSlide${n}.xml`;
const notesRels = (n: number) => `ppt/notesSlides/_rels/notesSlide${n}.xml.rels`;

const fillSlide = async (
  zip: JSZip,
  plan: DeckSlidePlan,
  fontMap: Record<string, string>,
): Promise<string> => {
  const slide = new SlideXml(await zip.file(slidePart(plan.source))!.async("string"));
  plan.edit(slide);
  for (const [from, to] of Object.entries(fontMap)) {
    slide.xml = slide.xml.split(`typeface="${from}"`).join(`typeface="${to}"`);
  }
  return slide.xml;
};

/** The filled XML of each planned slide, in plan order (for the in-app preview). */
export const fillSlideXmls = async (
  templateFile: Buffer,
  plans: DeckSlidePlan[],
  fontMap: Record<string, string> = {},
): Promise<string[]> => {
  const zip = await JSZip.loadAsync(templateFile);
  return Promise.all(plans.map((p) => fillSlide(zip, p, fontMap)));
};

/**
 * Builds the output file: the chosen template slides, filled, in template order;
 * every other slide (and its notes) removed from the package.
 */
export const buildDeckFromTemplate = async (
  templateFile: Buffer,
  plans: DeckSlidePlan[],
  /**
   * Typeface substitutions applied to every kept slide. The designs use web
   * fonts that are not installed on most machines; PowerPoint then substitutes
   * on its own and, with some of them, draws the last word of a wrapped line a
   * second time at the start of the next. Mapping to a font every Office
   * install has avoids that.
   */
  fontMap: Record<string, string> = {},
): Promise<Buffer> => {
  const zip = await JSZip.loadAsync(templateFile);
  const keep = new Map(plans.map((p) => [p.source, p]));

  const allSlides = Object.keys(zip.files)
    .map((f) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(f))
    .filter((m): m is RegExpExecArray => Boolean(m))
    .map((m) => Number(m[1]));

  const presRelsPath = "ppt/_rels/presentation.xml.rels";
  let presRels = await zip.file(presRelsPath)!.async("string");
  let pres = await zip.file("ppt/presentation.xml")!.async("string");
  let contentTypes = await zip.file("[Content_Types].xml")!.async("string");

  for (const n of allSlides) {
    const plan = keep.get(n);

    if (plan) {
      zip.file(slidePart(n), await fillSlide(zip, plan, fontMap));

      const notes = zip.file(notesPart(n));
      if (notes) {
        const text = escapeXml((plan.notes ?? "").replace(/\s+/g, " ").trim());
        const nx = (await notes.async("string")).replace(
          /<a:t>Fills from:[^<]*<\/a:t>/,
          () => `<a:t>${text}</a:t>`,
        );
        zip.file(notesPart(n), nx);
      }
      continue;
    }

    // Drop the slide: its parts, its rel from the presentation, its slide id.
    const relMatch = new RegExp(`<Relationship [^>]*Id="(rId\\d+)"[^>]*Target="slides/slide${n}\\.xml"[^>]*/>`).exec(presRels);
    if (relMatch) {
      presRels = presRels.replace(relMatch[0], "");
      pres = pres.replace(new RegExp(`<p:sldId [^>]*r:id="${relMatch[1]}"\\s*/>`), "");
    }
    contentTypes = contentTypes
      .replace(new RegExp(`<Override PartName="/ppt/slides/slide${n}\\.xml"[^>]*/>`), "")
      .replace(new RegExp(`<Override PartName="/ppt/notesSlides/notesSlide${n}\\.xml"[^>]*/>`), "");
    for (const part of [slidePart(n), slideRels(n), notesPart(n), notesRels(n)]) zip.remove(part);
  }

  zip.file(presRelsPath, presRels);
  zip.file("ppt/presentation.xml", pres);
  zip.file("[Content_Types].xml", contentTypes);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
};
