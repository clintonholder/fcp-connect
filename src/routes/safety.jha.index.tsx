import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useCompany } from "@/lib/company-context";
import { useMyRoles } from "@/lib/roles";
import { useProxy } from "@/lib/proxy-context";
import { groupProjectsByJha, jhaProjectsForUser, latestCompleted } from "@/lib/jha";
import { createJhaTemplate, deleteJhaTemplate, updateJhaTemplate } from "@/lib/jha.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/safety/jha/")({
  head: () => ({
    meta: [{ title: "JHA — FCP Connect" }, { property: "og:title", content: "JHA — FCP Connect" }],
  }),
  component: () => (
    <RequireAuth>
      <JhaListPage />
    </RequireAuth>
  ),
});

type Template = { id: string; prompt: string; position: number; created_at: string };

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

function JhaListPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { proxy, readOnly } = useProxy();
  const { can } = useMyRoles();
  const userId = proxy?.userId ?? user?.id ?? "";

  const q = useQuery({
    queryKey: ["jha-list", company?.id],
    enabled: !!company,
    queryFn: async () => {
      const [jobs, collabs, records] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, name, owner, customer, client, address, owner_id, archived_at")
          .eq("company_id", company!.id),
        supabase.from("project_collaborators").select("job_id, user_id"),
        supabase.from("jha_records").select("id, job_id, completed_at, created_at"),
      ]);
      const err = jobs.error ?? collabs.error ?? records.error;
      if (err) throw err;
      return { jobs: jobs.data ?? [], collabs: collabs.data ?? [], records: records.data ?? [] };
    },
  });

  const { needsAction, completed } = useMemo(() => {
    const d = q.data;
    if (!d) return { needsAction: [], completed: [] };
    return groupProjectsByJha(jhaProjectsForUser(d.jobs, d.collabs, userId), d.records);
  }, [q.data, userId]);

  const latestDate = (jobId: string) => {
    const rec = latestCompleted((q.data?.records ?? []).filter((r) => r.job_id === jobId));
    return rec?.completed_at ? new Date(rec.completed_at).toLocaleDateString() : null;
  };

  const section = (title: string, rows: typeof needsAction, empty: string, showDate: boolean) => (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        rows.map((j) => (
          <Link key={j.id} to="/safety/jha/$projectId" params={{ projectId: j.id }}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardContent className="p-4">
                <div className="font-medium">{j.name}</div>
                <div className="text-sm text-muted-foreground">
                  {[
                    j.owner && `Owner: ${j.owner}`,
                    (j.customer || j.client) && `Customer: ${j.customer || j.client}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {showDate && latestDate(j.id) && (
                  <div className="text-sm text-muted-foreground">Completed {latestDate(j.id)}</div>
                )}
              </CardContent>
            </Card>
          </Link>
        ))
      )}
    </section>
  );

  return (
    <main className="mx-auto max-w-4xl px-3 py-6">
      <h1 className="text-2xl font-semibold">JHA</h1>
      <Link to="/safety" className="mt-2 inline-flex text-sm text-primary underline">
        Back to Safety
      </Link>

      <div className="mt-4 space-y-6">
        {q.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : q.error ? (
          <p className="text-destructive">{errMsg(q.error)}</p>
        ) : (
          <>
            {section("Needs action", needsAction, "Nothing needs action.", false)}
            {section("Completed", completed, "No completed JHAs yet.", true)}
          </>
        )}
        {can.can_manage_safety && <HazardItems readOnly={readOnly} />}
      </div>
    </main>
  );
}

function HazardItems({ readOnly }: { readOnly: boolean }) {
  const qc = useQueryClient();
  const create = useServerFn(createJhaTemplate);
  const update = useServerFn(updateJhaTemplate);
  const remove = useServerFn(deleteJhaTemplate);
  const [newPrompt, setNewPrompt] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["jha-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jha_templates")
        .select("id, prompt, position, created_at")
        .order("position")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Template[];
    },
  });

  const run = async (fn: () => Promise<unknown>, done: () => void) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["jha-templates"] });
      done();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Hazard items</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {q.isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : q.error ? (
          <p className="text-destructive">{errMsg(q.error)}</p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No hazard items yet.</p>
        ) : (
          <ol className="space-y-2">
            {(q.data ?? []).map((t, i) => (
              <li key={t.id} className="flex items-center gap-2">
                <span className="w-6 text-sm text-muted-foreground">{i + 1}.</span>
                {editId === t.id ? (
                  <>
                    <Input
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      aria-label="Hazard item text"
                    />
                    <Button
                      size="sm"
                      disabled={busy || !editPrompt.trim()}
                      onClick={() =>
                        run(
                          () => update({ data: { id: t.id, prompt: editPrompt } }),
                          () => setEditId(null),
                        )
                      }
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm">{t.prompt}</span>
                    {!readOnly && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit hazard item"
                          onClick={() => {
                            setEditId(t.id);
                            setEditPrompt(t.prompt);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete hazard item"
                          onClick={() => setDeleting(t)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
        )}

        {!readOnly && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => create({ data: { prompt: newPrompt } }),
                () => setNewPrompt(""),
              );
            }}
          >
            <Input
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="New hazard item"
              aria-label="New hazard item"
            />
            <Button type="submit" disabled={busy || !newPrompt.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </form>
        )}
      </CardContent>

      {!readOnly && (
        <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this hazard item?</AlertDialogTitle>
              <AlertDialogDescription>
                "{deleting?.prompt}" will no longer appear on new JHAs. Completed JHAs keep their
                answers.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  deleting &&
                  run(
                    () => remove({ data: { id: deleting.id } }),
                    () => setDeleting(null),
                  )
                }
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </Card>
  );
}
