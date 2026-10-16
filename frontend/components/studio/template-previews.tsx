import type { CSSProperties } from "react";

/**
 * Miniature renderings of the backend's predefined templates, drawn from the
 * same colour/font tokens the renderers use (GET /documents/templates). They
 * are faithful in palette, typography and layout style, not pixel-exact files.
 *
 * Everything is sized in `em` off a single font-size so one component serves
 * both the small card thumbnail and the large preview.
 */

export interface TemplateInfo {
  key: string;
  label: string;
  description: string;
  tokens: Record<string, any>;
}

type Tokens = Record<string, any>;

const bar = (w: string, color: string, h = 0.5, extra?: CSSProperties): CSSProperties => ({
  width: w,
  height: `${h}em`,
  borderRadius: "0.2em",
  background: color,
  ...extra,
});

/** A4-ish page used for PDF and Word. */
export function DocPagePreview({ tokens: t, fontSize = 5 }: { tokens: Tokens; fontSize?: number }) {
  return (
    <div
      style={{
        fontSize,
        width: "22em",
        aspectRatio: "1 / 1.414",
        background: "#fff",
        color: t.text,
        padding: "1.7em",
        fontFamily: t.bodyFont,
        boxShadow: "0 0.1em 0.5em rgba(0,0,0,.12)",
        borderRadius: "0.25em",
        overflow: "hidden",
      }}
    >
      <div style={{ fontFamily: t.headingFont, fontWeight: t.headingWeight, color: t.accent, fontSize: "1.9em", lineHeight: 1.15 }}>
        Quarterly review
      </div>
      <div style={{ color: t.muted, fontSize: "0.75em", marginTop: "0.4em" }}>Prepared for the leadership team</div>
      <div style={{ ...bar("3em", t.accent, 0.18), margin: "0.8em 0 1em" }} />

      <div style={{ fontFamily: t.headingFont, fontWeight: t.headingWeight, fontSize: "1.05em", marginBottom: "0.4em" }}>
        1. Summary
      </div>
      <div style={{ fontSize: "0.62em", lineHeight: 1.55, color: t.text }}>
        Revenue grew steadily across all segments while costs stayed flat. The main risks are concentrated in two
        accounts, and the plan below addresses both.
      </div>

      <div
        style={{
          margin: "0.9em 0",
          padding: "0.6em 0.8em",
          background: t.accentSoft,
          borderLeft: `0.25em solid ${t.accent}`,
          borderRadius: "0.15em",
          fontSize: "0.62em",
          lineHeight: 1.5,
        }}
      >
        Key takeaway: focus effort where the margin is highest.
      </div>

      <div style={{ border: `0.06em solid ${t.border}`, borderRadius: "0.2em", overflow: "hidden", fontSize: "0.6em" }}>
        {[
          ["Segment", "Q1", "Q2"],
          ["Retail", "128", "141"],
          ["Online", "96", "118"],
          ["Partners", "54", "61"],
        ].map((row, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              padding: "0.35em 0.6em",
              background: i === 0 ? t.tableHeaderBg : i % 2 === 0 ? t.accentSoft : "#fff",
              color: i === 0 ? t.tableHeaderText : t.text,
              fontWeight: i === 0 ? 600 : 400,
              borderTop: i === 0 ? "none" : `0.06em solid ${t.border}`,
            }}
          >
            {row.map((c, j) => (
              <span key={j}>{c}</span>
            ))}
          </div>
        ))}
      </div>

      <div style={{ fontSize: "0.62em", lineHeight: 1.55, marginTop: "0.9em", color: t.muted }}>
        Next steps are listed on the following page with owners and dates.
      </div>
    </div>
  );
}

/** Spreadsheet window used for Excel. */
export function SheetPreview({ tokens: t, fontSize = 5 }: { tokens: Tokens; fontSize?: number }) {
  const rows = [
    ["Item", "Qty", "Unit cost", "Total"],
    ["Notebooks", "40", "120", "4,800"],
    ["Pens", "200", "12", "2,400"],
    ["Folders", "60", "35", "2,100"],
    ["Markers", "80", "28", "2,240"],
    ["Total", "", "", "11,540"],
  ];
  return (
    <div
      style={{
        fontSize,
        width: "30em",
        background: "#fff",
        color: t.text,
        fontFamily: t.bodyFont,
        boxShadow: "0 0.1em 0.5em rgba(0,0,0,.12)",
        borderRadius: "0.25em",
        overflow: "hidden",
        border: `0.06em solid ${t.border}`,
      }}
    >
      <div style={{ fontFamily: t.headingFont, fontWeight: t.headingWeight, color: t.accent, fontSize: "1.2em", padding: "0.8em 1em 0.5em" }}>
        Stationery budget
      </div>
      <div style={{ fontSize: "0.8em" }}>
        {rows.map((row, i) => {
          const last = i === rows.length - 1;
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1.2fr 1.2fr",
                padding: "0.45em 1em",
                background: i === 0 ? t.tableHeaderBg : last ? t.accentSoft : i % 2 === 0 ? "#fafafa" : "#fff",
                color: i === 0 ? t.tableHeaderText : t.text,
                fontWeight: i === 0 || last ? 700 : 400,
                borderTop: i === 0 ? "none" : `0.06em solid ${t.border}`,
              }}
            >
              {row.map((c, j) => (
                <span key={j} style={{ textAlign: j === 0 ? "left" : "right" }}>
                  {c}
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "0.4em", padding: "0.5em 1em", background: "#f4f4f4", fontSize: "0.7em" }}>
        <span style={{ background: "#fff", padding: "0.2em 0.8em", borderTop: `0.2em solid ${t.accent}`, fontWeight: 600 }}>Budget</span>
        <span style={{ color: t.muted, padding: "0.2em 0.8em" }}>Summary</span>
      </div>
    </div>
  );
}

const SLIDE_W = "30em";

function SlideFrame({ children, background, tokens: t }: { children: React.ReactNode; background: string; tokens: Tokens }) {
  return (
    <div
      style={{
        width: SLIDE_W,
        aspectRatio: "16 / 9",
        background,
        position: "relative",
        overflow: "hidden",
        borderRadius: "0.3em",
        boxShadow: "0 0.1em 0.5em rgba(0,0,0,.14)",
        border: `0.05em solid ${t.border}`,
        fontFamily: `"${t.bodyFontName}", sans-serif`,
      }}
    >
      {children}
    </div>
  );
}

const headingStyle = (t: Tokens): CSSProperties => ({
  fontFamily: `"${t.headingFontName}", serif`,
  fontWeight: t.headingBold ? 700 : 500,
});

export function DeckTitleSlide({ tokens: t, fontSize = 5 }: { tokens: Tokens; fontSize?: number }) {
  const photo = `linear-gradient(135deg, ${t.accent}, ${t.accent2})`;
  const title = (color: string, align: "center" | "left" = "center") => (
    <div style={{ textAlign: align }}>
      <div style={{ ...headingStyle(t), color, fontSize: "2.1em", lineHeight: 1.1 }}>Annual strategy</div>
      <div style={{ color, opacity: 0.8, fontSize: "0.85em", marginTop: "0.5em" }}>FY 2026 · Leadership offsite</div>
    </div>
  );

  let inner: React.ReactNode;
  if (t.titleLayout === "splitPhoto") {
    inner = (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100%" }}>
        <div style={{ background: photo }} />
        <div style={{ background: t.accent, display: "flex", alignItems: "center", padding: "1.6em", color: t.onAccent }}>
          {title(t.onAccent, "left")}
        </div>
      </div>
    );
  } else if (t.titleLayout === "fullBleedPhoto") {
    inner = (
      <div style={{ height: "100%", background: photo, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)" }} />
        <div style={{ position: "relative" }}>{title("#fff")}</div>
      </div>
    );
  } else {
    inner = (
      <div style={{ height: "100%", background: t.accent, display: "flex", alignItems: "center", justifyContent: "center", color: t.onAccent }}>
        {title(t.onAccent)}
      </div>
    );
  }
  return (
    <div style={{ fontSize }}>
      <SlideFrame background={t.bg} tokens={t}>
        {inner}
      </SlideFrame>
    </div>
  );
}

export function DeckContentSlide({ tokens: t, fontSize = 5 }: { tokens: Tokens; fontSize?: number }) {
  return (
    <div style={{ fontSize }}>
      <SlideFrame background={t.bg} tokens={t}>
        {t.decoration === "cornerBlob" && (
          <div
            style={{
              position: "absolute",
              right: "-3em",
              top: "-3em",
              width: "9em",
              height: "9em",
              borderRadius: "50%",
              background: t.accent2,
              opacity: 0.25,
            }}
          />
        )}
        {t.decoration === "thinBar" && (
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "0.5em", background: t.accent }} />
        )}
        {t.decoration === "bigNumber" && (
          <div
            style={{
              ...headingStyle(t),
              position: "absolute",
              right: "1em",
              bottom: "-0.3em",
              fontSize: "9em",
              lineHeight: 1,
              color: t.accent,
              opacity: 0.18,
            }}
          >
            02
          </div>
        )}
        <div style={{ position: "relative", padding: "2em 2.4em", color: t.text }}>
          <div style={{ ...headingStyle(t), color: t.accent, fontSize: "1.5em" }}>Where we are growing</div>
          <div style={{ ...bar("2.5em", t.accent2, 0.15), margin: "0.6em 0 1em" }} />
          {["Retail up 12% on the prior year", "Online now 40% of revenue", "Partner channel doubled in size"].map((b) => (
            <div key={b} style={{ display: "flex", gap: "0.6em", alignItems: "center", fontSize: "0.9em", marginBottom: "0.55em" }}>
              <span style={{ width: "0.45em", height: "0.45em", borderRadius: "50%", background: t.accent, flexShrink: 0 }} />
              <span>{b}</span>
            </div>
          ))}
        </div>
      </SlideFrame>
    </div>
  );
}

/** Card thumbnail for any format. */
export function TemplateThumb({ format, tokens }: { format: string; tokens: Tokens }) {
  if (format === "PPTX") return <DeckTitleSlide tokens={tokens} fontSize={4.6} />;
  if (format === "XLSX") return <SheetPreview tokens={tokens} fontSize={4.6} />;
  return <DocPagePreview tokens={tokens} fontSize={3.9} />;
}
