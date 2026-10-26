"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Copy, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { orgAdminService } from "@/lib/services";
import { toast } from "@/lib/toast";

type OrgStatus = "ACTIVE" | "SUSPENDED" | "CLOSED";

interface OrgSub {
  id: number;
  status: string;
  billingMode: "CASHFREE" | "MANUAL_INVOICE";
  billingCycle: string;
  seatsPurchased: number;
  minSeats: number;
  pricePerSeat: string;
  currentPeriodEnd: string | null;
  plan?: { name: string };
}

interface AdminBill {
  id: number;
  number: string;
  kind: string;
  status: "DUE" | "PAID" | "VOID";
  seats: number;
  totalAmount: string;
  dueDate: string;
  paymentMethod: string | null;
  paymentReference: string | null;
  invoiceUrl: string | null;
}

interface OrgRow {
  id: number;
  name: string;
  slug: string;
  billingEmail: string;
  gstin: string | null;
  status: OrgStatus;
  createdAt: string;
  allowedEmailDomains: string[];
  subscriptions: OrgSub[];
  _count: { members: number };
  invites?: { id: number; email: string; memberRole: string; expiresAt: string }[];
}

const statusStyle: Record<string, string> = {
  ACTIVE: "bg-ok/15 text-ok",
  SUSPENDED: "bg-sunken text-faint",
  CLOSED: "bg-sunken text-faint",
  PENDING: "bg-accent-soft text-accent-ink",
};

const inputCls =
  "h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-primary/50";

const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-faint">{hint}</span>}
    </label>
  );
}

function OrgsAdminContent() {
  const params = useSearchParams();
  const [rows, setRows] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState<{ sent: boolean; to: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({
    name: "",
    ownerEmail: "",
    billingEmail: "",
    gstin: "",
    allowedEmailDomains: "",
    demoRequestId: "",
    billingMode: "MANUAL_INVOICE",
    billingCycle: "MONTHLY",
    seats: "5",
    minSeats: "1",
    pricePerSeat: "",
    roleName: "Member",
    roleTokens: "",
    roleVideoCredits: "0",
  });

  const [active, setActive] = useState<OrgRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [bills, setBills] = useState<AdminBill[]>([]);
  const [payRef, setPayRef] = useState<Record<number, string>>({});
  const [closing, setClosing] = useState(false);
  const [ownerTakesSeat, setOwnerTakesSeat] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q: Record<string, string> = { page: String(page), pageSize: "20" };
      if (debounced) q.search = debounced;
      const res = await orgAdminService.list(q);
      const data = res.data?.data;
      setRows(data?.data || []);
      setTotalPages(data?.totalPages ?? 1);
      setDisabled(false);
    } catch (e: any) {
      if (e?.response?.status === 404) setDisabled(true);
      else toast.error(errMsg(e, "Failed to load organizations"));
    } finally {
      setLoading(false);
    }
  }, [page, debounced]);

  useEffect(() => {
    load();
  }, [load]);

  // Arrive from a demo request with the lead's details pre-filled.
  useEffect(() => {
    if (params.get("create") !== "1") return;
    setForm((f) => ({
      ...f,
      name: params.get("name") ?? "",
      ownerEmail: params.get("ownerEmail") ?? "",
      billingEmail: params.get("billingEmail") ?? "",
      demoRequestId: params.get("demoRequestId") ?? "",
    }));
    setCreateOpen(true);
  }, [params]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setSaving(true);
    try {
      const domains = form.allowedEmailDomains
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean);
      const res = await orgAdminService.create({
        name: form.name,
        ownerEmail: form.ownerEmail,
        billingEmail: form.billingEmail || form.ownerEmail,
        gstin: form.gstin || null,
        allowedEmailDomains: domains,
        demoRequestId: form.demoRequestId ? Number(form.demoRequestId) : null,
        ownerTakesSeat,
        billingMode: form.billingMode,
        billingCycle: form.billingCycle,
        seats: Number(form.seats),
        minSeats: Number(form.minSeats),
        pricePerSeat: Number(form.pricePerSeat),
        defaultRole: {
          name: form.roleName || "Member",
          monthlyTokens: Number(form.roleTokens || 0),
          monthlyVideoCredits: Number(form.roleVideoCredits || 0),
        },
      });
      setInviteUrl(res.data?.data?.ownerInviteUrl ?? null);
      setInviteEmail({ sent: Boolean(res.data?.data?.ownerInviteEmailSent), to: res.data?.data?.ownerEmail ?? form.ownerEmail });
      toast.success("Organization created");
      load();
    } catch (e: any) {
      toast.error(errMsg(e, "Failed to create organization"));
    } finally {
      setSaving(false);
    }
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setInviteUrl(null);
    setInviteEmail(null);
    setCopied(false);
  };

  const openDetail = async (o: OrgRow) => {
    setActive(o);
    setBills([]);
    try {
      const [res, b] = await Promise.all([orgAdminService.get(o.id), orgAdminService.bills(o.id)]);
      setActive(res.data?.data);
      setBills(b.data?.data ?? []);
    } catch {
      /* keep the list row */
    }
  };

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (!active) return;
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      const [res, b] = await Promise.all([orgAdminService.get(active.id), orgAdminService.bills(active.id)]);
      setActive(res.data?.data);
      setBills(b.data?.data ?? []);
      load();
    } catch (e: any) {
      toast.error(errMsg(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const sub = (o: OrgRow) => o.subscriptions?.[0];

  if (disabled) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong py-16 text-center text-sm text-muted-foreground">
        Enterprise organizations aren&apos;t enabled on this server (ENTERPRISE_ENABLED).
      </div>
    );
  }

  const canSubmit =
    form.name.trim() && form.ownerEmail.trim() && Number(form.seats) >= 1 && form.pricePerSeat !== "" && Number(form.roleTokens || 0) >= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Organizations</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Business accounts with per-seat billing. Create one from a demo request.</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New organization
        </Button>
      </div>

      <div className="relative w-full max-w-[300px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search name or billing email"
          className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary/50"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong py-16 text-center text-sm text-muted-foreground">
          No organizations yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-sunken text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Organization</th>
                <th className="px-4 py-2.5 font-medium">Seats</th>
                <th className="px-4 py-2.5 font-medium">Billing</th>
                <th className="px-4 py-2.5 font-medium">Subscription</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} onClick={() => openDetail(o)} className="cursor-pointer border-t border-border hover:bg-sidebar-accent">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{o.name}</div>
                    <div className="text-xs text-muted-foreground">{o.billingEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    {o._count.members} / {sub(o)?.seatsPurchased ?? " "}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {sub(o) ? (sub(o)!.billingMode === "CASHFREE" ? "Cashfree" : "Manual invoice") : " "}
                  </td>
                  <td className="px-4 py-3">
                    {sub(o) && <Badge className={`${statusStyle[sub(o)!.status] ?? ""} border-0`}>{sub(o)!.status}</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`${statusStyle[o.status] ?? ""} border-0`}>{o.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && closeCreate()}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader className="text-left">
            <DialogTitle>{inviteUrl ? "Organization created" : "New organization"}</DialogTitle>
            <DialogDescription>
              {inviteUrl
                ? inviteEmail?.sent
                  ? `We emailed this link to ${inviteEmail.to}. It's shown here once and expires in 7 days.`
                  : "The email could not be sent. Send this link to the owner yourself. It's shown once and expires in 7 days."
                : "Seat price and quotas are set per organization. The owner gets an invite link to create their account."}
            </DialogDescription>
          </DialogHeader>

          {inviteUrl ? (
            <div className="space-y-3">
              <div className="break-all rounded-xl bg-sunken p-3.5 text-sm">{inviteUrl}</div>
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl);
                  setCopied(true);
                }}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy link"}
              </Button>
              <DialogFooter>
                <Button onClick={closeCreate}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company name">
                  <input className={inputCls} value={form.name} onChange={set("name")} />
                </Field>
                <Field label="GSTIN (optional)">
                  <input className={inputCls} value={form.gstin} onChange={set("gstin")} />
                </Field>
                <Field label="Owner email" hint="Must be a new email no existing account.">
                  <input className={inputCls} type="email" value={form.ownerEmail} onChange={set("ownerEmail")} />
                </Field>
                <Field label="Billing email">
                  <input className={inputCls} type="email" value={form.billingEmail} onChange={set("billingEmail")} placeholder="Defaults to owner email" />
                </Field>
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" className="mt-0.5" checked={ownerTakesSeat} onChange={(e) => setOwnerTakesSeat(e.target.checked)} />
                  <span>
                    Owner also uses the product (takes a seat)
                    <span className="block text-xs text-faint">Untick if the owner only manages the organization. This can be changed later.</span>
                  </span>
                </label>
                <Field label="Allowed email domains" hint="Comma separated. Empty = any domain.">
                  <input className={inputCls} value={form.allowedEmailDomains} onChange={set("allowedEmailDomains")} placeholder="acme.com, acme.in" />
                </Field>
                <Field label="Billing mode">
                  <select className={inputCls} value={form.billingMode} onChange={set("billingMode")}>
                    <option value="MANUAL_INVOICE">Manual invoice</option>
                    <option value="CASHFREE">Cashfree</option>
                  </select>
                </Field>
                <Field label="Seats">
                  <input className={inputCls} type="number" min={1} value={form.seats} onChange={set("seats")} />
                </Field>
                <Field label="Minimum seats">
                  <input className={inputCls} type="number" min={1} value={form.minSeats} onChange={set("minSeats")} />
                </Field>
                <Field label="Price per seat per month (₹, excl. GST)">
                  <input className={inputCls} type="number" min={0} value={form.pricePerSeat} onChange={set("pricePerSeat")} />
                </Field>
                <Field label="Billing cycle">
                  <select className={inputCls} value={form.billingCycle} onChange={set("billingCycle")}>
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </Field>
              </div>

              <div className="rounded-xl border border-border p-3.5">
                <div className="mb-2 text-xs font-semibold text-muted-foreground">First role (the org admin can add more later)</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Role name">
                    <input className={inputCls} value={form.roleName} onChange={set("roleName")} />
                  </Field>
                  <Field label="Monthly tokens / seat">
                    <input className={inputCls} type="number" min={0} value={form.roleTokens} onChange={set("roleTokens")} />
                  </Field>
                  <Field label="Video credits / seat">
                    <input className={inputCls} type="number" min={0} value={form.roleVideoCredits} onChange={set("roleVideoCredits")} />
                  </Field>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={closeCreate}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={saving || !canSubmit}>
                  {saving ? "Creating…" : "Create organization"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detail */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[560px]">
          {active && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="flex items-center gap-2">
                  {active.name}
                  <Badge className={`${statusStyle[active.status] ?? ""} border-0`}>{active.status}</Badge>
                </DialogTitle>
                <DialogDescription>{active.billingEmail}</DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                {sub(active) && (
                  <div className="grid gap-1.5 rounded-xl bg-sunken p-3.5">
                    <div>
                      Subscription: <b>{sub(active)!.status}</b> · {sub(active)!.billingMode === "CASHFREE" ? "Cashfree" : "Manual invoice"} ·{" "}
                      {sub(active)!.billingCycle.toLowerCase()}
                    </div>
                    <div>
                      Seats: {active._count.members} active / {sub(active)!.seatsPurchased} purchased (min {sub(active)!.minSeats})
                    </div>
                    <div>₹{Number(sub(active)!.pricePerSeat).toLocaleString("en-IN")} per seat, plus GST</div>
                    {sub(active)!.currentPeriodEnd && (
                      <div>Current period ends {new Date(sub(active)!.currentPeriodEnd!).toLocaleDateString()}</div>
                    )}
                  </div>
                )}
                {active.gstin && <div className="text-muted-foreground">GSTIN {active.gstin}</div>}
                {!!active.allowedEmailDomains?.length && (
                  <div className="text-muted-foreground">Domains: {active.allowedEmailDomains.join(", ")}</div>
                )}
                {!!active.invites?.length && (
                  <div className="text-muted-foreground">
                    Pending invites: {active.invites.map((i) => `${i.email} (${i.memberRole.toLowerCase()})`).join(", ")}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                {active.status === "ACTIVE" ? (
                  <Button variant="outline" className="text-destructive" disabled={busy} onClick={() => run(() => orgAdminService.setStatus(active.id, "SUSPENDED"), "Organization suspended")}>
                    Suspend
                  </Button>
                ) : active.status === "SUSPENDED" ? (
                  <Button variant="outline" disabled={busy} onClick={() => run(() => orgAdminService.setStatus(active.id, "ACTIVE"), "Organization reactivated")}>
                    Reactivate
                  </Button>
                ) : (
                  <span />
                )}
              </DialogFooter>

              {active.status !== "CLOSED" && (
                <div className="rounded-lg border border-border p-3 text-sm">
                  <div className="font-medium">Close organization</div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Members become regular Free users (their chats stay theirs), funded tokens are removed and open invoices are cancelled. Invoices and the audit log are kept. This can&apos;t be undone.
                  </p>
                  {!closing ? (
                    <Button variant="outline" size="sm" className="mt-2 text-destructive" onClick={() => setClosing(true)}>
                      Close…
                    </Button>
                  ) : (
                    <div className="mt-2 flex gap-2">
                      <Button variant="destructive" size="sm" disabled={busy} onClick={() => run(() => orgAdminService.close(active.id), "Organization closed").then(() => setClosing(false))}>
                        Yes, close {active.name}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setClosing(false)}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2 border-t border-border pt-4">
                <div className="text-xs font-semibold text-muted-foreground">Invoices</div>
                {bills.length === 0 && <div className="text-sm text-muted-foreground">No invoices.</div>}
                {bills.map((b) => (
                  <div key={b.id} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <b>{b.number}</b> · {b.kind.replace("_", " ").toLowerCase()} · ₹{Number(b.totalAmount).toLocaleString("en-IN")}
                      </div>
                      <Badge className={`${b.status === "PAID" ? "bg-ok/15 text-ok" : "bg-accent-soft text-accent-ink"} border-0`}>{b.status}</Badge>
                    </div>
                    {b.status === "DUE" && (
                      <div className="mt-2 flex gap-2">
                        <input
                          className={inputCls}
                          placeholder="Bank reference / UTR"
                          value={payRef[b.id] ?? ""}
                          onChange={(e) => setPayRef((r) => ({ ...r, [b.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          disabled={busy || !(payRef[b.id] ?? "").trim()}
                          onClick={() => run(() => orgAdminService.markBillPaid(active.id, b.id, payRef[b.id].trim()), "Invoice marked paid")}
                        >
                          Mark paid
                        </Button>
                      </div>
                    )}
                    {b.status === "PAID" && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {b.paymentMethod === "BANK_TRANSFER" ? "Bank transfer" : "Online"}
                        {b.paymentReference ? ` · ${b.paymentReference}` : ""}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OrgsAdminPage() {
  return (
    <Suspense fallback={null}>
      <OrgsAdminContent />
    </Suspense>
  );
}
