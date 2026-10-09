"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, ArrowUp, ChevronDown, ChevronRight, Loader2, Play, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { walletService } from "@/lib/services";

/* ── Hero ─────────────────────────────────────────────────────────── */

export function StudioHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="text-center space-y-2"
    >
      <h1 className="text-[28px] sm:text-[32px] leading-tight font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-muted-foreground text-[15px]">{subtitle}</p>
    </motion.div>
  );
}

/* ── Composer ─────────────────────────────────────────────────────── */

export function StudioComposer({
  value,
  onChange,
  placeholder,
  onSubmit,
  canSubmit,
  busy,
  left,
  right,
  maxLength = 4000,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSubmit: () => void;
  canSubmit: boolean;
  busy?: boolean;
  /** Controls after the textarea: attach button, option chips. */
  left: ReactNode;
  /** Controls just before the send button (e.g. cost estimate). */
  right?: ReactNode;
  maxLength?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  return (
    <div className="rounded-2xl border border-border bg-surface shadow-cl px-3 pt-3 pb-3 focus-within:border-line-strong transition-colors">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSubmit && !busy) onSubmit();
          }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={2}
        className="w-full resize-none bg-transparent px-1 py-1.5 text-[15px] leading-relaxed text-foreground placeholder:text-faint outline-none"
      />
      <div className="mt-1 flex items-center gap-1 flex-wrap">
        {left}
        <div className="flex-1" />
        {right}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || busy}
          title="Generate"
          className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${
            canSubmit && !busy
              ? "bg-primary text-primary-foreground hover:bg-accent-hover cursor-pointer"
              : "bg-sunken text-muted-foreground cursor-not-allowed"
          }`}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

/** Round "+" button that wraps a hidden file input. */
export function AttachButton({
  onFile,
  accept,
  title,
  icon: Icon,
  disabled,
}: {
  onFile: (file: File) => void;
  accept: string;
  title: string;
  icon: LucideIcon;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => ref.current?.click()}
        className="h-8 w-8 shrink-0 rounded-full border border-border bg-surface text-muted-foreground hover:bg-sidebar-accent hover:text-foreground flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
      >
        <Icon className="w-4 h-4" />
      </button>
    </>
  );
}

/** Compact dropdown chip used for model / ratio / duration / format pickers. */
export function ChipSelect<T extends string | number>({
  icon: Icon,
  value,
  options,
  onChange,
  title,
}: {
  icon?: LucideIcon;
  value: T;
  options: { value: T; label: string; disabled?: boolean; hint?: string }[];
  onChange: (v: T) => void;
  title?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={title}
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[13px] font-medium text-foreground hover:bg-sidebar-accent transition-colors cursor-pointer data-[state=open]:bg-sidebar-accent"
        >
          {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          <span className="max-w-[150px] truncate">{current?.label ?? "Select"}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[160px] z-[9500]" style={{ zIndex: 9500 }}>
        {options.map((o) => (
          <DropdownMenuItem
            key={String(o.value)}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className="gap-2 cursor-pointer text-[13px]"
          >
            <span className="flex-1">{o.label}</span>
            {o.hint && <span className="text-[11px] text-faint">{o.hint}</span>}
            {o.value === value && <span className="text-primary text-xs">●</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Token usage pill ─────────────────────────────────────────────── */

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export function UsageMeter() {
  const [wallet, setWallet] = useState<{
    tokensRemaining: number;
    tokensUsed: number;
    currentPeriodEnd?: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    walletService
      .get()
      .then((res) => {
        if (!cancelled) setWallet(res.data?.data ?? null);
      })
      .catch(() => {
        /* no wallet yet — render nothing */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!wallet) return null;

  const total = wallet.tokensRemaining + wallet.tokensUsed;
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((wallet.tokensRemaining / total) * 100))) : 0;
  const resets = wallet.currentPeriodEnd
    ? new Date(wallet.currentPeriodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;
  const r = 8;
  const c = 2 * Math.PI * r;

  return (
    <div className="flex justify-center">
      <Link
        href="/profile/wallet"
        className="inline-flex items-center gap-2.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:border-line-strong transition-colors"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" className="-rotate-90">
          <circle cx="10" cy="10" r={r} fill="none" strokeWidth="2.5" className="stroke-sunken" />
          <circle
            cx="10"
            cy="10"
            r={r}
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
            className="stroke-primary"
          />
        </svg>
        <span className="font-mono text-[11.5px]">
          <span className="text-foreground">{compact(wallet.tokensRemaining)}</span>
          {total > 0 && <span className="text-faint"> / {compact(total)}</span>} tokens left
        </span>
        <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[10.5px] font-semibold text-accent-ink">{pct}%</span>
        {resets && <span className="text-faint">Resets {resets}</span>}
        <ChevronRight className="w-3.5 h-3.5 text-faint" />
      </Link>
    </div>
  );
}

/* ── Tabs + templates ─────────────────────────────────────────────── */

export function StudioTabs<T extends string>({
  tabs,
  active,
  onChange,
  action,
}: {
  tabs: { id: T; label: string; count?: number }[];
  active: T;
  onChange: (id: T) => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="inline-flex items-center rounded-lg bg-sunken p-0.5 border border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`h-8 px-3 rounded-md text-[13px] font-medium transition-colors cursor-pointer border ${
              active === t.id
                ? "bg-surface border-border shadow-sm text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="text-faint"> · {t.count}</span>}
          </button>
        ))}
      </div>
      {action}
    </div>
  );
}

export function LinkAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:text-accent-hover transition-colors cursor-pointer"
    >
      {children}
      <ArrowRight className="w-3.5 h-3.5" />
    </button>
  );
}

export interface StudioTemplate {
  id: string | number;
  title: string;
  /** Short caption under the title, e.g. "Portraits · 2:3". */
  meta: string;
  /** The stored recipe sent with the request. */
  prompt: string;
  /** Cover image (admin-curated templates). */
  previewUrl?: string | null;
  /** Looping clip played on hover, video templates only. */
  previewVideoUrl?: string | null;
  /** The user must supply their own photo to use this template. */
  requiresPhoto?: boolean;
  category?: string | null;
  aspectRatio?: string;
  duration?: number | null;
  /** Fallback artwork for built-in templates that have no cover image. */
  icon?: LucideIcon;
  gradient?: string;
}

const FALLBACK_GRADIENT = "from-[#E3D7F8] to-[#C9D6F5]";

function ImageTemplateCard({ t }: { t: StudioTemplate }) {
  const Icon = t.icon;
  return (
    <div className="relative h-[258px] overflow-hidden rounded-2xl border border-border/60 bg-sunken transition-transform group-hover:-translate-y-0.5">
      {t.previewUrl ? (
        <img src={t.previewUrl} alt={t.title} loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${t.gradient ?? FALLBACK_GRADIENT}`}>
          {Icon && (
            <Icon className="absolute left-1/2 top-[38%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-black/30" strokeWidth={1.5} />
          )}
        </div>
      )}
      <div className="absolute inset-x-2 bottom-2 rounded-lg bg-white px-3 py-2 shadow-sm">
        <div className="truncate text-[12.5px] font-semibold text-[#18161D]">{t.title}</div>
        <div className="truncate text-[11px] text-[#8A8694]">{t.meta}</div>
      </div>
    </div>
  );
}

function VideoTemplateCard({ t }: { t: StudioTemplate }) {
  const [hover, setHover] = useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div
        className={`relative flex h-[157px] items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br ${
          t.previewUrl ? "from-black/5 to-black/5" : (t.gradient ?? FALLBACK_GRADIENT)
        } transition-transform group-hover:-translate-y-0.5`}
      >
        {t.previewUrl && (
          <img src={t.previewUrl} alt={t.title} loading="lazy" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        )}
        {hover && t.previewVideoUrl && (
          <video src={t.previewVideoUrl} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
        )}
        {!t.previewUrl && <div className="absolute inset-x-[16%] inset-y-[16%] rounded-lg bg-white/55" />}
        {!(hover && t.previewVideoUrl) && (
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white">
            <Play className="h-3.5 w-3.5 fill-current" />
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <div className="truncate text-[13px] font-medium text-foreground">{t.title}</div>
        <div className="truncate text-[11.5px] text-faint">{t.meta}</div>
      </div>
    </div>
  );
}

/**
 * Template cards: an endless right-to-left carousel by default (pauses while
 * hovered), or a wrapped grid when `expanded`. The list is repeated until it
 * is long enough to fill the strip, then doubled for a seamless loop.
 */
export function TemplateStrip({
  templates,
  expanded,
  variant,
  onPick,
}: {
  templates: StudioTemplate[];
  expanded: boolean;
  variant: "image" | "video";
  onPick: (t: StudioTemplate) => void;
}) {
  const itemWidth = variant === "image" ? "w-[172px]" : "w-[250px]";

  const loop = useMemo(() => {
    if (templates.length === 0) return { items: [] as StudioTemplate[], half: 0 };
    let base = [...templates];
    while (base.length < 8) base = [...base, ...templates];
    return { items: [...base, ...base], half: base.length };
  }, [templates]);

  const card = (t: StudioTemplate) => (variant === "image" ? <ImageTemplateCard t={t} /> : <VideoTemplateCard t={t} />);

  if (expanded) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {templates.map((t) => (
          <button key={t.id} type="button" onClick={() => onPick(t)} className="group w-full cursor-pointer text-left">
            {card(t)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="studio-marquee overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_28px,black_calc(100%-28px),transparent)]">
      <div className="studio-marquee-track" style={{ ["--marquee-duration" as string]: `${Math.max(30, loop.half * 6)}s` }}>
        {loop.items.map((t, i) => (
          <button
            key={`${t.id}-${i}`}
            type="button"
            onClick={() => onPick(t)}
            aria-hidden={i >= loop.half}
            tabIndex={i >= loop.half ? -1 : 0}
            className={`group mr-3 shrink-0 cursor-pointer text-left ${itemWidth}`}
          >
            {card(t)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Centered page frame shared by the three studios. */
export function StudioFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-full overflow-y-auto">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{ background: "radial-gradient(60% 70% at 50% 0%, var(--cl-accent-soft), transparent 75%)", opacity: 0.6 }}
      />
      <div className="relative mx-auto w-full max-w-[712px] px-4 pt-[9vh] pb-16 space-y-6">{children}</div>
    </div>
  );
}
