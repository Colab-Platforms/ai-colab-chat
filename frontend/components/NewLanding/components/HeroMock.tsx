"use client";

import { CSSProperties, useEffect, useState } from "react";

// Product mock under the hero, ported from netlify-home. Pure HTML/CSS so it
// follows the light/dark tokens defined on .cl-root (landing.css).
const A = "/new-landing/ref";

function Ms({ name, size = 17, style }: { name: string; size?: number; style?: CSSProperties }) {
  return (
    <span className="ms" aria-hidden="true" style={{ fontSize: size, fontVariationSettings: "'wght' 300", ...style }}>
      {name}
    </span>
  );
}

const navRow: CSSProperties = { flexShrink: 0, display: "flex", alignItems: "center", gap: 10, height: 32, padding: "0 9px", borderRadius: 8, fontSize: 13, color: "var(--text)" };
const histRow: CSSProperties = { flexShrink: 0, height: 30, padding: "0 9px", display: "flex", alignItems: "center", fontSize: 13, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const histHead: CSSProperties = { flexShrink: 0, padding: "10px 9px 4px", fontSize: 11.5, color: "var(--faint)" };
const chip: CSSProperties = { display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 13px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", fontSize: 13, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap" };

const NAV: [string, string, string?, number?, string?, string?][] = [
  ["folder", "Projects"],
  ["support_agent", "Specialists", "chevron_right"],
  ["smart_toy", "Agents", "expand_more"],
  ["code", "Software Engineer", undefined, 26, "var(--accent)"],
  ["web", "Website Designer", undefined, 26, "oklch(0.62 0.13 160)"],
  ["arrow_forward", "View all", undefined, 26],
  ["description", "Documents"],
  ["image", "Image Studio"],
  ["movie", "Video Studio", undefined, undefined, undefined, "New"],
  ["inventory_2", "Assets"],
  ["star", "Starred"],
  ["graphic_eq", "Voice chats", undefined, undefined, undefined, "Beta"],
];

const SUGGEST: [string, string, string][] = [
  ["view_column", "Compare models on a hard question", "Side by side"],
  ["travel_explore", "Research with live web results", "Cites sources"],
  ["movie", "Make a 5-second product clip", "Video Studio"],
];

export default function HeroMock({ dark }: { dark: boolean }) {
  const [w, setW] = useState(1440);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const noSide = w < 760;
  const noTag = w < 560;
  const mark = `${A}/logos/colab-mark-${dark ? "dark" : "light"}.png`;

  return (
    <div className="cl-s" style={{ width: "100%", maxWidth: 1080, margin: "0 auto", borderRadius: 18, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--pop)", overflow: "hidden", textAlign: "left", color: "var(--text)" }}>
      <div style={{ display: "flex", height: 40, alignItems: "center", gap: 8, padding: "0 14px", borderBottom: "1px solid var(--border)", background: "var(--sunken)" }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--chrome)" }} />)}
        <span style={{ flex: 1, maxWidth: 340, margin: "0 auto", height: 24, borderRadius: 7, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 11.5, color: "var(--faint)" }}>
          <Ms name="lock" size={13} style={{ fontVariationSettings: "normal" }} />chat.colabplatforms.ai
        </span>
      </div>
      <div style={{ display: "flex", aspectRatio: noSide ? "auto" : "16/10", minHeight: 460, background: "var(--bg)" }}>
        {!noSide && (
          <div style={{ display: "flex", width: 236, flexShrink: 0, flexDirection: "column", background: "var(--sunken)", borderRight: "1px solid var(--border)", overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 8px 6px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 4px" }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><Ms name="all_inclusive" size={18} style={{ fontVariationSettings: "normal" }} /></span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Colab AI</span>
                <Ms name="left_panel_close" size={18} style={{ color: "var(--faint)" }} />
              </span>
              <span style={{ display: "flex", gap: 6 }}>
                <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 11px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", fontSize: 13, fontWeight: 500 }}>
                  <Ms name="edit_square" style={{ color: "var(--accent)" }} />New chat
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, height: 36, padding: "0 9px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)" }}>
                  <Ms name="search" /><span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "var(--faint)" }}>⌘K</span>
                </span>
              </span>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", padding: "4px 8px" }}>
              {NAV.map(([icon, label, trail, pl, ic, badge]) => (
                <span key={label} style={{ ...navRow, paddingLeft: pl ?? 9 }}>
                  <Ms name={icon} style={{ color: ic ?? "var(--muted)" }} />
                  <span style={{ flex: 1, whiteSpace: "nowrap" }}>{label}</span>
                  {trail && <Ms name={trail} size={16} style={{ color: "var(--faint)" }} />}
                  {badge && (
                    <span style={{ height: 18, padding: "0 6px", borderRadius: 5, background: badge === "New" ? "var(--accent-soft)" : "var(--sunken)", color: badge === "New" ? "var(--accent-ink)" : "var(--muted)", fontSize: 10.5, fontWeight: 600, display: "flex", alignItems: "center" }}>{badge}</span>
                  )}
                </span>
              ))}
              <span style={{ flexShrink: 0, height: 1, margin: "8px 0 2px", background: "var(--border)" }} />
              <span style={histHead}>Today</span>
              <span style={histRow}>Pizza restaurant in South Delhi</span>
              <span style={histRow}>Pizza restaurant — GPT-5.4</span>
              <span style={histHead}>Yesterday</span>
              <span style={histRow}>Seed round pitch outline</span>
              <span style={histRow}>React table virtualization</span>
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent-ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 600 }}>J</span>
              <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>Junaid Shaikh</span>
                <span style={{ fontSize: 11.5, color: "var(--faint)" }}>Plus plan</span>
              </span>
              <Ms name="unfold_more" size={16} style={{ color: "var(--faint)" }} />
            </span>
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", position: "relative", background: "radial-gradient(40% 30% at 50% 38%,var(--glow) 0%,var(--glow0) 100%)" }}>
          {noSide && <Ms name="menu" size={22} style={{ position: "absolute", left: 14, top: 14, fontVariationSettings: "normal" }} />}
          <div style={{ flex: 1, minHeight: 0, width: "100%", maxWidth: 640, margin: "0 auto", padding: "clamp(48px,6vw,40px) clamp(16px,3vw,32px) 24px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "clamp(16px,2vw,22px)" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mark} alt="" style={{ height: "clamp(24px,2.6vw,30px)", width: "auto" }} />
              <span style={{ fontSize: "clamp(22px,2.6vw,30px)", lineHeight: 1.15, fontWeight: 600, letterSpacing: "-.025em" }}>Good morning, Junaid</span>
              <span style={{ fontSize: "clamp(13px,1.2vw,14.5px)", color: "var(--muted)" }}>Ask one model, or compare up to 4 side by side.</span>
            </div>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 12, padding: "12px 12px 10px 14px", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
              <span style={{ minHeight: 32, fontSize: 14, color: "var(--faint)" }}>Ask anything…</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: "50%", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center" }}><Ms name="add" size={18} style={{ color: "var(--text)" }} /></span>
                <span style={{ display: "flex", padding: 3, borderRadius: 9, background: "var(--sunken)" }}>
                  <span style={{ height: 26, padding: "0 10px", borderRadius: 7, display: "flex", alignItems: "center", background: "var(--surface)", border: "1px solid var(--border)", fontSize: 12, fontWeight: 600 }}>Single</span>
                  <span style={{ height: 26, padding: "0 10px", display: "flex", alignItems: "center", fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>Multi</span>
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 6px", fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap" }}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: `#fff url(${A}/logos/openai.svg) center/10px no-repeat` }} />GPT-5.4
                  <Ms name="expand_more" size={16} style={{ color: "var(--faint)" }} />
                </span>
                <span style={{ flex: 1 }} />
                {!noTag && <Ms name="graphic_eq" size={18} style={{ color: "var(--muted)" }} />}
                <Ms name="mic" size={18} style={{ color: "var(--muted)" }} />
                <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", background: "var(--sunken)", display: "flex", alignItems: "center", justifyContent: "center" }}><Ms name="arrow_upward" size={18} style={{ color: "var(--faint)" }} /></span>
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
              <span style={{ ...chip, border: "1px solid transparent", background: "var(--accent-soft)", color: "var(--accent-ink)" }}><Ms name="chat_bubble" style={{ color: "var(--accent)" }} />Chat</span>
              <span style={chip}><Ms name="travel_explore" style={{ color: "var(--text)" }} />Web search</span>
              <span style={chip}><Ms name="image" style={{ color: "var(--text)" }} />Image</span>
              <span style={chip}><Ms name="movie" style={{ color: "var(--text)" }} />Video</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4, height: 34, padding: "0 8px", fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>Specialists<Ms name="arrow_forward" size={15} style={{ color: "var(--muted)" }} /></span>
            </div>
            <div style={{ width: "100%", display: "flex", flexDirection: "column" }}>
              {SUGGEST.map(([icon, text, tag]) => (
                <span key={text} style={{ display: "flex", alignItems: "center", gap: 12, height: 45, padding: "0 12px", borderTop: "1px solid var(--border)", fontSize: 13.5, color: "var(--text)" }}>
                  <Ms name={icon} size={16} style={{ color: "var(--faint)" }} />
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
                  {!noTag && <span style={{ fontSize: 12, color: "var(--faint)", whiteSpace: "nowrap" }}>{tag}</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
