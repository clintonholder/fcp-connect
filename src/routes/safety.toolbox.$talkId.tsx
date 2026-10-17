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
import { generateToolboxTalkPdf } from "@/lib/toolbox-talk-pdf";
import type { Attendee } from "@/lib/toolbox-talks";
import { completeToolboxTalk } from "@/lib/toolbox-talks.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/safety/toolbox/$talkId")({
  head: () => ({
    meta: [
      { title: "Toolbox talks — FCP Connect" },
      { property: "og:title", content: "Toolbox talks — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ToolboxTalkPage />
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

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

function ToolboxTalkPage() {
  const { talkId } = Route.useParams();
  const { user } = useAuth();
  const { proxy, readOnly } = useProxy();
  const { can } = useMyRoles();
  const qc = useQueryClient();
  const complete = useServerFn(completeToolboxTalk);
  const userId = proxy?.userId ?? user?.id ?? "";

  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const q = useQuery({
    queryKey: ["toolbox-talk", talkId],
    queryFn: async () => {
      const talk = await supabase.from("toolbox_talks").select("*").eq("id", talkId).maybeSingle();
      if (talk.error) throw talk.error;
      if (!talk.data) return { talk: null, job: null, people: [], collaboratorIds: [] as string[] };
      const [job, collabs, people] = await Promise.all([
        supabase
          .from("jobs")
          .select("id, name, owner, customer, client, address, owner_id")
          .eq("id", talk.data.job_id)
          .maybeSingle(),
        supabase.from("project_collaborators").select("user_id").eq("job_id", talk.data.job_id),
        supabase.from("profiles").select("id, display_name, email"),
      ]);
      const err = job.error ?? collabs.error ?? people.error;
      if (err) throw err;
      return {
        talk: talk.data,
        job: job.data as Job | null,
        people: people.data ?? [],
        collaboratorIds: (collabs.data ?? []).map((c) => c.user_id),
      };
    },
  });

  const back = (
    <Link to="/safety/toolbox" className="mt-2 inline-flex text-sm text-primary underline">
      Back to Toolbox talks
    </Link>
  );

  if (q.isLoading) {
    return (
      <main className="mx-auto max-w-3xl px-3 py-6">
        <h1 className="text-2xl font-semibold">Toolbox talk</h1>
        {back}
        <p className="mt-4 text-muted-foreground">Loading…</p>
      </main>
    );
  }
  const data = q.data;
  const talk = data?.talk;
  const job = data?.job;
  const hasAccess =
    !!talk &&
    !!job &&
    (can.can_manage_safety || job.owner_id === userId || data.collaboratorIds.includes(userId));
  if (q.error || !data || !talk || !job || !hasAccess) {
    return (
      <main className="mx-auto max-w-3xl px-3 py-6">
        <h1 className="text-2xl font-semibold">Toolbox talk</h1>
        {back}
        <p className="mt-4 text-muted-foreground">
          {q.error ? errMsg(q.error) : "Talk not found or you do not have access."}
        </p>
      </main>
    );
  }

  const nameOf = (id: string | null) => {
    const p = data.people.find((x) => x.id === id);
    return p?.display_name || p?.email || "Unknown user";
  };
  const isComplete = talk.completed_at !== null;
  const saved = (Array.isArray(talk.attendees) ? talk.attendees : []) as unknown as Attendee[];

  const addAttendee = () => {
    if (!name.trim() || !signature) return;
    setAttendees((prev) => [...prev, { name: name.trim(), signature }]);
    setName("");
    setSignature(null);
    setPadKey((k) => k + 1);
  };

  const onComplete = async () => {
    setSubmitting(true);
    try {
      await complete({ data: { talkId, attendees, notes } });
      toast.success("Toolbox talk completed");
      await qc.invalidateQueries({ queryKey: ["toolbox-talk", talkId] });
      await qc.invalidateQueries({ queryKey: ["toolbox-list"] });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const exportPdf = () =>
    generateToolboxTalkPdf({
      job,
      talk: {
        topic_title: talk.topic_title,
        talk_date: talk.talk_date,
        completed_at: talk.completed_at!,
        notes: talk.notes,
        attendees: saved,
      },
      ledByName: nameOf(talk.led_by),
    });

  return (
    <main className="mx-auto max-w-3xl px-3 py-6">
      <h1 className="text-2xl font-semibold">{talk.topic_title}</h1>
      {back}
      <p className="mt-1 text-sm text-muted-foreground">
        {job.name} · {talk.talk_date}
      </p>
      {talk.topic_body && <p className="mt-3 whitespace-pre-wrap text-sm">{talk.topic_body}</p>}

      <div className="mt-4 space-y-4">
        {isComplete ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Completed toolbox talk</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm">
                <div>Led by: {nameOf(talk.led_by)}</div>
                <div>Completed at: {new Date(talk.completed_at!).toLocaleString()}</div>
              </div>
              {talk.notes && <p className="whitespace-pre-wrap text-sm">{talk.notes}</p>}
              <ul className="space-y-2">
                {saved.map((a, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span>{a.name}</span>
                    <img
                      src={a.signature}
                      alt={`Signature of ${a.name}`}
                      className="h-12 rounded-md border bg-white"
                    />
                  </li>
                ))}
              </ul>
              <Button variant="outline" onClick={exportPdf}>
                <FileDown className="mr-1 h-4 w-4" /> Export PDF
              </Button>
            </CardContent>
          </Card>
        ) : readOnly ? (
          <p className="text-muted-foreground">This toolbox talk has not been completed yet.</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Attendee sign-in</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Attendee name"
                  aria-label="Attendee name"
                />
                <SignaturePad key={padKey} onChange={setSignature} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addAttendee}
                  disabled={!name.trim() || !signature}
                >
                  Add attendee
                </Button>
              </div>
              {attendees.length > 0 && (
                <ul className="space-y-2">
                  {attendees.map((a, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-sm">
                      <span>{a.name}</span>
                      <img
                        src={a.signature}
                        alt={`Signature of ${a.name}`}
                        className="h-10 rounded-md border bg-white"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAttendees((prev) => prev.filter((_, j) => j !== i))}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes"
                aria-label="Notes"
              />
              <Button onClick={onComplete} disabled={attendees.length === 0 || submitting}>
                Complete talk
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
