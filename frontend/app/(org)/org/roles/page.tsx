"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { modelService, orgService } from "@/lib/services";
import { toast } from "@/lib/toast";

type PolicyMode = "ALL" | "ALLOWLIST" | "BLOCKLIST";

interface Role {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean;
  monthlyTokens: number;
  monthlyVideoCredits: number;
  imageGenEnabled: boolean;
  documentGenEnabled: boolean;
  videoGenEnabled: boolean;
  codeWorkspaceEnabled: boolean;
  voiceEnabled: boolean;
  modelPolicy: { mode: PolicyMode; modelIds: number[] };
  videoModelIds: number[];
  dailyTokenCap: number | null;
  perRequestTokenCap: number | null;
  memberCount: number;
}
interface ModelLite {
  id: number;
  name: string;
  capabilities?: string[];
}

interface Form {
  name: string;
  description: string;
  isDefault: boolean;
  monthlyTokens: string;
  monthlyVideoCredits: string;
  imageGenEnabled: boolean;
  documentGenEnabled: boolean;
  videoGenEnabled: boolean;
  codeWorkspaceEnabled: boolean;
  voiceEnabled: boolean;
  mode: PolicyMode;
  modelIds: number[];
  videoModelIds: number[];
  dailyTokenCap: string;
  perRequestTokenCap: string;
  applyNow: boolean;
}

const emptyForm: Form = {
  name: "",
  description: "",
  isDefault: false,
  monthlyTokens: "0",
  monthlyVideoCredits: "0",
  imageGenEnabled: false,
  documentGenEnabled: true,
  videoGenEnabled: false,
  codeWorkspaceEnabled: false,
  voiceEnabled: false,
  mode: "ALL",
  modelIds: [],
  videoModelIds: [],
  dailyTokenCap: "",
  perRequestTokenCap: "",
  applyNow: false,
};

const inputCls = "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50";
const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;

const toForm = (r: Role): Form => ({
  name: r.name,
  description: r.description ?? "",
  isDefault: r.isDefault,
  monthlyTokens: String(r.monthlyTokens),
  monthlyVideoCredits: String(r.monthlyVideoCredits),
  imageGenEnabled: r.imageGenEnabled,
  documentGenEnabled: r.documentGenEnabled,
  videoGenEnabled: r.videoGenEnabled,
  codeWorkspaceEnabled: r.codeWorkspaceEnabled,
  voiceEnabled: r.voiceEnabled,
  mode: r.modelPolicy?.mode ?? "ALL",
  modelIds: r.modelPolicy?.modelIds ?? [],
  videoModelIds: r.videoModelIds ?? [],
  dailyTokenCap: r.dailyTokenCap != null ? String(r.dailyTokenCap) : "",
  perRequestTokenCap: r.perRequestTokenCap != null ? String(r.perRequestTokenCap) : "",
  applyNow: false,
});

function Checklist({
  items,
  selected,
  onChange,
}: {
  items: ModelLite[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  return (
    <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-lg border border-border p-1.5">
      {items.map((m) => (
        <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-sidebar-accent">
          <input
            type="checkbox"
            checked={selected.includes(m.id)}
            onChange={(e) => onChange(e.target.checked ? [...selected, m.id] : selected.filter((x) => x !== m.id))}
          />
          {m.name}
        </label>
      ))}
      {items.length === 0 && <div className="px-2 py-3 text-xs text-muted-foreground">No models available.</div>}
    </div>
  );
}

export default function OrgRolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [models, setModels] = useState<ModelLite[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      setRoles((await orgService.listRoles()).data?.data ?? []);
    } catch (e) {
      toast.error(errMsg(e, "Failed to load roles"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Models are only needed by the editor; fetch them once, all pages.
  useEffect(() => {
    (async () => {
      try {
        const all: ModelLite[] = [];
        for (let page = 1; page <= 10; page++) {
          const res = await modelService.list({ page: String(page), pageSize: "100", isActive: "true" });
          const d = res.data?.data;
          all.push(...(d?.data ?? []));
          if (!d?.hasNextPage) break;
        }
        setModels(all);
      } catch {
        /* the editor still works for the other fields */
      }
    })();
  }, []);

  const videoModels = useMemo(() => models.filter((m) => m.capabilities?.includes("VIDEO_GENERATION")), [models]);
  const chatModels = useMemo(() => models.filter((m) => !m.capabilities?.includes("VIDEO_GENERATION")), [models]);

  const open = (r: Role | "new") => {
    setEditing(r);
    setForm(r === "new" ? emptyForm : toForm(r));
  };
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        isDefault: form.isDefault,
        monthlyTokens: Number(form.monthlyTokens || 0),
        monthlyVideoCredits: Number(form.monthlyVideoCredits || 0),
        imageGenEnabled: form.imageGenEnabled,
        documentGenEnabled: form.documentGenEnabled,
        videoGenEnabled: form.videoGenEnabled,
        codeWorkspaceEnabled: form.codeWorkspaceEnabled,
        voiceEnabled: form.voiceEnabled,
        modelPolicy: { mode: form.mode, modelIds: form.mode === "ALL" ? [] : form.modelIds },
        videoModelIds: form.videoGenEnabled ? form.videoModelIds : [],
        dailyTokenCap: form.dailyTokenCap ? Number(form.dailyTokenCap) : null,
        perRequestTokenCap: form.perRequestTokenCap ? Number(form.perRequestTokenCap) : null,
      };
      if (editing === "new") await orgService.createRole(payload);
      else if (editing) await orgService.updateRole(editing.id, { ...payload, applyNow: form.applyNow });
      toast.success("Role saved");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to save role"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await orgService.deleteRole(deleteTarget.id);
      toast.success("Role deleted");
      setDeleteTarget(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to delete role"));
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const toggles: { key: keyof Form; label: string }[] = [
    { key: "documentGenEnabled", label: "Document generation" },
    { key: "imageGenEnabled", label: "Image generation" },
    { key: "videoGenEnabled", label: "Video generation" },
    { key: "codeWorkspaceEnabled", label: "Code workspace" },
    { key: "voiceEnabled", label: "Voice" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Roles</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">A role sets what its members can use and how much. Examples: Video Editor, Researcher, Coder.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => open("new")}>
          <Plus className="h-4 w-4" /> New role
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-semibold">
                    {r.name}
                    {r.isDefault && <Badge className="border-0 bg-accent-soft text-accent-ink">Default</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.memberCount} member{r.memberCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => open(r)} aria-label="Edit role">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(r)} aria-label="Delete role">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {r.description && <p className="text-sm text-muted-foreground">{r.description}</p>}
              <div className="text-sm">
                <b>{r.monthlyTokens.toLocaleString("en-IN")}</b> tokens / month
                {r.videoGenEnabled && <> · <b>{r.monthlyVideoCredits}</b> video credits</>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {toggles
                  .filter((t) => r[t.key as keyof Role])
                  .map((t) => (
                    <span key={t.key} className="rounded-full bg-sunken px-2.5 py-1 text-xs">
                      {t.label}
                    </span>
                  ))}
                <span className="rounded-full border border-border px-2.5 py-1 text-xs">
                  {r.modelPolicy.mode === "ALL" ? "All models" : r.modelPolicy.mode === "ALLOWLIST" ? `${r.modelPolicy.modelIds.length} models allowed` : `${r.modelPolicy.modelIds.length} models blocked`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[620px]">
          <DialogHeader className="text-left">
            <DialogTitle>{editing === "new" ? "New role" : "Edit role"}</DialogTitle>
            <DialogDescription>
              Limits apply to everyone with this role. Token and credit amounts take effect at the next monthly refill.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Name</span>
                <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Video Editor" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Description (optional)</span>
                <input className={inputCls} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Tokens per month</span>
                <input className={inputCls} type="number" min={0} value={form.monthlyTokens} onChange={(e) => set("monthlyTokens", e.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Daily token limit (optional)</span>
                <input className={inputCls} type="number" min={1} value={form.dailyTokenCap} onChange={(e) => set("dailyTokenCap", e.target.value)} placeholder="No daily limit" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-muted-foreground">Max length of one reply, in tokens (optional)</span>
                <input className={inputCls} type="number" min={1} value={form.perRequestTokenCap} onChange={(e) => set("perRequestTokenCap", e.target.value)} placeholder="Default" />
              </label>
            </div>

            <div className="space-y-2 rounded-xl border border-border p-3.5">
              <div className="text-xs font-semibold text-muted-foreground">Features</div>
              {toggles.map((t) => (
                <div key={t.key} className="flex items-center justify-between">
                  <span>{t.label}</span>
                  <Switch checked={form[t.key] as boolean} onCheckedChange={(v) => set(t.key, v as never)} />
                </div>
              ))}
            </div>

            {form.videoGenEnabled && (
              <div className="space-y-3 rounded-xl border border-border p-3.5">
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Video credits per month</span>
                  <input className={inputCls} type="number" min={0} value={form.monthlyVideoCredits} onChange={(e) => set("monthlyVideoCredits", e.target.value)} />
                </label>
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Allowed video models</span>
                  <Checklist items={videoModels} selected={form.videoModelIds} onChange={(ids) => set("videoModelIds", ids)} />
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-border p-3.5">
              <div className="text-xs font-semibold text-muted-foreground">Chat &amp; image models</div>
              <select className={inputCls} value={form.mode} onChange={(e) => set("mode", e.target.value as PolicyMode)}>
                <option value="ALL">All models</option>
                <option value="ALLOWLIST">Only the models I pick</option>
                <option value="BLOCKLIST">All except the models I pick</option>
              </select>
              {form.mode !== "ALL" && <Checklist items={chatModels} selected={form.modelIds} onChange={(ids) => set("modelIds", ids)} />}
            </div>

            <label className="flex items-center justify-between">
              <span>Default role for new invitations</span>
              <Switch checked={form.isDefault} onCheckedChange={(v) => set("isDefault", v)} />
            </label>

            {editing !== "new" && editing && editing.memberCount > 0 && (
              <label className="flex items-start justify-between gap-4 rounded-xl bg-sunken p-3.5">
                <span>
                  Apply token and credit changes to current balances now
                  <span className="block text-xs text-muted-foreground">
                    Otherwise the new amounts start at each member&apos;s next monthly refill.
                  </span>
                </span>
                <Switch checked={form.applyNow} onCheckedChange={(v) => set("applyNow", v)} />
              </label>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete role"
        description={
          deleteTarget && deleteTarget.memberCount > 0
            ? `${deleteTarget.memberCount} member(s) still use this role. Reassign them first deletion will be refused.`
            : "This role will be removed. This can't be undone."
        }
        onConfirm={remove}
        loading={deleting}
      />
    </div>
  );
}
