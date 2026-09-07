import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Users, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

type Person = { id: string; display_name: string | null; email: string | null };

const selectClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProjectCollaborators({
  projectId,
  companyId,
  people,
  canEdit,
}: {
  projectId: string;
  companyId: string | null | undefined;
  people: Person[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [personId, setPersonId] = useState("");
  const [roleId, setRoleId] = useState("");

  const roles = useQuery({
    queryKey: ["app-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_roles").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const collaborators = useQuery({
    queryKey: ["collaborators", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_collaborators")
        .select("id, user_id, role_id")
        .eq("job_id", projectId)
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["collaborators", projectId] });
  const nameOf = (id: string) => {
    const p = people.find((x) => x.id === id);
    return p?.display_name || p?.email || "Unknown person";
  };
  const roleName = (id: string | null) => (roles.data ?? []).find((r) => r.id === id)?.name ?? "No role";

  const add = useMutation({
    mutationFn: async () => {
      if (!personId) throw new Error("Choose someone to add");
      if (!companyId) throw new Error("This project is missing its company");
      const { error } = await supabase.from("project_collaborators").insert({
        job_id: projectId,
        company_id: companyId,
        user_id: personId,
        role_id: roleId || null,
        added_by: (await supabase.auth.getUser()).data.user?.id ?? null,
      });
      if (error) throw new Error(error.message.includes("duplicate") ? "They are already a collaborator" : error.message);
    },
    onSuccess: () => { toast.success("Collaborator added"); setPersonId(""); setRoleId(""); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, role_id }: { id: string; role_id: string | null }) => {
      const { error } = await supabase.from("project_collaborators").update({ role_id }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Role updated"); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_collaborators").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Collaborator removed"); refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const activeRoles = (roles.data ?? []).filter((r) => r.is_active);
  const alreadyIn = new Set((collaborators.data ?? []).map((c) => c.user_id));

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Collaborators</h3>
      </div>

      {collaborators.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {collaborators.error && <p className="text-xs text-destructive">{(collaborators.error as Error).message}</p>}
      {!collaborators.isLoading && (collaborators.data ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">No collaborators yet.</p>
      )}

      <ul className="space-y-2">
        {(collaborators.data ?? []).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2">
            <span className="text-sm">{nameOf(c.user_id)}</span>
            <div className="flex items-center gap-2">
              {canEdit ? (
                <select
                  aria-label={`Role for ${nameOf(c.user_id)}`}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  value={c.role_id ?? ""}
                  onChange={(e) => changeRole.mutate({ id: c.id, role_id: e.target.value || null })}
                >
                  <option value="">No role</option>
                  {activeRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              ) : (
                <Badge variant="outline">{roleName(c.role_id)}</Badge>
              )}
              {canEdit && (
                <Button
                  type="button" size="sm" variant="ghost" aria-label={`Remove ${nameOf(c.user_id)}`}
                  disabled={remove.isPending}
                  onClick={() => { if (window.confirm(`Remove ${nameOf(c.user_id)} from this project?`)) remove.mutate(c.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {canEdit && (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <Label htmlFor="collab-person" className="text-xs">Add person</Label>
            <select id="collab-person" className={selectClass} value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">Choose someone…</option>
              {people.filter((p) => !alreadyIn.has(p.id)).map((p) => (
                <option key={p.id} value={p.id}>{p.display_name || p.email}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="collab-role" className="text-xs">Role on this project</Label>
            <select id="collab-role" className={selectClass} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">No role</option>
              {activeRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <Button type="button" variant="outline" disabled={add.isPending || !personId} onClick={() => add.mutate()}>
            <Plus className="mr-1 h-4 w-4" />{add.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
      )}
      {!canEdit && <p className="text-xs text-muted-foreground">You don't have permission to change collaborators.</p>}
    </div>
  );
}
