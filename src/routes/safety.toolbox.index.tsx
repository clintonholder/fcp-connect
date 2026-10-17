import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
import { jhaProjectsForUser } from "@/lib/jha";
import { groupTalks, localDateString, talkDueState } from "@/lib/toolbox-talks";
import {
  createToolboxTopic,
  deleteToolboxTopic,
  startToolboxTalk,
  updateToolboxTopic,
} from "@/lib/toolbox-talks.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/safety/toolbox/")({
  head: () => ({
    meta: [
      { title: "Toolbox talks — FCP Connect" },
      { property: "og:title", content: "Toolbox talks — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ToolboxListPage />
    </RequireAuth>
  ),
});

type Topic = { id: string; title: string; body: string | null };

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

function attendeeCount(a: unknown) {
  return Array.isArray(a) ? a.length : 0;
}

function ToolboxListPage() {
  const { user } = useAuth();
  const { company } = useCompany();
  const { proxy, readOnly } = useProxy();
  const { can } = useMyRoles();
  const userId = proxy?.userId ?? user?.id ?? "";

  const q = useQuery({
    queryKey: ["toolbox-list", company?.id],
    enabled: !!company,
    queryFn: async () => {
      const [jobs, collabs, talks, topics] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, name, owner, customer, client, address, owner_id, archived_at")
          .eq("company_id", company!.id),
        supabase.from("project_collaborators").select("job_id, user_id"),
        supabase
          .from("toolbox_talks")
          .select("id, job_id, topic_title, talk_date, completed_at, created_at, attendees"),
        supabase.from("toolbox_talk_topics").select("id, title, body").order("title"),
      ]);
      const err = jobs.error ?? collabs.error ?? talks.error ?? topics.error;
      if (err) throw err;
      return {
        jobs: jobs.data ?? [],
        collabs: collabs.data ?? [],
        talks: talks.data ?? [],
        topics: (topics.data ?? []) as Topic[],
      };
    },
  });

  const myJobs = useMemo(
    () => (q.data ? jhaProjectsForUser(q.data.jobs, q.data.collabs, userId) : []),
    [q.data, userId],
  );
  const { incomplete, completed } = useMemo(
    () => groupTalks(q.data?.talks ?? [], new Set(myJobs.map((j) => j.id))),
    [q.data, myJobs],
  );
  const startableJobs = can.can_manage_safety
    ? (q.data?.jobs ?? []).filter((j) => !j.archived_at)
    : myJobs;
  const jobName = (id: string) => q.data?.jobs.find((j) => j.id === id)?.name ?? "";
  const today = localDateString(new Date());

  const row = (t: (typeof incomplete)[number], done: boolean) => (
    <Link key={t.id} to="/safety/toolbox/$talkId" params={{ talkId: t.id }}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <div className="font-medium">{t.topic_title}</div>
            <div className="text-sm text-muted-foreground">
              {jobName(t.job_id)} · {t.talk_date}
              {done &&
                ` · Completed ${new Date(t.completed_at!).toLocaleDateString()} · ${attendeeCount(t.attendees)} attendees`}
            </div>
          </div>
          {!done && (
            <Badge variant={talkDueState(t.talk_date, today) === "due" ? "default" : "secondary"}>
              {talkDueState(t.talk_date, today) === "due" ? "Due" : "Scheduled"}
            </Badge>
          )}
        </CardContent>
      </Card>
    </Link>
  );

  const section = (title: string, rows: typeof incomplete, empty: string, done: boolean) => (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        rows.map((t) => row(t, done))
      )}
    </section>
  );

  return (
    <main className="mx-auto max-w-4xl px-3 py-6">
      <h1 className="text-2xl font-semibold">Toolbox talks</h1>
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
            {section("Incomplete", incomplete, "No incomplete toolbox talks.", false)}
            {section("Completed", completed, "No completed toolbox talks yet.", true)}
            <Topics
              topics={q.data?.topics ?? []}
              jobs={startableJobs}
              canManage={can.can_manage_safety}
              readOnly={readOnly}
            />
          </>
        )}
      </div>
    </main>
  );
}

function Topics({
  topics,
  jobs,
  canManage,
  readOnly,
}: {
  topics: Topic[];
  jobs: { id: string; name: string }[];
  canManage: boolean;
  readOnly: boolean;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const start = useServerFn(startToolboxTalk);
  const create = useServerFn(createToolboxTopic);
  const update = useServerFn(updateToolboxTopic);
  const remove = useServerFn(deleteToolboxTopic);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [editing, setEditing] = useState<Topic | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [deleting, setDeleting] = useState<Topic | null>(null);
  const [starting, setStarting] = useState<Topic | null>(null);
  const [jobId, setJobId] = useState("");
  const [talkDate, setTalkDate] = useState(localDateString(new Date()));
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, done: () => void) => {
    setBusy(true);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ["toolbox-list"] });
      done();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const onStart = async () => {
    if (!starting) return;
    setBusy(true);
    try {
      const { id } = await start({ data: { jobId, topicId: starting.id, talkDate } });
      toast.success("Toolbox talk started");
      await qc.invalidateQueries({ queryKey: ["toolbox-list"] });
      setStarting(null);
      navigate({ to: "/safety/toolbox/$talkId", params: { talkId: id } });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Topics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {topics.length === 0 ? (
          <p className="text-sm text-muted-foreground">No toolbox talk topics yet.</p>
        ) : (
          <ul className="space-y-3">
            {topics.map((t) => (
              <li key={t.id} className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="text-sm font-medium">{t.title}</div>
                  {t.body && (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{t.body}</p>
                  )}
                </div>
                {!readOnly && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => {
                        setStarting(t);
                        setJobId("");
                        setTalkDate(localDateString(new Date()));
                      }}
                    >
                      Start talk
                    </Button>
                    {canManage && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit topic"
                          onClick={() => {
                            setEditing(t);
                            setEditTitle(t.title);
                            setEditBody(t.body ?? "");
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete topic"
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
          </ul>
        )}

        {canManage && !readOnly && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => create({ data: { title: newTitle, body: newBody } }),
                () => {
                  setNewTitle("");
                  setNewBody("");
                },
              );
            }}
          >
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="New topic title"
              aria-label="New topic title"
            />
            <Textarea
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              placeholder="Talking points"
              aria-label="Talking points"
            />
            <Button type="submit" disabled={busy || !newTitle.trim()}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </form>
        )}
      </CardContent>

      {!readOnly && (
        <>
          <Dialog open={!!starting} onOpenChange={(o) => !o && setStarting(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start talk: {starting?.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Project</Label>
                  <Select value={jobId} onValueChange={setJobId}>
                    <SelectTrigger aria-label="Project">
                      <SelectValue placeholder="Choose a project" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobs.map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="talk-date">Date</Label>
                  <Input
                    id="talk-date"
                    type="date"
                    value={talkDate}
                    onChange={(e) => setTalkDate(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setStarting(null)}>
                  Cancel
                </Button>
                <Button onClick={onStart} disabled={busy || !jobId || !talkDate}>
                  Start
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {canManage && (
            <>
              <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit topic</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      aria-label="Topic title"
                    />
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      aria-label="Talking points"
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={busy || !editTitle.trim()}
                      onClick={() =>
                        editing &&
                        run(
                          () =>
                            update({ data: { id: editing.id, title: editTitle, body: editBody } }),
                          () => setEditing(null),
                        )
                      }
                    >
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this topic?</AlertDialogTitle>
                    <AlertDialogDescription>
                      "{deleting?.title}" will no longer be available to start. Existing talks keep
                      their topic.
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
            </>
          )}
        </>
      )}
    </Card>
  );
}
