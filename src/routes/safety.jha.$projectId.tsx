import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileDown } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { SignaturePad } from "@/components/SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyRoles } from "@/lib/roles";
import { useProxy } from "@/lib/proxy-context";
import {
  JHA_ANSWERS,
  jhaAnswerLabel,
  jhaStatus,
  latestCompleted,
  type JhaSnapshotItem,
} from "@/lib/jha";
import { generateJhaPdf } from "@/lib/jha-pdf";
import { requestNewJha, submitJha } from "@/lib/jha.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

export const Route = createFileRoute("/safety/jha/$projectId")({
  head: () => ({
    meta: [{ title: "JHA — FCP Connect" }, { property: "og:title", content: "JHA — FCP Connect" }],
  }),
  component: () => (
    <RequireAuth>
      <JhaProjectPage />
    </RequireAuth>
  ),
});

type Job = {
  id: string;
  name: string;
  owner: string | null;
  customer: string | null;
  client: string | null;
  address: string | null;
  owner_id: string | null;
};
type Rec = {
  id: string;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  answers: JhaSnapshotItem[] | null;
  signature: string | null;
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

function JhaProjectPage() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const { proxy, readOnly } = useProxy();
  const { can } = useMyRoles();
  const qc = useQueryClient();
  const submit = useServerFn(submitJha);
  const request = useServerFn(requestNewJha);
  const userId = proxy?.userId ?? user?.id ?? "";

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState(false);

  const q = useQuery({
    queryKey: ["jha-project", projectId],
    queryFn: async () => {
      const [job, templates, records, people, collabs] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, name, owner, customer, client, address, owner_id")
          .eq("id", projectId)
          .maybeSingle(),
        supabase
          .from("jha_templates")
          .select("id, prompt, position, created_at")
          .order("position")
          .order("created_at"),
        supabase
          .from("jha_records")
          .select("id, completed_by, completed_at, created_at, answers, signature")
          .eq("job_id", projectId)
          .order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, display_name, email"),
        supabase.from("project_collaborators").select("user_id").eq("job_id", projectId),
      ]);
      const err = job.error ?? templates.error ?? records.error ?? people.error ?? collabs.error;
      if (err) throw err;
      return {
        job: job.data as Job | null,
        templates: templates.data ?? [],
        records: (records.data ?? []) as unknown as Rec[],
        people: people.data ?? [],
        collaboratorIds: (collabs.data ?? []).map((c) => c.user_id),
      };
    },
  });

  const nameOf = (id: string | null) => {
    const p = q.data?.people.find((x) => x.id === id);
    return p?.display_name || p?.email || "Unknown user";
  };

  const back = (
    <Link to="/safety/jha" className="mt-2 inline-flex text-sm text-primary underline">
      Back to JHA
    </Link>
  );

  if (q.isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-3 py-6">
        <h1 className="text-2xl font-semibold">JHA</h1>
        {back}
        <p className="mt-4 text-muted-foreground">Loading…</p>
      </main>
    );
  }
  const data = q.data;
  const job = data?.job;
  const hasAccess =
    !!job &&
    (can.can_manage_safety || job.owner_id === userId || data.collaboratorIds.includes(userId));
  if (q.error || !data || !job || !hasAccess) {
    return (
      <main className="mx-auto max-w-3xl px-3 py-6">
        <h1 className="text-2xl font-semibold">JHA</h1>
        {back}
        <p className="mt-4 text-muted-foreground">
          {q.error ? errMsg(q.error) : "Project not found or you do not have access."}
        </p>
      </main>
    );
  }

  const status = jhaStatus(data.records);
  const completedRecords = data.records.filter((r) => r.completed_at && r.answers && r.signature);
  const latest = latestCompleted(completedRecords);
  const previous = completedRecords.filter((r) => r.id !== latest?.id);
  const canRequest =
    status === "completed" && !readOnly && (can.can_manage_safety || job.owner_id === userId);
  const allAnswered = data.templates.length > 0 && data.templates.every((t) => !!answers[t.id]);

  const exportPdf = (r: Rec) =>
    generateJhaPdf({
      job,
      record: {
        completed_at: r.completed_at!,
        answers: r.answers!,
        signature: r.signature!,
      },
      completedByName: nameOf(r.completed_by),
    });

  const onSubmit = async () => {
    setSubmitting(true);
    try {
      await submit({
        data: {
          jobId: projectId,
          answers: data.templates.map((t) => ({ templateId: t.id, answer: answers[t.id] })),
          signature: signature ?? "",
        },
      });
      toast.success("JHA submitted");
      setAnswers({});
      setSignature(null);
      await qc.invalidateQueries({ queryKey: ["jha-project", projectId] });
      await qc.invalidateQueries({ queryKey: ["jha-list"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onRequest = async () => {
    try {
      await request({ data: { jobId: projectId } });
      await qc.invalidateQueries({ queryKey: ["jha-project", projectId] });
      await qc.invalidateQueries({ queryKey: ["jha-list"] });
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-3 py-6">
      <h1 className="text-2xl font-semibold">JHA — {job.name}</h1>
      {back}
      <p className="mt-1 text-sm text-muted-foreground">
        {[
          job.owner && `Owner: ${job.owner}`,
          (job.customer || job.client) && `Customer: ${job.customer || job.client}`,
          job.address,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      <div className="mt-4 space-y-4">
        {status === "needs_action" ? (
          readOnly ? (
            <p className="text-muted-foreground">This project's JHA has not been completed yet.</p>
          ) : data.templates.length === 0 ? (
            <p className="text-muted-foreground">No hazard items are set up yet.</p>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Job Hazard Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.templates.map((t) => (
                  <div key={t.id} className="space-y-1">
                    <div className="text-sm font-medium">{t.prompt}</div>
                    <div className="flex gap-1" role="radiogroup" aria-label={t.prompt}>
                      {JHA_ANSWERS.map((a) => {
                        const sel = answers[t.id] === a.v;
                        return (
                          <button
                            key={a.v}
                            type="button"
                            role="radio"
                            aria-checked={sel}
                            disabled={submitting}
                            onClick={() => setAnswers((prev) => ({ ...prev, [t.id]: a.v }))}
                            className={`min-w-14 rounded-md border px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${sel ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
                          >
                            {a.l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <Separator />
                <div className="space-y-1">
                  <div className="text-sm font-medium">Signature</div>
                  <SignaturePad onChange={setSignature} />
                </div>
                <Button onClick={onSubmit} disabled={!allAnswered || !signature || submitting}>
                  Submit JHA
                </Button>
              </CardContent>
            </Card>
          )
        ) : (
          latest && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Completed JHA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div>Completed by: {nameOf(latest.completed_by)}</div>
                  <div>Completed at: {new Date(latest.completed_at!).toLocaleString()}</div>
                </div>
                <ul className="space-y-1 text-sm">
                  {latest.answers!.map((a) => (
                    <li key={a.template_id} className="flex justify-between gap-3">
                      <span>{a.prompt}</span>
                      <span className="font-medium">{jhaAnswerLabel(a.answer)}</span>
                    </li>
                  ))}
                </ul>
                <img
                  src={latest.signature!}
                  alt="Signature"
                  className="h-24 rounded-md border bg-white"
                />
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => exportPdf(latest)}>
                    <FileDown className="mr-1 h-4 w-4" /> Export PDF
                  </Button>
                  {canRequest && (
                    <Button onClick={() => setConfirmRequest(true)}>Request new JHA</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        )}

        {previous.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Previous JHAs</h2>
            {previous.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="text-sm">
                    <div>{new Date(r.completed_at!).toLocaleString()}</div>
                    <div className="text-muted-foreground">{nameOf(r.completed_by)}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => exportPdf(r)}>
                    <FileDown className="mr-1 h-4 w-4" /> Export PDF
                  </Button>
                </CardContent>
              </Card>
            ))}
          </section>
        )}
      </div>

      {canRequest && (
        <AlertDialog open={confirmRequest} onOpenChange={setConfirmRequest}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Request a new JHA?</AlertDialogTitle>
              <AlertDialogDescription>
                This project will move back to "Needs action" until a new JHA is signed. The
                completed JHAs stay on record.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRequest}>Request new JHA</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </main>
  );
}
