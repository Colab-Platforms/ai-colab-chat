"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Loader2, MoreHorizontal, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useAuth } from "@/context/auth-context";
import { orgService } from "@/lib/services";
import { toast } from "@/lib/toast";

type MemberRole = "OWNER" | "ADMIN" | "MEMBER";

interface Role {
  id: number;
  name: string;
  isDefault: boolean;
}
interface Member {
  id: number;
  memberRole: MemberRole;
  status: "ACTIVE" | "SUSPENDED" | "REMOVED" | "INVITED";
  takesSeat: boolean;
  role: { id: number; name: string; monthlyTokens: number };
  user: { id: number; firstName: string; lastName: string; email: string };
  tokensRemaining: number;
  tokensUsed: number;
  lastActiveAt: string | null;
}
interface Invite {
  id: number;
  email: string;
  memberRole: MemberRole;
  expiresAt: string;
  role: { id: number; name: string };
}
interface InviteResult {
  email: string;
  ok: boolean;
  error?: string;
  inviteUrl?: string;
  emailSent?: boolean;
}

const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;
const fmt = (n: number) => n.toLocaleString("en-IN");
const statusStyle: Record<string, string> = {
  ACTIVE: "bg-ok/15 text-ok",
  SUSPENDED: "bg-sunken text-faint",
};
const selectCls = "h-9 rounded-lg border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary/50";

export default function OrgMembersPage() {
  const { user } = useAuth();
  const myRole = user?.orgMembership?.memberRole;
  const isOwner = myRole === "OWNER";

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [inviteOpen, setInviteOpen] = useState(false);
  const [emails, setEmails] = useState("");
  const [inviteRoleId, setInviteRoleId] = useState<number | "">("");
  const [inviteMemberRole, setInviteMemberRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [inviteTakesSeat, setInviteTakesSeat] = useState(true);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<InviteResult[] | null>(null);

  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const [m, i, r] = await Promise.all([
        orgService.listMembers(debounced ? { search: debounced } : undefined),
        orgService.listInvites(),
        orgService.listRoles(),
      ]);
      setMembers(m.data?.data ?? []);
      setInvites(i.data?.data ?? []);
      const rl: Role[] = r.data?.data ?? [];
      setRoles(rl);
      setInviteRoleId((cur) => cur || rl.find((x) => x.isDefault)?.id || rl[0]?.id || "");
    } catch (e) {
      toast.error(errMsg(e, "Failed to load members"));
    } finally {
      setLoading(false);
    }
  }, [debounced]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Action failed"));
    }
  };

  const canManage = (m: Member) => m.user.id !== user?.id && (isOwner || m.memberRole === "MEMBER");
  // Owners decide, for every admin (themselves included), whether that person uses a seat.
  const canToggleSeat = (m: Member) => isOwner && m.memberRole !== "MEMBER" && m.status === "ACTIVE";

  const sendInvites = async () => {
    const list = Array.from(new Set(emails.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)));
    if (!list.length || !inviteRoleId) return;
    setSending(true);
    try {
      const res = await orgService.invite(list.map((email) => ({ email, orgRoleId: Number(inviteRoleId), memberRole: inviteMemberRole, takesSeat: inviteMemberRole === "ADMIN" ? inviteTakesSeat : true })));
      setResults(res.data?.data ?? []);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to send invites"));
    } finally {
      setSending(false);
    }
  };

  const closeInvite = () => {
    setInviteOpen(false);
    setResults(null);
    setEmails("");
  };

  const handleRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await orgService.removeMember(removeTarget.id);
      toast.success("Member removed");
      setRemoveTarget(null);
      load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to remove member"));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Members</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Usage is shown per person. Conversations are private admins see usage, not chats.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setInviteOpen(true)} disabled={!roles.length}>
          <Plus className="h-4 w-4" /> Invite members
        </Button>
      </div>

      <div className="relative w-full max-w-[300px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email"
          className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-primary/50"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-sunken text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Member</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Tokens left / used</th>
                <th className="px-4 py-2.5 font-medium">Last active</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="w-10 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">
                      <Link href={`/org/members/${m.id}`} className="hover:underline">
                        {m.user.firstName} {m.user.lastName}
                      </Link>
                      {m.memberRole !== "MEMBER" && (
                        <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-ink">
                          {m.memberRole === "OWNER" ? "Owner" : "Admin"}
                        </span>
                      )}
                      {!m.takesSeat && (
                        <span className="ml-1.5 rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-muted-foreground">No seat</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{m.user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    {canManage(m) ? (
                      <select
                        className={selectCls}
                        value={m.role.id}
                        onChange={(e) => act(() => orgService.updateMember(m.id, { orgRoleId: Number(e.target.value) }), "Role updated")}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      m.role.name
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {m.takesSeat ? `${fmt(m.tokensRemaining)} / ${fmt(m.tokensUsed)}` : "Manage only"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                    {m.lastActiveAt ? new Date(m.lastActiveAt).toLocaleDateString() : " "}
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={`${statusStyle[m.status] ?? ""} border-0`}>{m.status}</Badge>
                  </td>
                  <td className="px-2 py-3">
                    {(canManage(m) || canToggleSeat(m)) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Member actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canToggleSeat(m) && (
                            <DropdownMenuItem
                              onClick={() =>
                                act(
                                  () => orgService.updateMember(m.id, { takesSeat: !m.takesSeat }),
                                  m.takesSeat ? "Seat released manage only" : "Seat assigned",
                                )
                              }
                            >
                              {m.takesSeat ? "Manage only (free up seat)" : "Give a seat"}
                            </DropdownMenuItem>
                          )}
                          {!canManage(m) ? null : m.status === "ACTIVE" ? (
                            <DropdownMenuItem onClick={() => act(() => orgService.updateMember(m.id, { status: "SUSPENDED" }), "Member suspended")}>
                              Suspend
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => act(() => orgService.updateMember(m.id, { status: "ACTIVE" }), "Member reactivated")}>
                              Reactivate
                            </DropdownMenuItem>
                          )}
                          {canManage(m) && isOwner && m.memberRole === "MEMBER" && (
                            <DropdownMenuItem onClick={() => act(() => orgService.updateMember(m.id, { memberRole: "ADMIN" }), "Made admin")}>
                              Make admin
                            </DropdownMenuItem>
                          )}
                          {canManage(m) && isOwner && m.memberRole === "ADMIN" && (
                            <DropdownMenuItem onClick={() => act(() => orgService.updateMember(m.id, { memberRole: "MEMBER" }), "Admin rights removed")}>
                              Remove admin rights
                            </DropdownMenuItem>
                          )}
                          {canManage(m) && (
                            <DropdownMenuItem className="text-destructive" onClick={() => setRemoveTarget(m)}>
                              Remove from organization
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    No members match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {invites.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">Pending invitations</h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {invites.map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div>
                  <span className="font-medium">{i.email}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {i.role.name} · expires {new Date(i.expiresAt).toLocaleDateString()}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => act(() => orgService.revokeInvite(i.id), "Invitation revoked")}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={inviteOpen} onOpenChange={(o) => !o && closeInvite()}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader className="text-left">
            <DialogTitle>{results ? "Invitations" : "Invite members"}</DialogTitle>
            <DialogDescription>
              {results ? "Each person gets an email. Copy a link if you want to send it yourself." : "Enter one or more work emails. Everyone invited here gets the role below."}
            </DialogDescription>
          </DialogHeader>

          {results ? (
            <div className="space-y-2 text-sm">
              {results.map((r) => (
                <div key={r.email} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.email}</span>
                    <span className={r.ok ? "text-ok" : "text-destructive"}>{r.ok ? (r.emailSent ? "Sent" : "Created") : "Failed"}</span>
                  </div>
                  {!r.ok && <p className="mt-1 text-xs text-muted-foreground">{r.error}</p>}
                  {r.ok && r.inviteUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-1 h-7 gap-1.5 px-2 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(r.inviteUrl!);
                        toast.success("Link copied");
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy invite link
                    </Button>
                  )}
                </div>
              ))}
              <DialogFooter>
                <Button onClick={closeInvite}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <Textarea value={emails} onChange={(e) => setEmails(e.target.value)} rows={4} placeholder="alex@company.com, sam@company.com" />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Role</span>
                  <select className={`${selectCls} w-full`} value={inviteRoleId} onChange={(e) => setInviteRoleId(Number(e.target.value))}>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                {isOwner && (
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">Permissions</span>
                    <select className={`${selectCls} w-full`} value={inviteMemberRole} onChange={(e) => setInviteMemberRole(e.target.value as "MEMBER" | "ADMIN")}>
                      <option value="MEMBER">Member</option>
                      <option value="ADMIN">Organization admin</option>
                    </select>
                  </label>
                )}
              </div>
              {isOwner && inviteMemberRole === "ADMIN" && (
                <label className="flex items-start gap-2 rounded-lg bg-sunken p-3 text-sm">
                  <input type="checkbox" className="mt-0.5" checked={inviteTakesSeat} onChange={(e) => setInviteTakesSeat(e.target.checked)} />
                  <span>
                    Also uses the product (takes a seat)
                    <span className="block text-xs text-muted-foreground">Leave unticked for someone who only manages the organization: no seat is used and they get no tokens.</span>
                  </span>
                </label>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={closeInvite}>
                  Cancel
                </Button>
                <Button onClick={sendInvites} disabled={sending || !emails.trim() || !inviteRoleId}>
                  {sending ? "Sending…" : "Send invitations"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(o) => !o && setRemoveTarget(null)}
        title="Remove member"
        description={`${removeTarget?.user.firstName ?? "This person"} will lose access and their remaining tokens. Their conversations stay private to their account.`}
        onConfirm={handleRemove}
        loading={removing}
      />
    </div>
  );
}
