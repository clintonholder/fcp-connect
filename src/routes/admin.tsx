import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RequireAuth } from "@/components/RequireAuth";
import { useMyRoles, PERMISSIONS, type PermissionKey } from "@/lib/roles";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Shield, UserPlus, Send, Ban, RotateCcw, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  adminListUsers, adminListAudit, adminInviteUser, adminResendInvite,
  adminSetUserDisabled, adminSetUserRoles, adminSaveRole,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — FCP Connect" },
      { name: "description", content: "Manage FCP Connect users, roles, invitations and the audit history." },
      { property: "og:title", content: "Admin — FCP Connect" },
      { property: "og:description", content: "Manage FCP Connect users, roles, invitations and the audit history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <RequireAuth><AdminGate /></RequireAuth>,
});

function AdminGate() {
  const { isAdmin, loading } = useMyRoles();
  if (loading) return <p className="p-6 text-muted-foreground">Loading…</p>;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <Shield className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h1 className="mt-3 text-xl font-semibold">Administrators only</h1>
        <p className="text-sm text-muted-foreground">You don't have permission to view this page.</p>
      </div>
    );
  }
  return <AdminPage />;
}

const statusVariant = (s: string) =>
  s === "Active" ? "secondary" : s === "Disabled" || s === "Expired" ? "destructive" : "outline";

function AdminPage() {
  const qc = useQueryClient();
  const listUsers = useServerFn(adminListUsers);
  const listAudit = useServerFn(adminListAudit);
  const invite = useServerFn(adminInviteUser);
  const resend = useServerFn(adminResendInvite);
  const setDisabled = useServerFn(adminSetUserDisabled);
  const setRoles = useServerFn(adminSetUserRoles);
  const saveRole = useServerFn(adminSaveRole);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", displayName: "", roleId: "" });
  const [roleOpen, setRoleOpen] = useState(false);
  const emptyPerms = Object.fromEntries(PERMISSIONS.map((p) => [p.key, true])) as Record<PermissionKey, boolean>;
  const [roleForm, setRoleForm] = useState<{ id?: string; name: string; permissions: Record<PermissionKey, boolean> }>(
    { name: "", permissions: emptyPerms },
  );

  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => listUsers({}) });
  const audit = useQuery({ queryKey: ["admin-audit"], queryFn: () => listAudit({}) });
  const roles = useQuery({
    queryKey: ["app-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_roles").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-audit"] });
    qc.invalidateQueries({ queryKey: ["app-roles"] });
    qc.invalidateQueries({ queryKey: ["my-roles"] });
  };

  const fail = (e: unknown) => {
    const msg = (e as Error).message || "Something went wrong";
    toast.error(msg.includes("LAST_ADMIN") ? "This is the last active administrator — assign another admin first." : msg);
  };

  const inviteMut = useMutation({
    mutationFn: () => invite({
      data: {
        email: inviteForm.email,
        displayName: inviteForm.displayName,
        roleId: inviteForm.roleId || null,
        origin: window.location.origin,
      },
    }),
    onSuccess: () => {
      toast.success("Invitation sent");
      setInviteForm({ email: "", displayName: "", roleId: "" });
      setInviteOpen(false);
      refresh();
    },
    onError: fail,
  });

  const roleMut = useMutation({
    mutationFn: () => saveRole({ data: { id: roleForm.id, name: roleForm.name, permissions: roleForm.permissions } }),
    onSuccess: () => { toast.success("Role saved"); setRoleOpen(false); setRoleForm({ name: "", permissions: emptyPerms }); refresh(); },
    onError: fail,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><Shield className="h-6 w-6 text-primary" />Admin</h1>
          <p className="text-sm text-muted-foreground">Users, roles and audit history</p>
        </div>
        <Button onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4 mr-1" />New User</Button>
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a user</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); inviteMut.mutate(); }}>
            <div><Label htmlFor="i-name">Full name *</Label><Input id="i-name" required value={inviteForm.displayName} onChange={(e) => setInviteForm({ ...inviteForm, displayName: e.target.value })} /></div>
            <div><Label htmlFor="i-email">Work email *</Label><Input id="i-email" type="email" required value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} /></div>
            <div>
              <Label htmlFor="i-role">Role</Label>
              <select id="i-role" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={inviteForm.roleId} onChange={(e) => setInviteForm({ ...inviteForm, roleId: e.target.value })}>
                <option value="">No role yet</option>
                {(roles.data ?? []).filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">Invited people receive an email and choose their own password. Passwords are never shown or stored here.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="submit" disabled={inviteMut.isPending || createMut.isPending}>
                {inviteMut.isPending ? "Sending…" : "Add and send invitation"}
              </Button>
              <Button type="button" variant="secondary" disabled={inviteMut.isPending || createMut.isPending}
                onClick={() => createMut.mutate()}>
                {createMut.isPending ? "Adding…" : "Add without invitation"}
              </Button>
            </div>
            <Button type="button" variant="outline" className="w-full" onClick={() => setInviteOpen(false)}>Cancel</Button>
          </form>
        </DialogContent>
      </Dialog>


      <section>
        <h2 className="mb-3 text-lg font-semibold">Users</h2>
        <Card><CardContent className="space-y-2 p-3">
          {users.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {users.error && <p className="text-sm text-destructive">{(users.error as Error).message}</p>}
          {(users.data?.users ?? []).map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{u.display_name || u.email}</span>
                  <Badge variant={statusVariant(u.status)}>{u.status}</Badge>
                </div>
                <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {u.roles.length === 0 && <span className="text-xs text-muted-foreground">No role</span>}
                  {u.roles.map((r) => <Badge key={r.id} variant="outline">{r.name}</Badge>)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  value={u.roles[0]?.id ?? ""}
                  onChange={async (e) => {
                    const roleIds = e.target.value ? [e.target.value] : [];
                    try {
                      await setRoles({ data: { userId: u.id, roleIds } });
                      toast.success("Role updated"); refresh();
                    } catch (err) { fail(err); }
                  }}
                >
                  <option value="">No role</option>
                  {(roles.data ?? []).filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={async () => {
                  try { await resend({ data: { email: u.email, origin: window.location.origin } }); toast.success("Invitation resent"); refresh(); }
                  catch (err) { fail(err); }
                }}><Send className="h-3.5 w-3.5 mr-1" />Resend</Button>
                <Button size="sm" variant={u.is_disabled ? "outline" : "destructive"} onClick={async () => {
                  const next = !u.is_disabled;
                  if (next && !window.confirm(`Disable ${u.display_name || u.email}? They will not be able to sign in.`)) return;
                  try {
                    await setDisabled({ data: { userId: u.id, disabled: next } });
                    toast.success(next ? "User disabled" : "User reactivated"); refresh();
                  } catch (err) {
                    if ((err as Error).message?.includes("LAST_ADMIN")) {
                      if (window.confirm("This is the last active administrator. Disable anyway? Nobody will be able to manage users.")) {
                        try { await setDisabled({ data: { userId: u.id, disabled: next, force: true } }); toast.success("User disabled"); refresh(); }
                        catch (e2) { fail(e2); }
                      }
                      return;
                    }
                    fail(err);
                  }
                }}>
                  {u.is_disabled ? <><RotateCcw className="h-3.5 w-3.5 mr-1" />Reactivate</> : <><Ban className="h-3.5 w-3.5 mr-1" />Disable</>}
                </Button>
              </div>
            </div>
          ))}
        </CardContent></Card>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Roles</h2>
          <Button size="sm" variant="outline" onClick={() => { setRoleForm({ name: "", permissions: emptyPerms }); setRoleOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" />Add role
          </Button>
        </div>
        <Card><CardContent className="space-y-2 p-3">
          {(roles.data ?? []).map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{r.name}</span>
                {r.is_admin && <Badge variant="secondary">Administrator</Badge>}
                {!r.is_active && <Badge variant="outline">Inactive</Badge>}
                {!r.is_admin && PERMISSIONS.filter((p) => (r as Record<string, unknown>)[p.key] === true).map((p) => (
                  <Badge key={p.key} variant="outline" className="font-normal">{p.label}</Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => {
                  setRoleForm({
                    id: r.id,
                    name: r.name,
                    permissions: Object.fromEntries(
                      PERMISSIONS.map((p) => [p.key, (r as Record<string, unknown>)[p.key] !== false]),
                    ) as Record<PermissionKey, boolean>,
                  });
                  setRoleOpen(true);
                }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try { await saveRole({ data: { id: r.id, name: r.name, isActive: !r.is_active } }); toast.success("Role updated"); refresh(); }
                  catch (e) { fail(e); }
                }}>{r.is_active ? "Deactivate" : "Reactivate"}</Button>
              </div>
            </div>
          ))}
        </CardContent></Card>
      </section>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{roleForm.id ? "Edit role" : "New role"}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); roleMut.mutate(); }}>
            <div><Label htmlFor="r-name">Role name *</Label><Input id="r-name" required value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} /></div>
            <div>
              <Label>Permissions</Label>
              <p className="mb-2 text-xs text-muted-foreground">Choose what people with this role are allowed to do.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {PERMISSIONS.map((p) => (
                  <label key={p.key} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <Checkbox
                      checked={roleForm.permissions[p.key]}
                      onCheckedChange={(v) =>
                        setRoleForm({ ...roleForm, permissions: { ...roleForm.permissions, [p.key]: v === true } })
                      }
                    />
                    {p.label}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Administrators always have full access.</p>
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={roleMut.isPending}>Save</Button>
              <Button type="button" variant="outline" className="flex-1" onClick={() => setRoleOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Audit history</h2>
        <Card><CardContent className="p-3">
          {(audit.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>}
          <ul className="space-y-2">
            {(audit.data ?? []).map((a) => (
              <li key={a.id} className="flex justify-between gap-2 text-sm">
                <span><span className="font-medium">{a.actor_name}</span> — {String(a.action).replace(/_/g, " ")}</span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      </section>
    </div>
  );
}
