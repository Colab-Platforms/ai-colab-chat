"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { contentService, type ContentProductInput } from "@/lib/services";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const toLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
const fromLines = (items: unknown) =>
  Array.isArray(items) ? items.map(String).join("\n") : "";

const errorOf = (e: any, fallback: string) =>
  e?.response?.data?.message ?? fallback;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

// ── Brand kit ─────────────────────────────────────────────────────────────

export function BrandKitTab({ folderId }: { folderId: number }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [voice, setVoice] = useState("");
  const [audience, setAudience] = useState("");
  const [ctaRules, setCtaRules] = useState("");
  const [banned, setBanned] = useState("");
  const [mustInclude, setMustInclude] = useState("");
  const [examples, setExamples] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    contentService
      .getBrandKit(folderId)
      .then((res) => {
        if (cancelled) return;
        const kit = res.data?.data;
        setName(kit?.name ?? "");
        setVoice(kit?.voice ?? "");
        setAudience(kit?.audience ?? "");
        setCtaRules(kit?.ctaRules ?? "");
        setBanned(fromLines(kit?.bannedWords));
        setMustInclude(fromLines(kit?.mustInclude));
        // Examples can be multi-line, so they are separated by a blank line.
        setExamples(Array.isArray(kit?.examples) ? kit.examples.join("\n\n") : "");
      })
      .catch(() => !cancelled && toast.error("Failed to load brand kit"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [folderId]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await contentService.saveBrandKit({
        folderId,
        name: name.trim(),
        voice: voice.trim(),
        audience: audience.trim(),
        ctaRules: ctaRules.trim() || null,
        bannedWords: toLines(banned),
        mustInclude: toLines(mustInclude),
        examples: examples
          .split(/\n{2,}/)
          .map((e) => e.trim())
          .filter(Boolean)
          .slice(0, 3),
      });
      toast.success("Brand kit saved");
    } catch (e) {
      toast.error(errorOf(e, "Failed to save brand kit"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
      <Field label="Brand name">
        <Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Voice & tone" hint="e.g. Professional but approachable. Short sentences. No jargon.">
        <Textarea rows={3} value={voice} onChange={(e) => setVoice(e.target.value)} />
      </Field>
      <Field label="Target audience">
        <Textarea rows={2} value={audience} onChange={(e) => setAudience(e.target.value)} />
      </Field>
      <Field label="Call-to-action rules">
        <Input value={ctaRules} onChange={(e) => setCtaRules(e.target.value)} />
      </Field>
      <Field label="Never use (one per line)">
        <Textarea rows={3} value={banned} onChange={(e) => setBanned(e.target.value)} />
      </Field>
      <Field label="Always include (one per line)">
        <Textarea rows={2} value={mustInclude} onChange={(e) => setMustInclude(e.target.value)} />
      </Field>
      <Field label="Examples of on-brand writing" hint="Up to 3, separated by a blank line.">
        <Textarea rows={5} value={examples} onChange={(e) => setExamples(e.target.value)} />
      </Field>
      <Button size="sm" disabled={saving || !name.trim()} onClick={() => void save()}>
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Save brand kit
      </Button>
    </div>
  );
}

// ── Products ──────────────────────────────────────────────────────────────

interface ProductRow extends ContentProductInput {
  id: number;
}

interface ProductDraft {
  id: number | null;
  name: string;
  summary: string;
  features: string;
  pricing: string;
  claimsAllowed: string;
  claimsForbidden: string;
}

const emptyDraft: ProductDraft = {
  id: null,
  name: "",
  summary: "",
  features: "",
  pricing: "",
  claimsAllowed: "",
  claimsForbidden: "",
};

export function ProductsTab({ folderId }: { folderId: number }) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contentService.listProducts(folderId);
      setProducts(res.data?.data ?? []);
    } catch {
      toast.error("Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [folderId]);

  useEffect(() => {
    setDraft(null);
    void load();
  }, [load]);

  const edit = (p: ProductRow) =>
    setDraft({
      id: p.id,
      name: p.name,
      summary: p.summary ?? "",
      features: fromLines(p.features),
      pricing: p.pricing ?? "",
      claimsAllowed: fromLines(p.claimsAllowed),
      claimsForbidden: fromLines(p.claimsForbidden),
    });

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    setSaving(true);
    const payload: ContentProductInput = {
      name: draft.name.trim(),
      summary: draft.summary.trim(),
      features: toLines(draft.features),
      pricing: draft.pricing.trim() || null,
      claimsAllowed: toLines(draft.claimsAllowed),
      claimsForbidden: toLines(draft.claimsForbidden),
    };
    try {
      if (draft.id) await contentService.updateProduct(draft.id, payload);
      else await contentService.createProduct({ ...payload, folderId });
      setDraft(null);
      await load();
    } catch (e) {
      toast.error(errorOf(e, "Failed to save product"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    try {
      await contentService.deleteProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      toast.error("Failed to delete product");
    }
  };

  const set = (patch: Partial<ProductDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  if (draft) {
    return (
      <div className="max-h-[26rem] space-y-3 overflow-y-auto pr-1">
        <Field label="Product name">
          <Input value={draft.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Summary">
          <Textarea rows={3} value={draft.summary} onChange={(e) => set({ summary: e.target.value })} />
        </Field>
        <Field label="Features (one per line)">
          <Textarea rows={4} value={draft.features} onChange={(e) => set({ features: e.target.value })} />
        </Field>
        <Field label="Pricing">
          <Input value={draft.pricing} onChange={(e) => set({ pricing: e.target.value })} />
        </Field>
        <Field label="Approved claims (one per line)">
          <Textarea rows={3} value={draft.claimsAllowed} onChange={(e) => set({ claimsAllowed: e.target.value })} />
        </Field>
        <Field label="Claims to never make (one per line)">
          <Textarea rows={3} value={draft.claimsForbidden} onChange={(e) => set({ claimsForbidden: e.target.value })} />
        </Field>
        <div className="flex gap-2">
          <Button size="sm" disabled={saving || !draft.name.trim()} onClick={() => void save()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save product
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDraft(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex justify-center p-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : products.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
          No products yet. Add one so the AI uses exact features, pricing and approved claims.
        </p>
      ) : (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
          {products.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => edit(p)}
              >
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {p.summary || "No summary"}
                </div>
              </button>
              <Button
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                title="Delete"
                onClick={() => void remove(p.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" variant="outline" onClick={() => setDraft({ ...emptyDraft })}>
        <Plus className="mr-1.5 h-4 w-4" /> Add product
      </Button>
    </div>
  );
}
