/**
 * Draws a filled template slide as HTML for the in-app preview.
 *
 * The template files are built from plain absolutely positioned shapes (a
 * rectangle, a rounded rectangle, an ellipse, a custom bar, a text box), so a
 * small converter reproduces them faithfully: same positions, same colours,
 * same type sizes. It is a preview, not a PowerPoint engine; anything it does
 * not understand is simply skipped.
 *
 * All units are the file's own points, rendered as CSS px on a 1440x810
 * canvas; the client scales the canvas to fit.
 */

export const SLIDE_WIDTH = 1440;
export const SLIDE_HEIGHT = 810;

const EMU_PER_PT = 12700;
// Single quotes: these stacks are placed inside double-quoted style attributes.
const FALLBACK_STACK = `Calibri, 'Segoe UI', Arial, Helvetica, sans-serif`;

const attr = (s: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`).exec(s)?.[1];

const color = (xml: string): string | undefined => {
  const m = /<a:srgbClr val="([0-9A-Fa-f]{6})"\s*(?:\/>|>([\s\S]*?)<\/a:srgbClr>)/.exec(xml);
  if (!m) return undefined;
  const alpha = m[2] ? /<a:alpha val="(\d+)"/.exec(m[2])?.[1] : undefined;
  if (alpha && Number(alpha) < 100000) {
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${(Number(alpha) / 100000).toFixed(3)})`;
  }
  return `#${m[1]}`;
};

const px = (emu: string | number) => +(Number(emu) / EMU_PER_PT).toFixed(2);

const stroke = (spPr: string): { color: string; w: number; dash: boolean } | null => {
  const ln = /<a:ln\b([^>]*)>([\s\S]*?)<\/a:ln>/.exec(spPr);
  if (!ln) return null;
  const c = color(ln[2]);
  if (!c || /<a:noFill/.test(ln[2])) return null;
  return { color: c, w: px(attr(ln[1], "w") ?? 12700), dash: /<a:prstDash val="(?!solid)/.test(ln[2]) };
};

/** Freeform polygons/polylines (charts) as inline SVG. Rounded bars are handled by radiusFor. */
const freeformSvg = (spPr: string, w: number, h: number, fill: string | undefined): string | null => {
  const path = /<a:path w="(\d+)" h="(\d+)"[^>]*>([\s\S]*?)<\/a:path>/.exec(spPr);
  if (!path || /<a:arcTo/.test(path[3])) return null;
  const pts = [...path[3].matchAll(/<a:pt x="(-?\d+)" y="(-?\d+)"/g)].map((m) => `${px(m[1])},${px(m[2])}`);
  if (pts.length < 3 && !stroke(spPr)) return null;
  if (pts.length < 2) return null;
  const st = stroke(spPr);
  const d = `M${pts.join(" L")}${/<a:close/.test(path[3]) ? " Z" : ""}`;
  return (
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0;overflow:visible">` +
    `<path d="${d}" fill="${/<a:close/.test(path[3]) && fill ? fill : "none"}"` +
    (st ? ` stroke="${st.color}" stroke-width="${st.w}" stroke-linecap="round" stroke-linejoin="round"${st.dash ? ' stroke-dasharray="14 10"' : ""}` : "") +
    `/></svg>`
  );
};

/** A linear gradient fill as CSS, or undefined when the shape has none. */
const gradientCss = (geo: string): string | undefined => {
  const g = /<a:gradFill[^>]*>([\s\S]*?)<\/a:gradFill>/.exec(geo);
  if (!g) return undefined;
  const stops = [...g[1].matchAll(/<a:gs pos="(\d+)">([\s\S]*?)<\/a:gs>/g)]
    .map((m) => `${color(m[2]) ?? "transparent"} ${(Number(m[1]) / 1000).toFixed(1)}%`);
  if (stops.length < 2) return undefined;
  const ang = Number(/<a:lin ang="(-?\d+)"/.exec(g[1])?.[1] ?? 0) / 60000;
  return `linear-gradient(${ang + 90}deg,${stops.join(",")})`;
};

const svgOrNull = (spPr: string): boolean => /<a:custGeom>/.test(spPr) && !/<a:arcTo/.test(spPr);

const shadowCss = (spPr: string): string => {
  const m = /<a:outerShdw([^>]*)>([\s\S]*?)<\/a:outerShdw>/.exec(spPr);
  if (!m) return "";
  const blur = px(attr(m[1], "blurRad") ?? 0);
  const dist = px(attr(m[1], "dist") ?? 0);
  return `box-shadow:0 ${dist}px ${blur}px ${color(m[2]) ?? "rgba(0,0,0,.3)"}`;
};

/** CSS border-radius for a shape's geometry. */
const radiusFor = (spPr: string, w: number, h: number): string => {
  if (/prst="ellipse"/.test(spPr)) return "50%";
  if (/prst="roundRect"/.test(spPr)) {
    const adj = Number(/name="adj" fmla="val (\d+)"/.exec(spPr)?.[1] ?? 16667);
    return `${((Math.min(w, h) * adj) / 100000).toFixed(2)}px`;
  }
  if (/<a:custGeom>/.test(spPr)) {
    // Corner arcs of the bar path: stAng names the corner being rounded.
    const corner: Record<string, number> = { "10800000": 0, "16200000": 1, "0": 2, "5400000": 3 }; // tl tr br bl
    const r = [0, 0, 0, 0];
    for (const m of spPr.matchAll(/<a:arcTo[^>]*wR="(\d+)"[^>]*stAng="(\d+)"/g)) {
      const idx = corner[m[2]];
      if (idx !== undefined) r[idx] = px(m[1]);
    }
    return r.every((v) => v === 0) ? "0" : r.map((v) => `${v}px`).join(" ");
  }
  return "0";
};

const renderText = (txBody: string): string => {
  const body = /<a:bodyPr([^>]*)>/.exec(txBody)?.[1] ?? "";
  const anchor = attr(body, "anchor") ?? "t";
  const pad = ["tIns", "rIns", "bIns", "lIns"].map((k) => px(attr(body, k) ?? 0));
  const justify = anchor === "ctr" ? "center" : anchor === "b" ? "flex-end" : "flex-start";

  const paragraphs = [...txBody.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)].map((pm) => {
    const p = pm[1];
    const pPr = /<a:pPr([^>]*)>/.exec(p)?.[1] ?? "";
    const align = { l: "left", r: "right", ctr: "center", just: "justify" }[attr(pPr, "algn") ?? "l"] ?? "left";
    const spacing = Number(/<a:lnSpc><a:spcPct val="(\d+)"/.exec(p)?.[1] ?? 100000) / 100000;

    const runs = [...p.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)]
      .map((rm) => {
        const r = rm[1];
        const rPr = /<a:rPr([^>]*)>/.exec(r)?.[1] ?? "";
        const text = /<a:t>([\s\S]*?)<\/a:t>/.exec(r)?.[1] ?? "";
        if (!text) return "";
        const size = Number(attr(rPr, "sz") ?? 1800) / 100;
        const face = /<a:latin typeface="([^"]+)"/.exec(r)?.[1];
        const spc = Number(attr(rPr, "spc") ?? 0) / 100;
        const css = [
          `font-size:${size}px`,
          `color:${color(r.slice(0, r.indexOf("</a:rPr>") + 8)) ?? "#000"}`,
          attr(rPr, "b") === "1" ? "font-weight:700" : "",
          attr(rPr, "i") === "1" ? "font-style:italic" : "",
          spc ? `letter-spacing:${spc}px` : "",
          face ? `font-family:'${face.replace(/[^\w \-]/g, "")}',${FALLBACK_STACK}` : "",
        ]
          .filter(Boolean)
          .join(";");
        // `text` is already XML-escaped, which is valid HTML text.
        return `<span style="${css}">${text}</span>`;
      })
      .join("");

    const firstSize = Number(/sz="(\d+)"/.exec(p)?.[1] ?? 1800) / 100;
    return `<div style="text-align:${align};line-height:${(spacing * 1.2).toFixed(3)};min-height:${(firstSize * 1.2 * spacing).toFixed(1)}px">${runs}</div>`;
  });

  return `<div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:${justify};padding:${pad.join("px ")}px;box-sizing:border-box">${paragraphs.join("")}</div>`;
};

/** One slide's XML to a self-contained HTML fragment for a 1440x810 canvas. */
export const slideXmlToHtml = (xml: string): string => {
  const bg = color(/<p:bg>[\s\S]*?<\/p:bg>/.exec(xml)?.[0] ?? "") ?? "#ffffff";
  const parts: string[] = [];

  for (const m of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    const sp = m[0];
    const xf = /<a:off x="(-?\d+)" y="(-?\d+)"\s*\/><a:ext cx="(\d+)" cy="(\d+)"\s*\/>/.exec(sp);
    if (!xf) continue;
    const [x, y, w, h] = [px(xf[1]), px(xf[2]), px(xf[3]), px(xf[4])];
    const spPr = /<p:spPr>[\s\S]*?<\/p:spPr>/.exec(sp)?.[0] ?? "";
    const geo = spPr.replace(/<a:ln(?=[ >])[\s\S]*?<\/a:ln>/, "");
    const fill = /<a:noFill\s*\/>/.test(geo) ? undefined : gradientCss(geo) ?? color(geo);
    const line = svgOrNull(spPr) ? null : stroke(spPr);
    const txBody = /<p:txBody>[\s\S]*?<\/p:txBody>/.exec(sp)?.[0];

    const rot = Number(/<a:xfrm[^>]*\srot="(-?\d+)"/.exec(spPr)?.[1] ?? 0) / 60000;
    const svg = freeformSvg(spPr, w, h, fill);

    const style = [
      "position:absolute",
      `left:${x}px`,
      `top:${y}px`,
      `width:${w}px`,
      `height:${h}px`,
      fill && !svg ? `background:${fill}` : "",
      line ? `border:${line.w}px ${line.dash ? "dashed" : "solid"} ${line.color};box-sizing:border-box` : "",
      svg ? "" : `border-radius:${radiusFor(spPr, w, h)}`,
      rot ? `transform:rotate(${rot}deg)` : "",
      shadowCss(spPr),
    ]
      .filter(Boolean)
      .join(";");

    parts.push(`<div style="${style}">${svg ?? ""}${txBody ? renderText(txBody) : ""}</div>`);
  }

  return `<div style="position:relative;width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;background:${bg};overflow:hidden;font-family:${FALLBACK_STACK}">${parts.join("")}</div>`;
};
