"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { orgService } from "@/lib/services";
import { toast } from "@/lib/toast";

interface Member {
  id: number;
  memberRole: string;
  status: string;
  user: { id: number; firstName: string; lastName: string; email: string };
}

const inputCls = "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50";
const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-faint">{hint}</span>}
    </label>
  );
}

export default function OrgSettingsPage() {
  const { user, refreshUser } = useAuth();
  const isOwner = user?.orgMembership?.memberRole === "OWNER";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    gstin: "",
    billingEmail: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    pincode: "",
    domains: "",
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [newOwner, setNewOwner] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = (await orgService.settings()).data?.data;
        const a = (s?.billingAddress ?? {}) as Record<string, string>;
        setForm({
          name: s.name ?? "",
          gstin: s.gstin ?? "",
          billingEmail: s.billingEmail ?? "",
          line1: a.line1 ?? "",
          line2: a.line2 ?? "",
          city: a.city ?? "",
          state: a.state ?? "",
          pincode: a.pincode ?? "",
          domains: (s.allowedEmailDomains ?? []).join(", "),
        });
        if (isOwner) setMembers((await orgService.listMembers({ status: "ACTIVE" })).data?.data ?? []);
      } catch (e) {
        toast.error(errMsg(e, "Failed to load settings"));
      } finally {
        setLoading(false);
      }
    })();
  }, [isOwner]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await orgService.updateSettings({
        name: form.name,
        gstin: form.gstin || null,
        billingEmail: form.billingEmail,
        billingAddress: { line1: form.line1, line2: form.line2, city: form.city, state: form.state, pincode: form.pincode },
        allowedEmailDomains: form.domains
          .split(",")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean),
      });
      toast.success("Settings saved");
      refreshUser();
    } catch (e) {
      toast.error(errMsg(e, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  const transfer = async () => {
    setTransferring(true);
    try {
      await orgService.transferOwnership(Number(newOwner));
      toast.success("Ownership transferred. You're now an admin.");
      // Role changed: reload so every screen reflects the new permissions.
      window.location.assign("/org");
    } catch (e) {
      toast.error(errMsg(e, "Failed to transfer ownership"));
      setTransferring(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const candidates = members.filter((m) => m.user.id !== user?.id);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Company details used on invoices, and who can be invited.</p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-surface p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name">
            <input className={inputCls} value={form.name} onChange={set("name")} disabled={!isOwner} />
          </Field>
          <Field label="GSTIN" hint="Printed on every tax invoice.">
            <input className={inputCls} value={form.gstin} onChange={set("gstin")} disabled={!isOwner} />
          </Field>
          <Field label="Billing email" hint="Invoices and payment reminders go here.">
            <input className={inputCls} type="email" value={form.billingEmail} onChange={set("billingEmail")} disabled={!isOwner} />
          </Field>
          <Field label="Allowed email domains" hint="Comma separated. Empty means any domain can be invited.">
            <input className={inputCls} value={form.domains} onChange={set("domains")} placeholder="acme.com" disabled={!isOwner} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Address line 1">
            <input className={inputCls} value={form.line1} onChange={set("line1")} disabled={!isOwner} />
          </Field>
          <Field label="Address line 2">
            <input className={inputCls} value={form.line2} onChange={set("line2")} disabled={!isOwner} />
          </Field>
          <Field label="City">
            <input className={inputCls} value={form.city} onChange={set("city")} disabled={!isOwner} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="State">
              <input className={inputCls} value={form.state} onChange={set("state")} disabled={!isOwner} />
            </Field>
            <Field label="Pincode">
              <input className={inputCls} value={form.pincode} onChange={set("pincode")} disabled={!isOwner} />
            </Field>
          </div>
        </div>

        {isOwner ? (
          <Button onClick={save} disabled={saving || !form.name.trim() || !form.billingEmail.trim()}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">Only the organization owner can change these details.</p>
        )}
        <p className="text-xs text-muted-foreground">Changing allowed domains doesn&apos;t affect people who have already joined.</p>
      </div>

      {isOwner && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-5">
          <div>
            <div className="text-sm font-semibold">Transfer ownership</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              The new owner controls billing and settings. You stay on as an organization admin.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className={`${inputCls} max-w-xs`} value={newOwner} onChange={(e) => { setNewOwner(e.target.value); setConfirming(false); }}>
              <option value="">Choose a member…</option>
              {candidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.user.firstName} {m.user.lastName} ({m.user.email})
                </option>
              ))}
            </select>
            {!confirming ? (
              <Button variant="outline" disabled={!newOwner} onClick={() => setConfirming(true)}>
                Transfer…
              </Button>
            ) : (
              <>
                <Button variant="destructive" onClick={transfer} disabled={transferring}>
                  {transferring ? "Transferring…" : "Yes, transfer ownership"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={transferring}>
                  Cancel
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
