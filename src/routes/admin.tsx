import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
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
import { Shield, UserPlus, Send, Ban, RotateCcw, Plus, Pencil, KeyRound, Trash2, Check, X, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  adminListUsers, adminListAudit, adminInviteUser, adminResendInvite,
  adminSetUserDisabled, adminSetUserRoles, adminSaveRole,
  adminSendPasswordReset, adminDeleteUser, adminCreateUser, adminUpdateUser,
  adminSetUserDivisions, adminDeleteRole, adminStartProxy,
} from "@/lib/admin.functions";
import { DIVISIONS } from "@/lib/project-meta";
import { useProxy } from "@/lib/proxy-context";
import { workerTypeLabel, type WorkerType } from "@/lib/worker-type";
import { useAuth } from "@/lib/auth-context";
import { useNavigate } from "@tanstack/react-router";
import { Eye } from "lucide-react";

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
  const { readOnly } = useProxy();
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
  if (readOnly) {
    return (
      <div className="mx-auto max-w-lg p-10 text-center">
        <Eye className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <h1 className="mt-3 text-xl font-semibold">Admin page unavailable</h1>
        <p className="text-sm text-muted-foreground">
          The admin page is unavailable while viewing as another user. Use "Exit view" first.
        </p>
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
  const deleteRole = useServerFn(adminDeleteRole);
  const createUser = useServerFn(adminCreateUser);
  const sendReset = useServerFn(adminSendPasswordReset);
  const deleteUser = useServerFn(adminDeleteUser);
  const updateUser = useServerFn(adminUpdateUser);
  const setDivisions = useServerFn(adminSetUserDivisions);
  const startProxy = useServerFn(adminStartProxy);
  const { setProxy } = useProxy();
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const emptyInviteForm = { email: "", displayName: "", roleId: "", workerType: "employee" as WorkerType, subcontractorName: "" };
  const [inviteForm, setInviteForm] = useState(emptyInviteForm);

  const [roleOpen, setRoleOpen] = useState(false);
  const emptyPerms = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.key === "can_view_safety"])) as Record<PermissionKey, boolean>;
  const [roleForm, setRoleForm] = useState<{ id?: string; name: string; isDirector: boolean; permissions: Record<PermissionKey, boolean> }>(
    { name: "", isDirector: false, permissions: emptyPerms },
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
        workerType: inviteForm.workerType,
        subcontractorName: inviteForm.subcontractorName,
        origin: window.location.origin,
      },
    }),
    onSuccess: () => {
      toast.success("Invitation sent");
      setInviteForm(emptyInviteForm);
      setInviteOpen(false);
      refresh();
    },
    onError: fail,
  });

  const createMut = useMutation({
    mutationFn: () => {
      if (!inviteForm.displayName.trim() || !inviteForm.email.trim()) {
        return Promise.reject(new Error("A name and a valid email address are required"));
      }
      if (inviteForm.workerType === "subcontractor" && !inviteForm.subcontractorName.trim()) {
        return Promise.reject(new Error("A Sub Contractor name is required"));
      }
      return createUser({
        data: {
          email: inviteForm.email,
          displayName: inviteForm.displayName,
          roleId: inviteForm.roleId || null,
          workerType: inviteForm.workerType,
          subcontractorName: inviteForm.subcontractorName,
        },
      });
    },
    onSuccess: () => {
      toast.success("User added — invitation pending");
      setInviteForm(emptyInviteForm);
      setInviteOpen(false);
      refresh();
    },
    onError: fail,
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!editUserId) return Promise.reject(new Error("No user selected"));
      if (!inviteForm.displayName.trim() || !inviteForm.email.trim()) {
        return Promise.reject(new Error("A name and a valid email address are required"));
      }
      if (inviteForm.workerType === "subcontractor" && !inviteForm.subcontractorName.trim()) {
        return Promise.reject(new Error("A Sub Contractor name is required"));
      }
      return updateUser({
        data: {
          userId: editUserId,
          email: inviteForm.email,
          displayName: inviteForm.displayName,
          roleId: inviteForm.roleId || null,
          workerType: inviteForm.workerType,
          subcontractorName: inviteForm.subcontractorName,
        },
      });
    },
    onSuccess: () => {
      toast.success("Changes saved");
      setInviteForm(emptyInviteForm);
      setEditUserId(null);
      setInviteOpen(false);
      refresh();
    },
    onError: fail,
  });


  const roleMut = useMutation({
    mutationFn: () => saveRole({ data: { id: roleForm.id, name: roleForm.name, isDirector: roleForm.isDirector, permissions: roleForm.permissions } }),
    onSuccess: () => { toast.success("Role saved"); setRoleOpen(false); setRoleForm({ name: "", isDirector: false, permissions: emptyPerms }); refresh(); },
    onError: fail,
  });

  const deleteRoleMut = useMutation({
    mutationFn: (r: { id: string; name: string }) => deleteRole({ data: { roleId: r.id } }),
    onSuccess: (_res, r) => { toast.success(`Role "${r.name}" deleted`); refresh(); },
    onError: fail,
  });

  const [permissionSaveStatus, setPermissionSaveStatus] = useState<{
    roleName: string;
    permissionName: string;
    state: "saving" | "saved" | "error";
    message?: string;
  } | null>(null);
  const permissionMut = useMutation({
    mutationFn: ({
      role,
      permission,
      enabled,
    }: {
      role: { id: string; name: string };
      permission: (typeof PERMISSIONS)[number];
      enabled: boolean;
    }) => saveRole({
      data: {
        id: role.id,
        name: role.name,
        permissions: { [permission.key]: enabled } as Partial<Record<PermissionKey, boolean>>,
      },
    }),
    onMutate: ({ role, permission }) => {
      setPermissionSaveStatus({ roleName: role.name, permissionName: permLabel(permission), state: "saving" });
    },
    onSuccess: (_result, { role, permission }) => {
      setPermissionSaveStatus({ roleName: role.name, permissionName: permLabel(permission), state: "saved" });
      refresh();
    },
    onError: (error, { role, permission }) => {
      const message = (error as Error).message || "Permission could not be saved.";
      setPermissionSaveStatus({ roleName: role.name, permissionName: permLabel(permission), state: "error", message });
      fail(error);
    },
  });

  const openRoleEditor = (r: NonNullable<typeof roles.data>[number]) => {
    setRoleForm({
      id: r.id,
      name: r.name,
      isDirector: r.is_director === true,
      permissions: Object.fromEntries(
        PERMISSIONS.map((p) => [p.key, (r as Record<string, unknown>)[p.key] !== false]),
      ) as Record<PermissionKey, boolean>,
    });
    setRoleOpen(true);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl"><Shield className="h-6 w-6 text-primary" />Admin</h1>
        <p className="text-sm text-muted-foreground">Users, roles and audit history</p>
      </div>

      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) setEditUserId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editUserId ? "Modify a user" : "Add a user"}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (editUserId) updateMut.mutate(); else inviteMut.mutate(); }}>
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
            <div>
              <Label htmlFor="i-worker-type">FCP Employee / Sub Contractor</Label>
              <select id="i-worker-type" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={inviteForm.workerType} onChange={(e) => setInviteForm({ ...inviteForm, workerType: e.target.value as WorkerType })}>
                <option value="employee">FCP Employee</option>
                <option value="subcontractor">Sub Contractor</option>
              </select>
            </div>
            {inviteForm.workerType === "subcontractor" && (
              <div><Label htmlFor="i-sub-name">Sub Contractor name *</Label><Input id="i-sub-name" required value={inviteForm.subcontractorName} onChange={(e) => setInviteForm({ ...inviteForm, subcontractorName: e.target.value })} /></div>
            )}
            <p className="text-xs text-muted-foreground">
              {editUserId
                ? "Passwords cannot be changed here — use Send password reset on the person's row."
                : "Invited people receive an email and choose their own password. Passwords are never shown or stored here."}
            </p>
            {editUserId ? (
              <Button type="submit" className="w-full" disabled={updateMut.isPending}>
                {updateMut.isPending ? "Saving…" : "Save Changes"}
              </Button>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="submit" disabled={inviteMut.isPending || createMut.isPending}>
                  {inviteMut.isPending ? "Sending…" : "Add and send invitation"}
                </Button>
                <Button type="button" variant="secondary" disabled={inviteMut.isPending || createMut.isPending}
                  onClick={() => createMut.mutate()}>
                  {createMut.isPending ? "Adding…" : "Add without invitation"}
                </Button>
              </div>
            )}
            <Button type="button" variant="outline" className="w-full" onClick={() => { setInviteOpen(false); setEditUserId(null); }}>Cancel</Button>
          </form>
        </DialogContent>
      </Dialog>



      <div className="space-y-4">
        <AdminSection id="manage-roles" title="Manage Roles" level={3}
          actions={
            <Button size="sm" variant="outline" onClick={() => { setRoleForm({ name: "", isDirector: false, permissions: emptyPerms }); setRoleOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" />Add role
            </Button>
          }>
        <Card>
          <CardContent className="space-y-2 p-3">
            {(roles.data ?? []).filter((r) => !r.is_admin).length === 0 && (
              <p className="text-sm text-muted-foreground">No non-administrator roles yet.</p>
            )}
            {(roles.data ?? []).filter((r) => !r.is_admin).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{r.name}</span>
                  {r.is_director && <Badge variant="secondary">Division Director</Badge>}
                  {!r.is_active && <Badge variant="outline">Inactive</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => openRoleEditor(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    try { await saveRole({ data: { id: r.id, name: r.name, isActive: !r.is_active } }); toast.success("Role updated"); refresh(); }
                    catch (e) { fail(e); }
                  }}>{r.is_active ? "Deactivate" : "Reactivate"}</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" aria-label={`Delete ${r.name}`}
                    disabled={deleteRoleMut.isPending}
                    onClick={() => {
                      if (!window.confirm(`Delete the role "${r.name}"?\n\nThe role and its permission settings are removed permanently. This is only allowed when no user, invitation or project collaborator uses it. Audit history is kept.\n\nTo keep the role but stop using it, choose Deactivate instead.`)) return;
                      deleteRoleMut.mutate(r);
                    }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        </AdminSection>

        <AdminSection id="permission-matrix" title="Permission Matrix" level={3} defaultOpen={false}>
          <p className="mb-3 text-sm text-muted-foreground">Toggle an action for every non-administrator role. The first column stays visible while scrolling across roles.</p>
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-auto rounded-md" tabIndex={0} aria-label="Scrollable role permission matrix">
                <table aria-label="Role permission matrix" className="w-full min-w-max border-collapse text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className="sticky left-0 top-0 z-30 w-52 min-w-52 border-b bg-muted p-3 text-left font-semibold shadow-sm">Permission</th>
                      {(roles.data ?? []).filter((r) => !r.is_admin).map((r) => (
                        <th key={r.id} scope="col" className="sticky top-0 z-20 w-36 min-w-36 border-b bg-muted p-3 text-center font-semibold shadow-sm">
                          <span className="block break-words">{r.name}</span>
                          {!r.is_active && <span className="mt-1 block text-xs font-normal text-muted-foreground">Inactive</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSIONS.map((p) => (
                      <tr key={p.key}>
                        <th scope="row" className="sticky left-0 z-10 border-b bg-background p-3 text-left font-medium shadow-[2px_0_4px_-2px_rgba(0,0,0,0.2)]">{permLabel(p)}</th>
                        {(roles.data ?? []).filter((r) => !r.is_admin).map((r) => {
                          const enabled = (r as Record<string, unknown>)[p.key] === true;
                          const saving = permissionMut.isPending && permissionMut.variables?.role.id === r.id && permissionMut.variables.permission.key === p.key;
                          return (
                            <td key={r.id} className="border-b p-2 text-center">
                              <button
                                type="button"
                                aria-label={`${r.name} — ${permLabel(p)}`}
                                aria-pressed={enabled}
                                title={`${r.name} — ${permLabel(p)}: ${enabled ? "Enabled" : "Disabled"}. Activate to ${enabled ? "disable" : "enable"}.`}
                                disabled={permissionMut.isPending}
                                onClick={() => permissionMut.mutate({ role: r, permission: p, enabled: !enabled })}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full outline-none transition focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                              >
                                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 ${enabled ? "border-blue-600 bg-blue-600 text-white" : "border-muted-foreground/60 bg-background text-muted-foreground"}`}>
                                  {saving ? <span className="sr-only">Saving</span> : enabled ? <Check aria-hidden="true" className="h-4 w-4" /> : <X aria-hidden="true" className="h-4 w-4" />}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {(roles.data ?? []).filter((r) => !r.is_admin).length === 0 && (
                      <tr><td colSpan={(roles.data ?? []).filter((r) => !r.is_admin).length + 1} className="p-4 text-center text-muted-foreground">Add a non-administrator role to configure permissions.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-4 border-t px-3 py-2 text-xs text-muted-foreground" aria-label="Permission states">
                <span className="inline-flex items-center gap-1"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-blue-600 bg-blue-600 text-white"><Check aria-hidden="true" className="h-3 w-3" /></span>Enabled</span>
                <span className="inline-flex items-center gap-1"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-muted-foreground/60"><X aria-hidden="true" className="h-3 w-3" /></span>Disabled</span>
              </div>
              {permissionSaveStatus && (
                <p aria-live={permissionSaveStatus.state === "error" ? "assertive" : "polite"} role={permissionSaveStatus.state === "error" ? "alert" : "status"}
                  className={`border-t px-3 py-2 text-sm ${permissionSaveStatus.state === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                  {permissionSaveStatus.state === "saving" && `Saving ${permissionSaveStatus.roleName} — ${permissionSaveStatus.permissionName}…`}
                  {permissionSaveStatus.state === "saved" && `Saved ${permissionSaveStatus.roleName} — ${permissionSaveStatus.permissionName}.`}
                  {permissionSaveStatus.state === "error" && `Could not save ${permissionSaveStatus.roleName} — ${permissionSaveStatus.permissionName}: ${permissionSaveStatus.message}`}
                </p>
              )}
            </CardContent>
          </Card>
        </AdminSection>
      </div>

      <AdminSection id="users" title="Users"
        actions={
          <Button size="sm" variant="outline" onClick={() => { setEditUserId(null); setInviteForm(emptyInviteForm); setInviteOpen(true); }}>
            <UserPlus className="h-4 w-4 mr-1" />New User
          </Button>
        }>
        <Card><CardContent className="space-y-2 p-3">
          {users.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {users.error && <p className="text-sm text-destructive">{(users.error as Error).message}</p>}
          {(users.data?.users ?? []).map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{u.display_name || u.email}</span>
                  <Badge variant={statusVariant(u.status)}>{u.status}</Badge>
                  <Badge variant="outline">{workerTypeLabel({ workerType: u.worker_type, subcontractorName: u.subcontractor_name })}</Badge>
                </div>
                <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {u.roles.length === 0 && <span className="text-xs text-muted-foreground">No role</span>}
                  {u.roles.map((r) => <Badge key={r.id} variant="outline">{r.name}</Badge>)}
                </div>
                <div className="mt-2">
                  <div className="text-xs font-medium text-muted-foreground">Divisions</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {DIVISIONS.map((d) => (
                      <label key={d} className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 accent-[hsl(var(--primary))]"
                          checked={(u.divisions ?? []).includes(d)}
                          disabled={busy === `div-${u.id}`}
                          onChange={async (e) => {
                            const next = e.target.checked
                              ? [...(u.divisions ?? []), d]
                              : (u.divisions ?? []).filter((x) => x !== d);
                            setBusy(`div-${u.id}`);
                            try {
                              await setDivisions({ data: { userId: u.id, divisions: next } });
                              toast.success("Divisions updated");
                              refresh();
                            } catch (err) { fail(err); }
                            finally { setBusy(null); }
                          }}
                        />
                        {d}
                      </label>
                    ))}
                  </div>
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
                <Button size="sm" variant="ghost" aria-label={`Edit ${u.display_name || u.email}`} onClick={() => {
                  setEditUserId(u.id);
                  setInviteForm({ email: u.email, displayName: u.display_name ?? "", roleId: u.roles[0]?.id ?? "", workerType: u.worker_type, subcontractorName: u.subcontractor_name ?? "" });
                  setInviteOpen(true);
                }}><Pencil className="h-3.5 w-3.5" /></Button>
                {u.id !== me?.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={u.is_disabled || busy === `proxy-${u.id}`}
                    aria-label={`View the site as ${u.display_name || u.email}`}
                    onClick={async () => {
                      setBusy(`proxy-${u.id}`);
                      try {
                        const target = await startProxy({ data: { userId: u.id } });
                        setProxy(target);
                        qc.invalidateQueries();
                        toast.success(`Viewing as ${target.name}`);
                        navigate({ to: "/" });
                      } catch (err) { fail(err); }
                      finally { setBusy(null); }
                    }}
                  >
                    <Eye className="mr-1 h-3.5 w-3.5" />
                    {busy === `proxy-${u.id}` ? "Opening…" : "View as"}
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={busy === `invite-${u.id}`} onClick={async () => {
                  setBusy(`invite-${u.id}`);
                  try { await resend({ data: { email: u.email, origin: window.location.origin } }); toast.success("Invitation sent"); refresh(); }
                  catch (err) { fail(err); }
                  finally { setBusy(null); }
                }}><Send className="h-3.5 w-3.5 mr-1" />
                  {busy === `invite-${u.id}` ? "Sending…" : u.status === "Invitation pending" ? "Send invitation" : "Resend"}
                </Button>
                <Button size="sm" variant="outline" disabled={busy === `reset-${u.id}`} onClick={async () => {
                  setBusy(`reset-${u.id}`);
                  try { await sendReset({ data: { email: u.email, origin: window.location.origin } }); toast.success("Password reset email sent"); }
                  catch (err) { fail(err); }
                  finally { setBusy(null); }
                }}><KeyRound className="h-3.5 w-3.5 mr-1" />
                  {busy === `reset-${u.id}` ? "Sending…" : "Send password reset"}
                </Button>

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
                <Button size="sm" variant="destructive" disabled={busy === `del-${u.id}`} onClick={async () => {
                  const who = u.display_name || u.email;
                  if (!window.confirm(`Permanently delete ${who}?\n\nThis cannot be undone. Their sign-in, roles and project collaborator assignments are removed. Their projects and photos stay, reassigned to you.\n\nTo keep their history and only block sign-in, use Disable instead.`)) return;
                  const typed = window.prompt(`Type DELETE to permanently remove ${who}.`);
                  if (typed?.trim().toUpperCase() !== "DELETE") { toast.info("Deletion cancelled"); return; }
                  setBusy(`del-${u.id}`);
                  try {
                    await deleteUser({ data: { userId: u.id } });
                    toast.success("User deleted"); refresh();
                  } catch (err) {
                    if ((err as Error).message?.includes("LAST_ADMIN")) {
                      if (window.confirm("This is the last active administrator. Delete anyway? Nobody will be able to manage users.")) {
                        try { await deleteUser({ data: { userId: u.id, force: true } }); toast.success("User deleted"); refresh(); }
                        catch (e2) { fail(e2); }
                      }
                    } else fail(err);
                  } finally { setBusy(null); }
                }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />{busy === `del-${u.id}` ? "Deleting…" : "Delete user"}
                </Button>

              </div>
            </div>
          ))}
        </CardContent></Card>
      </AdminSection>


      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{roleForm.id ? "Edit role" : "New role"}</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); roleMut.mutate(); }}>
            <div><Label htmlFor="r-name">Role name *</Label><Input id="r-name" required value={roleForm.name} onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })} /></div>
            <label className="flex items-start gap-2 rounded-md border p-2 text-sm">
              <Checkbox
                checked={roleForm.isDirector}
                onCheckedChange={(v) => setRoleForm({ ...roleForm, isDirector: v === true })}
              />
              <span>
                Division Director
                <span className="block text-xs text-muted-foreground">
                  Sees every project in the divisions assigned to them.
                </span>
              </span>
            </label>
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
                    {permLabel(p)}
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

      <AdminSection id="audit" title="Audit History" defaultOpen={false}>
        <Card><CardContent className="p-3">
          {(audit.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>}
          <ul className="space-y-2">
            {(audit.data ?? []).map((a) => (
              <li key={a.id} className="flex justify-between gap-2 text-sm">
                  <span>
                    <span className="font-medium">{a.actor_name}</span> —{" "}
                    {String(a.action).replace(/_/g, " ")}
                    {(a.action === "proxy_started" || a.action === "proxy_ended") &&
                      a.target_name && (
                        <>
                          {" "}
                          · viewing as <span className="font-medium">{a.target_name}</span>
                        </>
                      )}
                  </span>
                <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      </AdminSection>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-2">
          <section aria-labelledby="administrator-access-heading" className="space-y-2">
            <h3 id="administrator-access-heading" className="font-medium">Administrator access</h3>
            <p className="text-sm text-muted-foreground">Administrators have full access; their permissions are not controlled by the matrix.</p>
            {(roles.data ?? []).filter((r) => r.is_admin).length === 0 && (
              <p className="text-sm text-muted-foreground">No administrator roles.</p>
            )}
            {(roles.data ?? []).filter((r) => r.is_admin).map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{r.name}</span>
                  <Badge variant="secondary">Administrator</Badge>
                  {!r.is_active && <Badge variant="outline">Inactive</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => openRoleEditor(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    try { await saveRole({ data: { id: r.id, name: r.name, isActive: !r.is_active } }); toast.success("Role updated"); refresh(); }
                    catch (e) { fail(e); }
                  }}>{r.is_active ? "Deactivate" : "Reactivate"}</Button>
                </div>
              </div>
            ))}
          </section>
          <section aria-labelledby="director-access-heading" className="space-y-2">
            <h3 id="director-access-heading" className="font-medium">Division Director access</h3>
            <p className="text-sm text-muted-foreground">This separate role flag grants project visibility in assigned divisions, beyond individual action permissions.</p>
            {(roles.data ?? []).filter((r) => r.is_director).length === 0 ? (
              <p className="text-sm text-muted-foreground">No Division Director roles.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {(roles.data ?? []).filter((r) => r.is_director).map((r) => (
                  <li key={r.id}><Badge variant="secondary">{r.name}{!r.is_active ? " (inactive)" : ""}</Badge></li>
                ))}
              </ul>
            )}
          </section>
        </CardContent>
      </Card>
    </div>
  );
}

/** Admin-only labels: photo permissions cover photos and videos. Keys unchanged. */
const ADMIN_PERM_LABEL: Partial<Record<PermissionKey, string>> = {
  can_add_photos: "Add media",
  can_edit_photos: "Edit media",
  can_delete_photos: "Delete media",
};
function permLabel(p: (typeof PERMISSIONS)[number]) {
  return ADMIN_PERM_LABEL[p.key] ?? p.label;
}

/** Independently collapsible section; content stays mounted so state is never lost. */
function AdminSection({ id, title, defaultOpen = true, actions, level = 2, children }: {
  id: string; title: string; defaultOpen?: boolean; actions?: ReactNode; level?: 2 | 3; children: ReactNode;
}) {
  const storageKey = `admin-section-${id}`;
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const v = sessionStorage.getItem(storageKey);
    if (v !== null) setOpen(v === "1");
  }, [storageKey]);
  const toggle = () => setOpen((o) => { sessionStorage.setItem(storageKey, o ? "0" : "1"); return !o; });
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Heading id={`${id}-heading`} className={level === 2 ? "text-lg font-semibold" : "font-medium"}>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`${id}-panel`}
            onClick={toggle}
            className="inline-flex items-center gap-1 rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
            {title}
          </button>
        </Heading>
        {actions}
      </div>
      <div id={`${id}-panel`} hidden={!open}>{children}</div>
    </section>
  );
}
