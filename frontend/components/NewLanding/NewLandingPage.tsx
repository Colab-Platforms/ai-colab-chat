"use client";

import "./landing.css";
import React, { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import SmoothScrollLayout from "../SmoothScrollLayout";
import { Hero } from "./components/Hero";
import { Navbar } from "./components/Navbar";
import { planService } from "@/lib/services";
import { useAuth } from "@/context/auth-context";
import { useTheme } from "@/context/theme-context";
import { getPlanFeatureLines } from "@/lib/planFeatures";

// ─────────────────────────────────────────────────────
//  Assets (copied from netlify-home into /public/new-landing/ref)
// ─────────────────────────────────────────────────────
const A = "/new-landing/ref";
const logo = (k: string) => `${A}/logos/${k}.svg`;

// ─────────────────────────────────────────────────────
//  Small helpers
// ─────────────────────────────────────────────────────
function Ms({ name, size = 18, style }: { name: string; size?: number; style?: CSSProperties }) {
  return (
    <span className="ms" aria-hidden="true" style={{ fontSize: size, ...style }}>
      {name}
    </span>
  );
}

function useWidth() {
  const [w, setW] = useState(1440);
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return w;
}

const GUTTER = "clamp(16px,4vw,32px)";

const eyebrow: CSSProperties = {
  fontSize: 13, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--accent)",
};
const h2Style: CSSProperties = {
  margin: 0, fontSize: "clamp(30px,4.4vw,52px)", lineHeight: 1.06, fontWeight: 600, letterSpacing: "-.035em", textWrap: "balance",
};
const sectionPad = `clamp(56px,9vw,110px) ${GUTTER}`;

function SectionHead({ label, title, blurb }: { label: string; title: string; blurb: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "16px 40px" }}>
      <div style={{ flex: 1, minWidth: "min(100%,420px)", display: "flex", flexDirection: "column", gap: 14 }}>
        <span style={eyebrow}>{label}</span>
        <h2 style={h2Style}>{title}</h2>
      </div>
      <p style={{ margin: 0, flex: "0 1 380px", fontSize: 16, lineHeight: 1.55, color: "var(--muted)", textWrap: "pretty" }}>{blurb}</p>
    </div>
  );
}

const gradIcon: CSSProperties = {
  background: "linear-gradient(145deg,var(--accent) 0%,color-mix(in oklch,var(--accent) 70%,#000) 100%)",
  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  boxShadow: "0 6px 14px -6px color-mix(in oklch,var(--accent) 70%,transparent)",
};

// ─────────────────────────────────────────────────────
//  About
// ─────────────────────────────────────────────────────
const ABOUT_POINTS: [string, string][] = [
  ["view_column", "Ask once, compare answers side by side"],
  ["credit_card", "One plan instead of many AI subscriptions"],
  ["swap_horiz", "Switch models mid-chat without losing context"],
];

const ORBIT_LOGOS = [
  { k: "openai", l: 14.16, t: 8.14, y: 68 },
  { k: "gemini", l: 12.09, t: 22.87, y: 144 },
  { k: "anthropic", l: 10.77, t: 37.6, y: 220 },
  { k: "perplexity", l: 10.77, t: 52.33, y: 296 },
  { k: "qwen", l: 12.09, t: 67.05, y: 372 },
  { k: "deepseek", l: 14.16, t: 80.62, y: 442 },
];
const ORBIT_X = [148, 134, 125, 125, 134, 148];
const ORBIT_C1 = [188.25, 214.85, 241.45, 268.05, 294.65, 319.15];
const ORBIT_C0X = [298, 284, 275, 275, 284, 298];

function WinDots() {
  return (
    <span style={{ display: "flex", gap: 5 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--border-strong)" }} />
      ))}
    </span>
  );
}

function About({ dark }: { dark: boolean }) {
  const win: CSSProperties = { position: "absolute", borderRadius: "clamp(12px,2.6vw,20px)", border: "1px solid var(--border)" };
  return (
    <section id="about" className="cl-s" style={{ padding: sectionPad, background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,440px),1fr))", gap: "clamp(36px,6vw,72px)", alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <span style={eyebrow}>About us</span>
            <h2 style={h2Style}>One platform Every leading AI model</h2>
            <p style={{ margin: 0, fontSize: 17, lineHeight: 1.55, color: "var(--muted)", textWrap: "pretty" }}>
              See which AI model is best for your task. No subscription juggling. No context switching.
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {ABOUT_POINTS.map(([icon, t]) => (
              <div key={t} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderTop: "1px solid var(--border)", minWidth: 0 }}>
                <span style={{ ...gradIcon, width: 40, height: 40, borderRadius: 12 }}>
                  <Ms name={icon} size={21} style={{ fontVariationSettings: "'FILL' 1,'wght' 400" }} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t}</span>
              </div>
            ))}
          </div>
          <Link href="/register" className="cl-solid" style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, height: 46, padding: "0 20px", borderRadius: 12, background: "var(--text)", color: "var(--bg)", fontSize: 14.5, fontWeight: 500 }}>
            Get started <Ms name="arrow_forward" size={18} />
          </Link>
        </div>

        <div style={{ position: "relative", width: "100%", maxWidth: 560, aspectRatio: "678/516", justifySelf: "center" }}>
          <div style={{ ...win, left: "47.20%", top: "12.40%", width: "39.53%", height: "73.45%", background: "var(--sunken)" }}>
            <div style={{ padding: "clamp(8px,2vw,14px) clamp(10px,2.4vw,18px)" }}><WinDots /></div>
          </div>
          <div style={{ ...win, left: "40.41%", top: "20.16%", width: "52.95%", height: "57.95%", background: "color-mix(in oklch,var(--surface) 88%,transparent)", boxShadow: "var(--pop)", backdropFilter: "blur(6px)" }}>
            <div style={{ padding: "clamp(8px,2vw,14px) clamp(10px,2.4vw,18px)" }}><WinDots /></div>
          </div>
          <div style={{ ...win, left: "43.95%", top: "27.13%", width: "45.72%", height: "44.19%", background: "var(--bg)" }} />
          <svg viewBox="0 0 678 516" preserveAspectRatio="none" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
            {ORBIT_LOGOS.map((o, i) => (
              <path key={`b${i}`} d={`M${ORBIT_X[i]} ${o.y} C ${ORBIT_C0X[i]} ${o.y}, 304 ${ORBIT_C1[i]}, 454 253`} fill="none" stroke="var(--border-strong)" strokeWidth="1.2" />
            ))}
            {ORBIT_LOGOS.map((o, i) => (
              <path key={`a${i}`} d={`M${ORBIT_X[i]} ${o.y} C ${ORBIT_C0X[i]} ${o.y}, 304 ${ORBIT_C1[i]}, 454 253`} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="14 420" style={{ animation: `cl-flow 3.2s linear ${(i * 0.45).toFixed(2)}s infinite` }} />
            ))}
          </svg>
          {ORBIT_LOGOS.map((o) => (
            <span key={o.k} style={{ position: "absolute", left: `${o.l}%`, top: `${o.t}%`, width: "7.67%", aspectRatio: "1/1", borderRadius: "22%", background: `#fff url(${logo(o.k)}) center/52% no-repeat`, border: "1px solid var(--border)", boxShadow: "var(--shadow)" }} />
          ))}
          <div style={{ position: "absolute", left: "59.59%", top: "39.34%", width: "14.75%", aspectRatio: "1/1", borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${A}/logos/colab-${dark ? "dark" : "light"}.webp`} alt="Colab" style={{ width: "68%", height: "auto" }} />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────
//  Features (sticky scroll-spy on desktop, snap carousel on mobile)
// ─────────────────────────────────────────────────────
const TABS: [string, string, string, string, string][] = [
  ["docs", "description", "Documents", "Turn notes and files into ready-to-share PDFs, slide decks, Word docs and Excel sheets in one step.", "Turn these call notes into a 10-slide deck"],
  ["images", "image", "Image Studio", "Create product shots, ads and social posts with top image models, then edit them right in the chat.", "A menu photo for our new café, warm natural light"],
  ["video", "movie", "Video Studio", "Make short clips for reels, ads and product demos from a simple prompt or your own reference images.", "Turn this product photo into a 5-second clip"],
  ["specialists", "support_agent", "Specialists", "Get help from expert advisors for legal, writing and finance, or build your own with your instructions.", "Flag the risky clauses in this shop lease"],
  ["agents", "smart_toy", "Agents", "Describe what you need and agents build working apps and websites, with live code and a preview.", "Build a booking page for my salon"],
  ["projects", "folder", "Projects", "Keep related chats, files and instructions together under one brief, so every answer has the context.", "Keep every launch chat and file in one place"],
];

const featImg = (k: string, theme: string) =>
  k === "video" ? `${A}/feat/video-${theme}-fix.png`
  : k === "agents" ? `${A}/feat/agent_${theme === "dark" ? "black" : "white"}_bg.png`
  : `${A}/feat/${k}-${theme}.webp`;

function Features({ theme, w }: { theme: string; w: number }) {
  const [tab, setTab] = useState(0);
  const stack = w < 1100;
  const small = w < 760;

  useEffect(() => {
    const on = () => {
      const els = document.querySelectorAll<HTMLElement>("[data-feat]");
      if (!els.length) return;
      const mid = window.innerHeight * 0.5;
      let best = 0;
      let bd = 1e9;
      els.forEach((el) => {
        const r = el.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bd) { bd = d; best = Number(el.dataset.feat); }
      });
      setTab(best);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  // Warm the desktop screenshots so the cross-fade never shows a blank frame.
  useEffect(() => {
    if (window.innerWidth < 1100) return;
    TABS.forEach(([k]) => { const im = new Image(); im.src = featImg(k, theme); });
  }, [theme]);

  const goTo = (i: number) => {
    const el = document.querySelector<HTMLElement>(`[data-feat="${i}"]`);
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top + el.offsetHeight / 2 - window.innerHeight / 2, behavior: "smooth" });
  };

  const bgPanel = `#1d1f27 url(${A}/media/working-bg.webp) center bottom/cover no-repeat`;

  return (
    <section id="features" className="cl-s" style={{ padding: sectionPad }}>
      <div style={{ maxWidth: 1460, margin: "0 auto", display: "flex", flexDirection: "column", gap: "clamp(24px,4vw,40px)" }}>
        <SectionHead label="Features" title="Everything you need in one platform" blurb="Write documents, create images and video, get expert help and build apps, all from the same chat." />
        <div style={{ display: "grid", gridTemplateColumns: stack ? "minmax(0,1fr)" : "minmax(0,0.7fr) minmax(0,1.5fr)", gap: "clamp(24px,3vw,40px)", alignItems: "start" }}>
          <div
            className="cl-noscroll"
            style={{
              display: "flex", flexDirection: stack ? "row" : "column", gap: stack ? 14 : 0, overflowX: stack ? "auto" : "visible",
              scrollSnapType: stack ? "x mandatory" : "none", margin: stack ? `0 calc(-1 * ${GUTTER})` : 0,
              padding: stack ? `4px ${GUTTER} 8px` : 0, scrollPaddingLeft: GUTTER,
            }}
          >
            {TABS.map(([k, icon, title, desc, ex], i) => (
              <div
                key={k}
                data-feat={i}
                style={{
                  flex: stack ? (small ? "0 0 86%" : "0 0 380px") : "0 0 auto", scrollSnapAlign: "start", minHeight: stack ? 0 : "62vh",
                  display: "flex", flexDirection: "column", justifyContent: stack ? "flex-start" : "center", gap: stack ? 14 : 18,
                  padding: stack ? 22 : 0, borderRadius: 24, border: stack ? "1px solid var(--border)" : 0, background: stack ? "var(--surface)" : "transparent",
                  opacity: stack || i === tab ? 1 : 0.5, transition: "opacity .4s ease",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ ...gradIcon, width: 44, height: 44, borderRadius: 13 }}>
                    <Ms name={icon} size={23} style={{ fontVariationSettings: "'FILL' 1" }} />
                  </span>
                  <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, color: "var(--faint)" }}>{String(i + 1).padStart(2, "0")} / 06</span>
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: "clamp(24px,2.8vw,34px)", lineHeight: 1.1, fontWeight: 600, letterSpacing: "-.03em" }}>{title}</h3>
                  <p style={{ margin: 0, maxWidth: 440, fontSize: 16.5, lineHeight: 1.55, color: "var(--muted)", textWrap: "pretty" }}>{desc}</p>
                </div>
                <span style={{ alignSelf: "flex-start", maxWidth: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px 10px 10px", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>
                  <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Ms name="keyboard_return" size={16} />
                  </span>
                  <span style={{ fontSize: 14, lineHeight: 1.4, textWrap: "pretty" }}>“{ex}”</span>
                </span>
                {stack && (
                  <div style={{ width: "100%", marginTop: "auto", padding: "22px 0 0", borderRadius: 18, background: bgPanel, display: "flex", justifyContent: "center", height: 260, overflow: "hidden" }}>
                    <div style={{ width: "62%", maxWidth: 220, alignSelf: "flex-start", aspectRatio: "390/700", borderRadius: 26, overflow: "hidden", border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 30px 60px -20px rgba(0,0,0,.6)", background: `var(--sunken) url(${A}/feat/m-${k}-${theme}.webp) 50% 0/cover no-repeat` }} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {!stack && (
            <div style={{ position: "sticky", top: "clamp(88px,12vh,120px)", display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ borderRadius: 22, padding: "clamp(16px,2vw,28px)", background: bgPanel, border: "1px solid var(--border)" }}>
                <div style={{ position: "relative", width: "100%", aspectRatio: "1056/660", borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 30px 60px -20px rgba(0,0,0,.6)", background: "var(--sunken)" }}>
                  {TABS.map(([k, , title], i) => (
                    <span
                      key={k}
                      role="img"
                      aria-label={`Colab AI ${title}`}
                      style={{ position: "absolute", inset: 0, backgroundImage: `url(${featImg(k, theme)})`, backgroundSize: k === "agents" ? "contain" : "cover", backgroundPosition: k === "agents" ? "center" : "left top", backgroundRepeat: "no-repeat", opacity: i === tab ? 1 : 0, transform: `scale(${i === tab ? 1 : 1.03})`, transition: "opacity .6s ease,transform .8s cubic-bezier(.2,.8,.2,1)" }}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {TABS.map(([k, , title], i) => (
                  <button key={k} onClick={() => goTo(i)} aria-label={title} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ height: 3, borderRadius: 2, background: i === tab ? "var(--accent)" : i < tab ? "color-mix(in oklch,var(--accent) 35%,var(--border))" : "var(--border)", transition: "background .3s" }} />
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: i === tab ? "var(--text)" : "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", transition: "color .3s" }}>{title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────
//  Benefits ("What you get")
// ─────────────────────────────────────────────────────
const pillStyle: CSSProperties = {
  position: "absolute", left: 12, top: 12, zIndex: 2, display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px 0 10px",
  borderRadius: 999, background: "var(--pill-bg)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
  border: "1px solid var(--ph-line)", fontSize: 12, fontWeight: 500, color: "var(--ph-text)",
};
const stageStyle: CSSProperties = {
  margin: "10px 10px 0", height: "clamp(300px,28vw,330px)", borderRadius: 18,
  background: "radial-gradient(60% 60% at 50% 40%,rgba(150,119,255,.18),transparent 70%),var(--vp)", border: "1px solid var(--vp-line)",
  display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative",
};
const phoneStyle: CSSProperties = {
  position: "absolute", left: "50%", top: 56, transform: "translateX(-50%)", width: "min(80%,240px)", borderRadius: "30px 30px 0 0",
  background: "var(--ph)", border: "1px solid var(--ph-line)", borderBottom: "none", padding: "14px 14px 0", display: "flex", flexDirection: "column",
  gap: 9, color: "var(--ph-text)", WebkitMaskImage: "linear-gradient(#000 80%,transparent)", maskImage: "linear-gradient(#000 80%,transparent)",
  height: "calc(100% - 56px)", overflow: "hidden", boxShadow: "0 0 60px -10px rgba(150,119,255,.35)",
};

function BenefitCard({ pill, kicker, title, text, children }: { pill: string; kicker: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="cl-card" style={{ scrollSnapAlign: "start", display: "flex", flexDirection: "column", minWidth: 0, borderRadius: 24, background: "var(--surface)", border: "1px solid var(--border)", overflow: "hidden" }}>
      <div style={stageStyle}>
        {children}
        <span style={pillStyle}><Ms name="auto_awesome" size={14} style={{ color: "var(--accent)" }} />{pill}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "clamp(22px,2.4vw,30px) clamp(22px,2.4vw,30px) clamp(26px,2.8vw,34px)" }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--accent)" }}>{kicker}</span>
        <h3 style={{ margin: 0, fontSize: "clamp(21px,2vw,25px)", lineHeight: 1.15, fontWeight: 600, letterSpacing: "-.025em", textWrap: "balance" }}>{title}</h3>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty" }}>{text}</p>
      </div>
    </div>
  );
}

const SPIN_LOGOS: [string, number, number, number][] = [
  ["deepseek", 62, 18, 17], ["gemini", 84, 44, 17], ["perplexity", 72, 70, 12],
  ["openai", 44, 80, 12], ["anthropic", 18, 52, 14], ["mistral", 28, 24, 10],
];

function Benefits({ dark, w }: { dark: boolean; w: number }) {
  const grid = w >= 900;
  const mark = `${A}/logos/colab-mark-${dark ? "dark" : "light"}.png`;
  return (
    <section id="benefits" className="cl-s" style={{ padding: sectionPad }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: "clamp(28px,4vw,44px)" }}>
        <SectionHead label="What you get" title="Ask once. Get answers from every AI model." blurb="Colab AI finds the right context, helps you take the next step and improves how work gets done." />
        <div
          className="cl-noscroll"
          style={{
            display: "grid", gridTemplateColumns: grid ? "repeat(3,minmax(0,1fr))" : "none", gridAutoFlow: grid ? "row" : "column",
            gridAutoColumns: grid ? "auto" : w < 600 ? "84%" : "340px", gap: 16, overflowX: grid ? "visible" : "auto",
            margin: grid ? 0 : `0 calc(-1 * ${GUTTER})`, padding: grid ? "8px 0 0" : `12px ${GUTTER} 8px`,
            scrollSnapType: grid ? "none" : "x mandatory", scrollPaddingLeft: 16,
          }}
        >
          <BenefitCard pill="One source of truth" kicker="Shared context" title="30+ AI models. Always growing." text="Every answer starts with the right context.">
            <div style={{ position: "relative", height: "76%", aspectRatio: "1/1", marginTop: "10%" }}>
              <div style={{ position: "absolute", inset: "14%", borderRadius: "50%", border: "1px dashed var(--ph-line)" }} />
              <div style={{ position: "absolute", inset: 0, animation: "cl-spin 40s linear infinite" }}>
                {SPIN_LOGOS.map(([k, l, t, s]) => (
                  <span key={k} style={{ position: "absolute", left: `${l}%`, top: `${t}%`, width: `${s}%`, aspectRatio: "1/1", transform: "translate(-50%,-50%)" }}>
                    <span style={{ display: "block", width: "100%", height: "100%", borderRadius: "50%", background: `#fff url(${logo(k)}) center/50% no-repeat`, boxShadow: "0 10px 24px -8px rgba(0,0,0,.6)", animation: "cl-spinr 40s linear infinite" }} />
                  </span>
                ))}
              </div>
              <span style={{ position: "absolute", left: "50%", top: "50%", width: "28%", aspectRatio: "1/1", transform: "translate(-50%,-50%)", borderRadius: "50%", background: "var(--ph)", border: "1px solid var(--ph-line)", boxShadow: "0 0 0 8px rgba(150,119,255,.08),0 0 48px rgba(150,119,255,.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mark} alt="" style={{ width: "56%", height: "auto" }} />
              </span>
            </div>
          </BenefitCard>

          <BenefitCard pill="Question to action" kicker="Instant action" title="Instant answers. Under 2 seconds." text="Move work forward without switching tools.">
            <div style={phoneStyle}>
              <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Ms name="menu" size={18} style={{ color: "var(--ph-muted)" }} />
                <span style={{ flex: 1 }} />
                <Ms name="notifications" size={16} style={{ color: "var(--ph-muted)" }} />
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#6A45D9", color: "#fff", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>J</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--ph-muted)" }}><span style={{ width: 20, height: 20, borderRadius: 6, background: "#fff", border: "1px solid var(--ph-line)", display: "flex", alignItems: "center", justifyContent: "center" }}><img src="/icons/Colab%20Infinite.png" alt="" style={{ width: 17, height: "auto" }} /></span>Hi Jennie</span>
                <span style={{ fontSize: 18, lineHeight: 1.2, fontWeight: 600, letterSpacing: "-.02em" }}>What’s on your mind today?</span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 8, padding: 9, borderRadius: 14, background: "var(--ph-in)", border: "1px solid color-mix(in oklch,var(--accent) 40%,var(--ph-line))", boxShadow: "0 0 0 3px rgba(150,119,255,.12)" }}>
                <span style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px 0 3px", borderRadius: 999, background: "rgba(74,190,130,.14)", color: "var(--ok)", fontSize: 10.5, fontWeight: 600 }}>
                  <span style={{ width: 15, height: 15, borderRadius: "50%", background: `#fff url(${logo("openai")}) center/9px no-repeat` }} />GPT-5.4
                </span>
                <span style={{ display: "flex", alignItems: "center", fontSize: 12, color: "var(--ph-text)", whiteSpace: "nowrap", overflow: "hidden" }}>
                  <span style={{ display: "inline-block", overflow: "hidden", whiteSpace: "nowrap", animation: "cl-type 5s steps(24) infinite" }}>Summarise this report…</span>
                  <span style={{ width: 1.5, height: 13, marginLeft: 1, background: "var(--accent)", animation: "cl-blink 1s infinite" }} />
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Ms name="add" size={15} style={{ color: "var(--ph-muted)" }} />
                  <span style={{ flex: 1 }} />
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}><Ms name="arrow_upward" size={13} style={{ color: "#fff" }} /></span>
                </span>
              </span>
            </div>
          </BenefitCard>

          <BenefitCard pill="Clear signals" kicker="Continuous insight" title="See every message. Control every rupee." text="Know what you have used and what is left.">
            <div style={phoneStyle}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-.02em" }}>Usage</span>
                <span style={{ fontSize: 11.5, color: "var(--ph-muted)" }}>Track your messages and plan</span>
              </span>
              <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[["chat", "var(--ok)", "188", "Left", "0s"], ["trending_up", "var(--accent)", "612", "Used", "1.2s"]].map(([ic, c, n, l, d]) => (
                  <span key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "12px 6px", borderRadius: 12, background: "var(--ph-in)", border: "1px solid var(--ph-line)" }}>
                    <Ms name={ic} size={17} style={{ color: c, animation: `cl-bob 2.4s ease-in-out ${d} infinite` }} />
                    <span style={{ fontSize: 21, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{n}</span>
                    <span style={{ fontSize: 10.5, color: "var(--ph-faint)" }}>{l}</span>
                  </span>
                ))}
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: 7, padding: 12, borderRadius: 12, background: "var(--ph-in)", border: "1px solid var(--ph-line)" }}>
                <span style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, fontWeight: 600 }}>Usage progress<span style={{ color: "var(--ph-faint)", fontWeight: 500 }}>76%</span></span>
                <span style={{ height: 6, borderRadius: 3, background: "var(--ph-line)", overflow: "hidden" }}>
                  <span style={{ position: "relative", display: "block", width: "76%", height: "100%", borderRadius: 3, background: "linear-gradient(90deg,#6A45D9,var(--accent))", transformOrigin: "left", overflow: "hidden", animation: "cl-fill 5s cubic-bezier(.45,0,.2,1) infinite" }}>
                    <span style={{ position: "absolute", inset: 0, width: "45%", background: "linear-gradient(90deg,transparent,rgba(255,255,255,.65),transparent)", animation: "cl-sheen 5s ease-in-out infinite" }} />
                  </span>
                </span>
              </span>
            </div>
          </BenefitCard>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────
//  Testimonials
// ─────────────────────────────────────────────────────
const REVIEWS: [string, string, string, string, string][] = [
  ["Rolling context windows mean I never lose details during research sessions. Highly recommended for any engineering or design team.", "Briana Patton", "Product Owner, FlowState", "BP", "oklch(0.58 0.19 290)"],
  ["Attaching code/wireframes and getting feedback from three different models side-by-side saves us hours of iteration every single day.", "Elena Rostova", "Lead Designer, Vertex", "ER", "oklch(0.6 0.14 255)"],
  ["One plan for every AI model solved all our subscription headaches. Our developers are 2x more productive with Colab AI.", "Omar Raza", "CTO, NexusDev", "OR", "oklch(0.62 0.15 160)"],
];

function Testimonials({ w }: { w: number }) {
  const sm = w < 760;
  const copies = sm ? [0] : [0, 1, 2, 3];
  return (
    <section id="testimonials" className="cl-s" style={{ padding: "clamp(56px,9vw,110px) 0", background: "var(--surface)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "clamp(28px,4vw,44px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", padding: `0 ${GUTTER}` }}>
          <span style={eyebrow}>Testimonials</span>
          <h2 style={{ ...h2Style, maxWidth: 720, fontSize: "clamp(30px,4.4vw,50px)" }}>Loved by people who think with AI</h2>
        </div>
        <div
          className="cl-noscroll"
          style={{
            position: "relative", overflowX: sm ? "auto" : "hidden", overflowY: "hidden", scrollSnapType: sm ? "x mandatory" : "none",
            scrollPaddingLeft: GUTTER, padding: sm ? `0 ${GUTTER} 8px` : 0,
            WebkitMaskImage: sm ? "none" : "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)",
            maskImage: sm ? "none" : "linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)",
          }}
        >
          <div style={{ display: "flex", width: "max-content", animation: sm ? "none" : "cl-marq 45s linear infinite" }}>
            {copies.flatMap((d) =>
              REVIEWS.map(([q, name, role, i, bg]) => (
                <figure key={`${d}-${name}`} aria-hidden={d ? true : undefined} style={{ scrollSnapAlign: "start", margin: "0 16px 0 0", width: w < 600 ? 300 : 380, flexShrink: 0, display: "flex", flexDirection: "column", gap: 18, padding: 26, borderRadius: 24, background: "var(--bg)", border: "1px solid var(--border)" }}>
                  <span style={{ display: "flex", gap: 1, color: "#F2B64B" }}>
                    {[0, 1, 2, 3, 4].map((s) => <Ms key={s} name="star" size={18} style={{ fontVariationSettings: "'FILL' 1" }} />)}
                  </span>
                  <blockquote style={{ margin: 0, flex: 1, fontSize: 16, lineHeight: 1.55, textWrap: "pretty" }}>“{q}”</blockquote>
                  <figcaption style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 18, borderTop: "1px solid var(--border)" }}>
                    <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: "50%", background: bg, color: "#fff", fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{i}</span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{name}</span>
                      <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{role}</span>
                    </span>
                  </figcaption>
                </figure>
              )),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────
//  Pricing — live plans from the API, monthly/yearly toggle, same checkout routes
// ─────────────────────────────────────────────────────
interface PlanTier {
  id: number;
  name: string;
  price: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  isPopular: boolean;
  isFree: boolean;
}

// Fallback / default data (in case API is empty/fails)
const FALLBACK_PLANS: PlanTier[] = [
  {
    id: 1, name: "Free", price: 0, yearlyPrice: 0, description: "Get started at no cost for your first month.",
    features: ["Unlimited AI Models", "File Uploads & Attachments", "Community Support", "50,000 monthly tokens"], isPopular: false, isFree: true,
  },
  {
    id: 2, name: "Plus", price: 1799, yearlyPrice: 17988, description: "Ideal for Plus users.",
    features: ["Unlimited AI Models", "File Uploads & Attachments", "Priority Support", "10,00,000 monthly tokens"], isPopular: true, isFree: false,
  },
  {
    id: 3, name: "Pro", price: 3699, yearlyPrice: 35988, description: "Ideal for Pro users.",
    features: ["Unlimited AI Models", "File Uploads & Attachments", "Priority Plus Support", "20,00,000 monthly tokens"], isPopular: false, isFree: false,
  },
];

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

function Pricing({ w }: { w: number }) {
  const { user } = useAuth();
  const [plans, setPlans] = useState<PlanTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const carRef = useRef<HTMLDivElement>(null);
  const wide = w >= 1040;

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const response = await planService.list({ page: "1", pageSize: "100" });

        if (!response.data.status) {
          setPlans(FALLBACK_PLANS);
          return;
        }

        const outer = response.data.data;
        const planList: any[] = Array.isArray(outer) ? outer : Array.isArray(outer?.data) ? outer.data : outer?.records ?? [];

        const activePlans = planList.filter((plan: any) => plan.isActive && !plan.isDeleted);
        // The entry-level PAID plan is "Most Popular", whatever it happens to
        // be named — matching on the literal name "pro" broke the moment a
        // plan got renamed.
        const cheapestPaidPrice = Math.min(
          ...activePlans.map((plan: any) => Number(plan.monthlyPrice)).filter((price: number) => price > 0),
        );

        const parsed: PlanTier[] = activePlans
          .sort((a: any, b: any) => Number(a.monthlyPrice) - Number(b.monthlyPrice))
          .map((plan: any) => {
            // Shared parser (lib/planFeatures.ts) also used by the real
            // subscription page, so marketing copy stays in sync with what a
            // subscriber actually gets.
            const features = getPlanFeatureLines(plan).included;
            const isFree = Number(plan.monthlyPrice) === 0;
            return {
              id: plan.id,
              name: plan.name,
              price: Number(plan.monthlyPrice),
              yearlyPrice: Number(plan.yearlyPrice ?? 0),
              description: plan.description || (isFree ? "Get started at no cost for your first month." : `Ideal for ${plan.name} users.`),
              features,
              isPopular: !isFree && Number(plan.monthlyPrice) === cheapestPaidPrice,
              isFree,
            };
          });

        setPlans(parsed.length === 0 ? FALLBACK_PLANS : parsed);
      } catch (err) {
        console.error("Error fetching pricing plans in new landing:", err);
        setPlans(FALLBACK_PLANS);
      } finally {
        setLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const hasYearly = plans.some((p) => !p.isFree && p.yearlyPrice > 0);

  const getPlanHref = (plan: PlanTier) => {
    const planCycle = !plan.isFree && cycle === "YEARLY" && plan.yearlyPrice > 0 ? "YEARLY" : "MONTHLY";
    const target = `/profile/subscription?planId=${plan.id}&billingCycle=${planCycle}`;
    if (user) return target;
    return `/login?redirect=${encodeURIComponent(target)}`;
  };

  const getPriceDetails = (plan: PlanTier) => {
    if (plan.isFree) return { amount: "Free", period: "", billed: "No card needed", strike: "", save: "" };

    if (cycle === "YEARLY" && plan.yearlyPrice > 0) {
      const saved = plan.price * 12 - plan.yearlyPrice;
      return {
        amount: inr(Math.round(plan.yearlyPrice / 12)),
        period: "/month + GST",
        strike: saved > 0 ? inr(plan.price) : "",
        billed: `Billed ${inr(plan.yearlyPrice)} per year + GST. Tokens added monthly.`,
        save: saved > 0 ? inr(saved) : "",
      };
    }

    return { amount: inr(plan.price), period: "/month + GST", strike: "", billed: "Billed monthly + GST", save: "" };
  };

  // Ensure we have at least Free, popular and a higher tier mapped
  const ordered: PlanTier[] = loading
    ? []
    : [
        plans.find((p) => p.isFree) || FALLBACK_PLANS[0],
        plans.find((p) => p.isPopular) || FALLBACK_PLANS[1],
        plans.find((p) => !p.isFree && !p.isPopular) || FALLBACK_PLANS[2],
      ];

  // On narrow screens the carousel opens centred on the highlighted plan.
  const centerPopular = useCallback(() => {
    const c = carRef.current;
    if (!c || c.scrollWidth <= c.clientWidth + 4) return;
    const k = c.children[1] as HTMLElement | undefined;
    if (!k) return;
    const snap = c.style.scrollSnapType;
    c.style.scrollSnapType = "none";
    c.scrollLeft = Math.max(0, Math.min(k.offsetLeft - (c.clientWidth - k.offsetWidth) / 2, c.scrollWidth - c.clientWidth));
    requestAnimationFrame(() => { c.style.scrollSnapType = snap; });
  }, []);

  useEffect(() => {
    if (loading) return;
    requestAnimationFrame(() => requestAnimationFrame(centerPopular));
    const t = setTimeout(centerPopular, 600);
    return () => clearTimeout(t);
  }, [loading, wide, centerPopular]);

  if (loading) {
    return (
      <section id="pricing" className="cl-s" style={{ padding: sectionPad }}>
        <div style={{ minHeight: 400, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <Loader2 className="animate-spin" style={{ width: 32, height: 32, color: "var(--accent)" }} />
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>Loading plans…</p>
        </div>
      </section>
    );
  }

  return (
    <section id="pricing" className="cl-s" style={{ padding: sectionPad }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: "clamp(28px,4vw,44px)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center", textAlign: "center" }}>
          <span style={eyebrow}>Pricing</span>
          <h2 style={{ ...h2Style, maxWidth: 720, fontSize: "clamp(32px,4.6vw,52px)", lineHeight: 1.1 }}>Clear pricing plans that scale with you</h2>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 17, lineHeight: 1.55, color: "var(--muted)", textWrap: "pretty" }}>
            Every AI model, plus project folders, context memory and exports to PDF, Word and Excel. Prices shown exclude 18% GST, added at checkout.
          </p>
          {hasYearly && (
            <div role="tablist" aria-label="Billing period" style={{ marginTop: 6, display: "flex", gap: 4, padding: 4, borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)" }}>
              {(["MONTHLY", "YEARLY"] as const).map((c) => {
                const on = cycle === c;
                return (
                  <button
                    key={c}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setCycle(c)}
                    style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: c === "YEARLY" ? "0 8px 0 20px" : "0 20px", border: 0, borderRadius: 999, background: on ? "var(--text)" : "transparent", color: on ? "var(--bg)" : "var(--muted)", fontSize: 14.5, fontWeight: 500, cursor: "pointer", transition: "background .2s,color .2s" }}
                  >
                    {c === "MONTHLY" ? "Monthly" : "Yearly"}
                    {c === "YEARLY" && (
                      <span style={{ height: 24, padding: "0 9px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-ink)", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center" }}>Up to 20% off</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ position: "relative" }}>
          {wide && <div style={{ position: "absolute", left: 0, right: 0, top: 32, bottom: 32, borderRadius: 28, background: "var(--surface)", border: "1px solid var(--border)" }} />}
          <div
            ref={carRef}
            className="cl-noscroll"
            style={{
              position: "relative", display: "grid", gridTemplateColumns: wide ? "repeat(3,minmax(0,1fr))" : "none", gap: wide ? 0 : 16, alignItems: "stretch",
              gridAutoFlow: wide ? "row" : "column", gridAutoColumns: wide ? "auto" : w < 600 ? "86%" : "360px", overflowX: wide ? "visible" : "auto",
              margin: wide ? 0 : `0 calc(-1 * ${GUTTER})`, padding: wide ? 0 : `16px ${GUTTER} 8px`, scrollPaddingLeft: GUTTER, scrollSnapType: wide ? "none" : "x mandatory",
            }}
          >
            {ordered.map((plan, idx) => {
              const ft = idx === 1;
              const d = getPriceDetails(plan);
              const label = plan.isFree ? "Free" : `${plan.name} plan`;
              const cta = plan.isFree ? "Start Free" : ft ? `Get Started - ${plan.name}` : `Choose ${plan.name}`;
              return (
                <div
                  key={`${plan.id}-${idx}`}
                  style={{
                    position: "relative", scrollSnapAlign: "start", display: "flex", flexDirection: "column",
                    padding: wide ? (ft ? "56px 40px 48px" : "88px 48px 80px") : "32px 24px", borderRadius: ft || !wide ? 24 : 0,
                    background: ft || !wide ? "var(--surface)" : "transparent",
                    border: ft ? "1.5px solid var(--accent)" : wide ? 0 : "1px solid var(--border)",
                    boxShadow: ft ? "0 28px 56px -28px color-mix(in oklch,var(--accent) 45%,transparent), 0 2px 8px rgba(24,22,29,.05)" : "none",
                    color: "var(--text)", minWidth: 0,
                  }}
                >
                  {ft && (
                    <span style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", height: 26, padding: "0 12px", borderRadius: 999, background: "var(--surface)", border: "1px solid var(--accent)", color: "var(--accent)", fontSize: 11.5, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>
                      <Ms name="auto_awesome" size={14} />Most popular
                    </span>
                  )}
                  <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: ft ? "var(--accent)" : "var(--muted)" }}>{label}</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 18, whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: "clamp(40px,4.4vw,50px)", lineHeight: 1, fontWeight: 700, letterSpacing: "-.035em", fontVariantNumeric: "tabular-nums" }}>{d.amount}</span>
                    {d.period && <span style={{ fontSize: 14.5, color: "var(--muted)" }}>{d.period}</span>}
                    {d.strike && <s style={{ fontSize: 16, color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>{d.strike}</s>}
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, marginTop: 10, minHeight: 52 }}>
                    <span style={{ fontSize: 13.5, lineHeight: "20px", color: "var(--muted)" }}>{d.billed}</span>
                    {d.save && (
                      <span style={{ height: 24, padding: "0 9px", borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent-ink)", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center" }}>Save {d.save} a year</span>
                    )}
                  </span>
                  <span style={{ marginTop: 16, fontSize: 14.5, lineHeight: 1.5, color: "var(--muted)", textWrap: "pretty", minHeight: 44 }}>{plan.description}</span>
                  <Link
                    href={getPlanHref(plan)}
                    className="cl-fade"
                    style={{ marginTop: 24, display: "flex", alignItems: "center", justifyContent: "center", height: 46, borderRadius: 999, background: ft ? "var(--text)" : "var(--sunken)", color: ft ? "var(--bg)" : "var(--text)", border: `1px solid ${ft ? "var(--text)" : "var(--border)"}`, fontSize: 14.5, fontWeight: 500 }}
                  >
                    {cta}
                  </Link>
                  <div style={{ margin: `${wide ? 56 : 28}px 0 28px`, height: 1, background: ft ? "color-mix(in oklch,var(--accent) 30%,transparent)" : "var(--border)" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {plan.features.map((f, i) => (
                      <span key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <span style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, borderRadius: "50%", background: "var(--text)", color: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Ms name="check" size={15} style={{ fontWeight: 600 }} />
                        </span>
                        <span style={{ fontSize: 14.5, lineHeight: 1.4 }}>{f}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px 32px", marginBottom: 10 }}>
            {[["lock", "Secure payments by Cashfree"], ["event_repeat", "Cancel anytime"], ["receipt_long", "GST invoice with every payment"], ["shield_lock", "No training on your data"]].map(([ic, t]) => (
              <span key={t} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14.5, fontWeight: 500 }}>
                <Ms name={ic} size={19} style={{ color: "var(--accent)" }} />{t}
              </span>
            ))}
          </div>
          <p style={{ margin: 0, maxWidth: 680, fontSize: 14, lineHeight: 1.65, color: "var(--muted)", textWrap: "pretty" }}>
            By subscribing, you agree to our{" "}
            <Link href="/terms" style={{ color: "var(--text)", textDecoration: "underline", textUnderlineOffset: 3 }}>Terms of Use</Link>
            . Higher-tier models draw down your tokens faster via a disclosed per-model multiplier, so please read the Terms carefully for full billing details before you pay.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────
//  FAQ
// ─────────────────────────────────────────────────────
const FAQ_DATA: [string, [string, string][]][] = [
  ["General", [
    ["How does Colab AI work?", "Pick one or more AI models, type your message and get answers in one chat. In Multi mode, each model you choose answers the same prompt side by side so you can compare them."],
    ["Is there a free trial available?", "Yes. The Free plan gives you every AI model with about 40 messages a month. No card needed."],
    ["Who is Colab AI built for?", "Anyone who uses AI for work or study, from writers and students to founders, marketers and developers. Teams can use Colab AI for Business."],
    ["Can I use multiple AI models at the same time?", "Yes. Switch to Multi mode, pick the models you want, and each one answers the same prompt in its own column."],
    ["Can I switch plans later?", "Yes. You can move between Free, Plus and Pro from Settings. Changes start from your next billing cycle."],
    ["Does Colab AI work for solo users?", "Yes. Free, Plus and Pro are individual plans. You don’t need a team to sign up."],
  ]],
  ["AI Capabilities", [
    ["Which AI models are included?", "Models from OpenAI, Anthropic, Google, DeepSeek, Mistral, Perplexity, Qwen and more, plus image and video models. New models are added as they launch."],
    ["Can Colab AI create images and videos?", "Yes, on Plus and Pro. Image Studio and Video Studio use top image and video models from a prompt or your own reference images."],
    ["Can it search the web?", "Yes. Web search gives live answers with links to the sources it used."],
    ["Can it make documents?", "Yes. Turn notes and files into PDFs, Word documents, PowerPoint decks and Excel sheets."],
  ]],
  ["Integration & Security", [
    ["Is my data used to train AI models?", "No. Your chats and files are not used to train AI models."],
    ["How do I pay?", "In rupees through Cashfree. Every payment comes with a GST invoice."],
    ["Can I use Colab AI on my phone?", "Yes. Colab AI works in your phone’s browser with the same features as desktop."],
    ["Is there a plan for teams?", "Yes. Colab AI for Business adds admin controls, model access settings and one GST invoice for the whole team."],
  ]],
];

function FAQ() {
  const [tab, setTab] = useState(0);
  const [open, setOpen] = useState(0);
  const items = FAQ_DATA[tab][1];
  return (
    <section id="faq" className="cl-s" style={{ padding: sectionPad }}>
      <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", flexDirection: "column", gap: 28 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center" }}>
          <span style={eyebrow}>FAQ</span>
          <h2 style={{ ...h2Style, fontSize: "clamp(30px,4.4vw,50px)" }}>Answers to the questions that come up most.</h2>
        </div>
        <div className="cl-noscroll" style={{ display: "flex", justifyContent: "center", gap: 6, overflowX: "auto", margin: "0 -16px", padding: "2px 16px" }}>
          {FAQ_DATA.map(([label], i) => {
            const on = i === tab;
            return (
              <button key={label} onClick={() => { setTab(i); setOpen(0); }} style={{ flexShrink: 0, height: 42, padding: "0 16px", borderRadius: 999, border: `1px solid ${on ? "var(--text)" : "var(--border)"}`, background: on ? "var(--text)" : "var(--surface)", color: on ? "var(--bg)" : "var(--text)", fontSize: 14, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div key={q} style={{ borderBottom: "1px solid var(--border)" }}>
                <button onClick={() => setOpen(isOpen ? -1 : i)} aria-expanded={isOpen} style={{ width: "100%", display: "flex", alignItems: "center", gap: 16, minHeight: 64, padding: "16px 0", border: "none", background: "transparent", color: "var(--text)", fontSize: 17, fontWeight: 500, textAlign: "left", cursor: "pointer" }}>
                  <span style={{ flex: 1 }}>{q}</span>
                  <Ms name="add" size={22} style={{ color: "var(--muted)", transform: `rotate(${isOpen ? 45 : 0}deg)`, transition: "transform .25s" }} />
                </button>
                {isOpen && <p style={{ margin: 0, padding: "0 40px 20px 0", fontSize: 15.5, lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty" }}>{a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────
//  CTA band
// ─────────────────────────────────────────────────────
function CTA() {
  return (
    <section className="cl-s" style={{ padding: `0 ${GUTTER} clamp(48px,7vw,80px)` }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", borderRadius: 32, background: "var(--inv)", border: "1px solid var(--inv-border)", color: "var(--inv-fg)", padding: "clamp(56px,8vw,104px) clamp(22px,5vw,64px)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "clamp(28px,3vw,36px)", position: "relative", overflow: "hidden", isolation: "isolate" }}>
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: -1, backgroundImage: "linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px)", backgroundSize: "44px 44px", WebkitMaskImage: "radial-gradient(60% 70% at 50% 100%,#000 0%,transparent 100%)", maskImage: "radial-gradient(60% 70% at 50% 100%,#000 0%,transparent 100%)" }} />
        <div aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: -260, width: "min(900px,140%)", height: 480, transform: "translateX(-50%)", zIndex: -1, borderRadius: "50%", background: "radial-gradient(closest-side,rgba(150,119,255,.55),rgba(150,119,255,.18) 55%,rgba(150,119,255,0) 100%)", pointerEvents: "none" }} />
        <div aria-hidden="true" style={{ position: "absolute", left: "15%", right: "15%", top: 0, height: 1, background: "linear-gradient(90deg,transparent,rgba(190,170,255,.7),transparent)" }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 680 }}>
          <h2 style={{ margin: 0, fontSize: "clamp(32px,5vw,58px)", lineHeight: 1.04, fontWeight: 600, letterSpacing: "-.04em", textWrap: "balance" }}>Every top AI model. One login.</h2>
          <p style={{ margin: 0, fontSize: "clamp(16px,1.6vw,18px)", lineHeight: 1.55, color: "var(--inv-muted)", textWrap: "pretty" }}>
            Chat with ChatGPT, Claude, Gemini and more side by side, keep one memory across every model, and pay for a single plan. Start free. No card needed.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
          <Link href="/register" className="cl-white" style={{ display: "flex", alignItems: "center", gap: 8, height: 52, padding: "0 26px", borderRadius: 13, background: "#fff", color: "#18161D", fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 8px 28px -8px rgba(150,119,255,.7)", transition: "background .2s" }}>
            Get Started <Ms name="north_east" size={19} />
          </Link>
          <a href="#pricing" className="cl-ghost-inv" style={{ display: "flex", alignItems: "center", height: 52, padding: "0 24px", borderRadius: 13, background: "rgba(255,255,255,.06)", border: "1.5px solid rgba(255,255,255,.28)", color: "#fff", fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", transition: "background .2s,border-color .2s" }}>
            See pricing
          </a>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────
//  Footer
// ─────────────────────────────────────────────────────
const FOOTER_SECTIONS: { title: string; links: { label: string; href: string }[] }[] = [
  { title: "Product", links: [{ label: "Home", href: "/" }, { label: "About", href: "#about" }, { label: "Pricing", href: "#pricing" }, { label: "Business", href: "/business" }, { label: "Get started", href: "/login" }] },
  { title: "Company", links: [{ label: "About", href: "#about" }, { label: "Careers", href: "#" }, { label: "Blog", href: "#" }] },
  { title: "Legal", links: [{ label: "Terms of use", href: "/terms" }, { label: "Privacy policy", href: "/privacy-policy" }, { label: "Cookie policy", href: "/cookie-policy" }] },
  { title: "Support", links: [{ label: "Help & Support", href: "/support" }, { label: "Raise a ticket", href: "/support" }, { label: "Contact us", href: "/support" }] },
];

const SOCIALS = [
  { n: "Facebook", href: "https://facebook.com", d: "M14 8.5V6.6c0-.8.2-1.3 1.4-1.3H17V2.2c-.3 0-1.3-.2-2.5-.2C12 2 10.4 3.5 10.4 6.2v2.3H7.7v3.4h2.7V22H14V11.9h2.7l.4-3.4H14z" },
  { n: "LinkedIn", href: "https://linkedin.com", d: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4V21H3V9.75zm6.5 0h3.8v1.6h.06c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.77 2.5 4.77 5.76V21h-4v-5.1c0-1.22-.02-2.79-1.74-2.79-1.74 0-2.01 1.33-2.01 2.7V21H9.5V9.75z" },
  { n: "X", href: "https://x.com", d: "M17.75 3h3.07l-6.7 7.65L22 21h-6.17l-4.83-6.3L5.47 21H2.4l7.17-8.18L2 3h6.33l4.36 5.77L17.75 3zm-1.08 16.2h1.7L7.4 4.73H5.58L16.67 19.2z" },
  { n: "Instagram", href: "https://instagram.com", d: "M12 7.2a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2zM17.1 5.8a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2zM21.9 7.9c-.1-1.6-.4-3-1.6-4.2S17.7 2.2 16.1 2.1c-1.6-.1-6.6-.1-8.2 0-1.6.1-3 .4-4.2 1.6S2.2 6.3 2.1 7.9c-.1 1.6-.1 6.6 0 8.2.1 1.6.4 3 1.6 4.2s2.6 1.5 4.2 1.6c1.6.1 6.6.1 8.2 0 1.6-.1 3-.4 4.2-1.6s1.5-2.6 1.6-4.2c.1-1.6.1-6.6 0-8.2zM20 17.8a3.2 3.2 0 0 1-1.8 1.8c-1.3.5-4.3.4-5.7.4s-4.4.1-5.7-.4A3.2 3.2 0 0 1 5 17.8c-.5-1.3-.4-4.3-.4-5.7s-.1-4.4.4-5.7A3.2 3.2 0 0 1 6.8 4.6c1.3-.5 4.3-.4 5.7-.4s4.4-.1 5.7.4A3.2 3.2 0 0 1 20 6.4c.5 1.3.4 4.3.4 5.7s.1 4.4-.4 5.7z" },
];

function Footer({ w }: { w: number }) {
  const wide = w >= 900;
  return (
    <footer className="cl-s" style={{ position: "relative", overflow: "hidden", background: "#0A0A0D", color: "#EDEBF2", borderTop: "1px solid #1A1920" }}>
      <div style={{ position: "relative", zIndex: 1, maxWidth: 1264, margin: "0 auto", padding: `clamp(56px,8vw,112px) ${GUTTER} 0`, display: "flex", flexDirection: "column", gap: "clamp(48px,6vw,80px)" }}>
        <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,2fr) repeat(4,minmax(0,1fr))" : "repeat(2,minmax(0,1fr))", gap: "40px 32px" }}>
          <div style={{ gridColumn: wide ? "auto" : "1 / -1", display: "flex", flexDirection: "column", gap: 18, maxWidth: 300 }}>
            <Link href="/" style={{ alignSelf: "flex-start" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${A}/logos/colab-dark.webp`} alt="Colab" style={{ height: 48, width: "auto" }} />
            </Link>
            <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "#A8A4B3", textWrap: "pretty" }}>
              Colab Platforms is an advanced AI chatbot platform enabling simultaneous chat with multiple LLM models.
            </span>
          </div>
          {FOOTER_SECTIONS.map((s) => (
            <div key={s.title} style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 12.5, fontWeight: 500, letterSpacing: ".08em", textTransform: "uppercase", color: "#8E8A99", marginBottom: 8 }}>{s.title}</span>
              {s.links.map((l) => (
                <Link key={l.label} href={l.href} className="cl-flink" style={{ display: "flex", alignItems: "center", minHeight: 38, fontSize: 14.5, color: "#E4E2EA" }}>{l.label}</Link>
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <span style={{ fontSize: 13, color: "#8E8A99" }}>© Colab AI, Inc., 2026. All rights reserved</span>
          <div style={{ display: "flex", gap: 4, marginRight: -10 }}>
            {SOCIALS.map((s) => (
              <a key={s.n} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.n} className="cl-flink" style={{ width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center", color: "#8E8A99", transition: "color .2s" }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={s.d} /></svg>
              </a>
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden="true" style={{ position: "relative", height: "max(10vw,92px)", marginTop: "clamp(32px,4vw,56px)", overflow: "hidden", pointerEvents: "none" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${A}/media/footer-bg.webp`} alt="" style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", minWidth: 900, height: "auto", display: "block", userSelect: "none" }} />
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────
//  Page
// ─────────────────────────────────────────────────────
export function NewLandingPage() {
  const { theme } = useTheme();
  const w = useWidth();
  const dark = theme === "dark";

  return (
    <SmoothScrollLayout>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..500,0..1,0&display=swap"
      />
      <div className="cl-root">
        <Navbar />
        {/* Hero is intentionally untouched: it owns the SVG wormhole animation. */}
        <Hero />
        <About dark={dark} />
        <Features theme={theme} w={w} />
        <Benefits dark={dark} w={w} />
        <Testimonials w={w} />
        <Pricing w={w} />
        <FAQ />
        <CTA />
        <Footer w={w} />
      </div>
    </SmoothScrollLayout>
  );
}
