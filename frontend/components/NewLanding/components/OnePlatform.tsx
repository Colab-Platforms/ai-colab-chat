"use client";

import Image from "next/image";
import Link from "next/link";
import logo from "@/public/black.webp";

interface ModelInfo {
  id: string;
  name: string;
  icon: string;
  href: string;
  // Center position in SVG coordinate space (viewBox 0 0 600 500)
  cx: number;
  cy: number;
}

const ICON_SIZE = 56;
const ICON_HALF = ICON_SIZE / 2; // 28

const OnePlatform = () => {
  const hubX = 420;
  const hubY = 250;

  const models: ModelInfo[] = [
    { id: "openai",     name: "OpenAI",          icon: "/model_icons/openai.png",     href: "https://openai.com",        cx: 70,  cy: 55  },
    { id: "google",     name: "Google Gemini",    icon: "/model_icons/google.png",     href: "https://gemini.google.com", cx: 55,  cy: 135 },
    { id: "anthropic",  name: "Anthropic Claude", icon: "/model_icons/anthropic.png",  href: "https://claude.ai",         cx: 45,  cy: 215 },
    { id: "perplexity", name: "Perplexity",       icon: "/model_icons/perplexity.png", href: "https://perplexity.ai",     cx: 45,  cy: 295 },
    { id: "xai",        name: "xAI Grok",         icon: "/model_icons/x-ai.png",       href: "https://grok.com",          cx: 55,  cy: 375 },
    { id: "deepseek",   name: "DeepSeek",         icon: "/model_icons/deepseek.png",   href: "https://deepseek.com",      cx: 70,  cy: 450 },
  ];

  const mobileHubX = 200;
  const mobileHubY = 380;

  const mobileModels: ModelInfo[] = [
    { id: "openai",     name: "OpenAI",          icon: "/model_icons/openai.png",     href: "https://openai.com",        cx: 45,  cy: 85  },
    { id: "google",     name: "Google Gemini",    icon: "/model_icons/google.png",     href: "https://gemini.google.com", cx: 107, cy: 65  },
    { id: "anthropic",  name: "Anthropic Claude", icon: "/model_icons/anthropic.png",  href: "https://claude.ai",         cx: 169, cy: 55  },
    { id: "perplexity", name: "Perplexity",       icon: "/model_icons/perplexity.png", href: "https://perplexity.ai",     cx: 231, cy: 55  },
    { id: "xai",        name: "xAI Grok",         icon: "/model_icons/x-ai.png",       href: "https://grok.com",          cx: 293, cy: 65  },
    { id: "deepseek",   name: "DeepSeek",         icon: "/model_icons/deepseek.png",   href: "https://deepseek.com",      cx: 355, cy: 85  },
  ];

  return (
    <section className="flex flex-col text-foreground transition-all duration-300 py-16 md:py-24 relative overflow-hidden gap-10">
      <div className="container mx-auto flex flex-col lg:flex-row items-center justify-between gap-16 z-10 max-w-7xl px-5 sm:px-10">

        {/* ── Left Column: Visual ── */}
        <div className="w-full lg:w-1/2 flex items-center justify-center relative">
          
          {/* Desktop Visual Container */}
          <div className="hidden lg:block w-full relative" style={{ aspectRatio: "600 / 500" }}>

            {/* ── LAYER 1: Card Stack ── */}
            <div
              className="absolute"
              style={{
                left:      `${(hubX / 600) * 100}%`,
                top:       `${(hubY / 500) * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 1,
              }}
            >
              <div className="relative w-[340px] h-[300px] flex items-center justify-center">
                {/* Back Card */}
                <div className="absolute w-[310px] h-[230px] rounded-3xl bg-white/80 shadow-sm flex flex-col justify-start p-5">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                  </div>
                </div>
                {/* Middle Card */}
                <div className="absolute w-[270px] h-[380px] rounded-3xl bg-white/85 shadow-md flex flex-col justify-start p-5">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                  </div>
                </div>
                {/* Front Card */}
                <div className="absolute w-[360px] h-[300px] rounded-3xl bg-white/92 shadow-lg flex flex-col p-5 items-center justify-center">
                  <div className="absolute left-5 top-5 flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#d2d2d2]" />
                    <span className="w-2 h-2 rounded-full bg-[#d2d2d2]" />
                    <span className="w-2 h-2 rounded-full bg-[#d2d2d2]" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── LAYER 2: SVG Lines ── */}
            <svg
              viewBox="0 0 600 500"
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ zIndex: 2 }}
              fill="none"
            >
              <defs>
                <linearGradient id="pulseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%"   stopColor="#a0a0a0" stopOpacity="0"   />
                  <stop offset="30%"  stopColor="#c0c0c0" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#a0a0a0" stopOpacity="0"   />
                </linearGradient>
              </defs>

              {models.map((m) => {
                // Line starts at the RIGHT EDGE of the icon
                const lx = m.cx + ICON_HALF;
                const ly = m.cy;
                // Smooth cubic bezier to hub center
                const d = `M ${lx} ${ly} C ${lx + 90} ${ly}, ${hubX - 70} ${hubY}, ${hubX} ${hubY}`;

                return (
                  <g key={m.id}>
                    {/* Faint static base line */}
                    <path d={d} stroke="#d5d5d5" strokeWidth="1" opacity="0.5" />
                    {/* Traveling pulse - all start simultaneously (delay: 0) */}
                    <path
                      d={d}
                      stroke="url(#pulseGrad)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      pathLength="100"
                      className="flowing-dash-path"
                    />
                  </g>
                );
              })}
            </svg>

            {/* ── LAYER 3: Model Icons ── */}
            {models.map((m) => (
              <div
                key={m.id}
                title={m.name}
                className="absolute flex items-center justify-center bg-white border border-neutral-200 shadow-sm rounded-2xl"
                style={{
                  left:        `${(m.cx / 600) * 100}%`,
                  top:         `${(m.cy / 500) * 100}%`,
                  width:       `${(ICON_SIZE / 600) * 100}%`,
                  aspectRatio: "1 / 1",
                  transform:   "translate(-50%, -50%)",
                  zIndex: 3,
                  padding: "10px",
                }}
              >
                <Image
                  src={m.icon}
                  alt={m.name}
                  width={32}
                  height={32}
                  className="object-contain w-full h-full"
                />
              </div>
            ))}

            {/* ── LAYER 4: Center Logo + Ring Glow (topmost) ── */}
            <div
              className="absolute"
              style={{
                left:      `${(hubX / 600) * 100}%`,
                top:       `${(hubY / 500) * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 4,
              }}
            >
              <div className="relative flex items-center justify-center">
                {/* Pulse layer behind the hub */}
                <div className="absolute w-[100px] h-[100px] rounded-full hub-pulse-layer" style={{ zIndex: 1 }} />
                {/* Main hub circle (static) */}
                <div className="relative w-[100px] h-[100px] p-4 rounded-full bg-[#f0f0f0] flex items-center justify-center shadow-sm" style={{ zIndex: 5 }}>
                  <Image src={logo} alt="Colab Logo" />
                </div>
              </div>
            </div>

          </div>

          {/* Mobile Visual Container */}
          <div className="block lg:hidden w-full relative" style={{ aspectRatio: "400 / 520" }}>

            {/* ── LAYER 1: Card Stack ── */}
            <div
              className="absolute"
              style={{
                left:      `${(mobileHubX / 400) * 100}%`,
                top:       `${(mobileHubY / 520) * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 1,
              }}
            >
              <div className="relative w-[340px] h-[300px] flex items-center justify-center scale-[0.75] min-[400px]:scale-[0.85] sm:scale-100 origin-center">
                {/* Back Card */}
                <div className="absolute w-[310px] h-[230px] rounded-3xl bg-white/80 shadow-sm flex flex-col justify-start p-5">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                  </div>
                </div>
                {/* Middle Card */}
                <div className="absolute w-[270px] h-[380px] rounded-3xl bg-white/85 shadow-md flex flex-col justify-start p-5">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                    <span className="w-2 h-2 rounded-full bg-[#c5c5c5]" />
                  </div>
                </div>
                {/* Front Card */}
                <div className="absolute w-[360px] h-[300px] rounded-3xl bg-white/92 shadow-lg flex flex-col p-5 items-center justify-center">
                  <div className="absolute left-5 top-5 flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#d2d2d2]" />
                    <span className="w-2 h-2 rounded-full bg-[#d2d2d2]" />
                    <span className="w-2 h-2 rounded-full bg-[#d2d2d2]" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── LAYER 2: SVG Lines ── */}
            <svg
              viewBox="0 0 400 520"
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ zIndex: 2 }}
              fill="none"
            >
              <defs>
                <linearGradient id="pulseGradMobile" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%"   stopColor="#a0a0a0" stopOpacity="0"   />
                  <stop offset="30%"  stopColor="#c0c0c0" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#a0a0a0" stopOpacity="0"   />
                </linearGradient>
              </defs>

              {mobileModels.map((m) => {
                // Line starts at the BOTTOM EDGE of the icon
                const lx = m.cx;
                const ly = m.cy + ICON_HALF;
                // Smooth cubic bezier curving downwards to hub center
                const d = `M ${lx} ${ly} C ${lx} ${ly + 80}, ${mobileHubX} ${mobileHubY - 100}, ${mobileHubX} ${mobileHubY}`;

                return (
                  <g key={m.id}>
                    {/* Faint static base line */}
                    <path d={d} stroke="#d5d5d5" strokeWidth="1" opacity="0.5" />
                    {/* Traveling pulse */}
                    <path
                      d={d}
                      stroke="url(#pulseGradMobile)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      pathLength="100"
                      className="flowing-dash-path"
                    />
                  </g>
                );
              })}
            </svg>

            {/* ── LAYER 3: Model Icons ── */}
            {mobileModels.map((m) => (
              <div
                key={m.id}
                title={m.name}
                className="absolute flex items-center justify-center bg-white border border-neutral-200 shadow-sm rounded-2xl"
                style={{
                  left:        `${(m.cx / 400) * 100}%`,
                  top:         `${(m.cy / 520) * 100}%`,
                  width:       `${(ICON_SIZE / 400) * 100}%`,
                  aspectRatio: "1 / 1",
                  transform:   "translate(-50%, -50%)",
                  zIndex: 3,
                  padding: "6px",
                }}
              >
                <Image
                  src={m.icon}
                  alt={m.name}
                  width={32}
                  height={32}
                  className="object-contain w-full h-full"
                />
              </div>
            ))}

            {/* ── LAYER 4: Center Logo + Ring Glow ── */}
            <div
              className="absolute"
              style={{
                left:      `${(mobileHubX / 400) * 100}%`,
                top:       `${(mobileHubY / 520) * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 4,
              }}
            >
              <div className="relative flex items-center justify-center scale-[0.75] min-[400px]:scale-[0.85] sm:scale-100 origin-center">
                {/* Pulse layer behind the hub */}
                <div className="absolute w-[100px] h-[100px] rounded-full hub-pulse-layer" style={{ zIndex: 1 }} />
                {/* Main hub circle */}
                <div className="relative w-[100px] h-[100px] p-4 rounded-full bg-[#f0f0f0] flex items-center justify-center shadow-sm" style={{ zIndex: 5 }}>
                  <Image src={logo} alt="Colab Logo" />
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── Right Column: Text ── */}
        <div className="w-full lg:w-1/2 flex flex-col gap-4 text-left mt-5">
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold leading-tight tracking-tight text-black dark:text-white">
            One Platform. <br />
            Every Leading AI Model.
          </h2>
          <p className="text-lg text-gray-600 dark:text-neutral-400 leading-relaxed max-w-lg">
            See which AI model is best for your task. No subscription juggling. No context switching.
          </p>
          <div className="mt-2">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-black text-white dark:bg-white dark:text-black rounded-xl font-semibold hover:bg-gray-800 dark:hover:bg-neutral-200 transition-all duration-200"
            >
              Get started
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
};

export default OnePlatform;