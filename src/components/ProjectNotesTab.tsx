import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Pencil, Trash2, Loader2, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { logActivity } from "@/lib/activity";

type Note = {
  id: string;
  body: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  author: string;
};

const errMsg = (e: unknown) => (e as { message?: string })?.message ?? "Something went wrong";

export function ProjectNotesTab({ projectId, companyId, readOnly }: {
  projectId: string;
  companyId: string;
  readOnly: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");

  const q = useQuery({
    queryKey: ["project-notes", projectId],
    queryFn: async (): Promise<Note[]> => {
      const { data, error } = await supabase
        .from("project_notes")
        .select("id, body, user_id, created_at, updated_at")
        .eq("job_id", projectId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const ids = [...new Set(rows.map((r) => r.user_id))];
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, display_name, email").in("id", ids)
        : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
      const pm = new Map((profs ?? []).map((p) => [p.id, p.display_name || p.email || "Someone"]));
      return rows.map((r) => ({ ...r, author: pm.get(r.user_id) ?? "Someone" }));
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["project-notes", projectId] });

  async function addNote() {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    const { error } = await supabase
      .from("project_notes")
      .insert({ job_id: projectId, company_id: companyId, body });
    setSaving(false);
    if (error) return toast.error(errMsg(error));
    setDraft("");
    toast.success("Note added");
    refresh();
  }

  async function saveEdit(id: string) {
    const body = editBody.trim();
    if (!body) return;
    const { error } = await supabase.from("project_notes").update({ body }).eq("id", id);
    if (error) return toast.error(errMsg(error));
    setEditId(null);
    toast.success("Note updated");
    refresh();
  }

  async function removeNote(id: string) {
    if (!window.confirm("Delete this note?")) return;
    const { error } = await supabase.from("project_notes").delete().eq("id", id);
    if (error) return toast.error(errMsg(error));
    toast.success("Note deleted");
    refresh();
  }

  const notes = q.data ?? [];

  return (
    <div className="space-y-4">
      {readOnly ? (
        <p className="text-sm text-muted-foreground">This project is archived, so notes are read-only.</p>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a note…"
            rows={3}
            aria-label="New note"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={addNote} disabled={!draft.trim() || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add note
            </Button>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : q.isError ? (
        <div className="space-y-2 text-sm">
          <p className="text-destructive">Notes could not be loaded.</p>
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>Retry</Button>
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
          <StickyNote className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No notes yet. Add gate codes, site details or reminders here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => {
            const mine = n.user_id === user?.id;
            const edited = n.updated_at !== n.created_at;
            return (
              <Card key={n.id} className="p-3">
                {editId === n.id ? (
                  <div className="space-y-2">
                    <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} aria-label="Edit note" />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => saveEdit(n.id)} disabled={!editBody.trim()}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm">{n.body}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {n.author} · {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        {edited ? " · edited" : ""}
                      </p>
                      {mine && !readOnly && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7" aria-label="Edit note"
                            onClick={() => { setEditId(n.id); setEditBody(n.body); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7" aria-label="Delete note"
                            onClick={() => removeNote(n.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
