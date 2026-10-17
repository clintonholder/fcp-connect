import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useMyRoles } from "@/lib/roles";
import { useProxy } from "@/lib/proxy-context";
import { EMPTY_SELECTION, resolveAudience, type AudienceSelection } from "@/lib/messages";
import { getMessageComposeData, sendMessage } from "@/lib/messages.functions";
import type { WorkerType } from "@/lib/worker-type";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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

export const Route = createFileRoute("/messages/new")({
  head: () => ({
    meta: [
      { title: "New message — FCP Connect" },
      { property: "og:title", content: "New message — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <ComposePage />
    </RequireAuth>
  ),
});

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function ComposePage() {
  const { can, loading } = useMyRoles();
  return (
    <main className="mx-auto max-w-3xl px-3 py-6">
      <h1 className="text-2xl font-semibold">New message</h1>
      <Link to="/messages" className="mt-1 inline-flex text-sm text-primary underline">
        Back to Messages
      </Link>
      <div className="mt-4">
        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : !can.can_send_messages ? (
          <p className="text-muted-foreground">You don't have permission to send messages.</p>
        ) : (
          <ComposeForm />
        )}
      </div>
    </main>
  );
}

function CheckRow({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      {children}
    </div>
  );
}

const WORKER_TYPES: [WorkerType, string][] = [
  ["employee", "FCP Employee"],
  ["subcontractor", "Sub Contractor"],
];

function ComposeForm() {
  const { user } = useAuth();
  const { readOnly } = useProxy();
  const navigate = useNavigate();
  const fetchCompose = useServerFn(getMessageComposeData);
  const send = useServerFn(sendMessage);

  const q = useQuery({ queryKey: ["message-compose-data"], queryFn: () => fetchCompose() });

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [linkKind, setLinkKind] = useState<"none" | "project" | "document">("none");
  const [linkId, setLinkId] = useState("");
  const [selection, setSelection] = useState<AudienceSelection>(EMPTY_SELECTION);
  const [pairDivision, setPairDivision] = useState("");
  const [pairRole, setPairRole] = useState("");
  const [sending, setSending] = useState(false);

  const data = q.data;
  const count = useMemo(
    () => (data && user ? resolveAudience(selection, data, user.id).length : 0),
    [data, selection, user],
  );

  const set = <K extends keyof AudienceSelection>(key: K, value: AudienceSelection[K]) =>
    setSelection((s) => ({ ...s, [key]: value }));

  const roleName = (id: string) => data?.roles.find((r) => r.id === id)?.name ?? "Unknown role";

  const canSend =
    !!subject.trim() &&
    !!body.trim() &&
    count > 0 &&
    !sending &&
    !readOnly &&
    (linkKind === "none" || !!linkId);

  async function onSend() {
    setSending(true);
    try {
      const res = await send({
        data: {
          subject,
          body,
          projectId: linkKind === "project" ? linkId : null,
          safetyDocumentId: linkKind === "document" ? linkId : null,
          selection,
        },
      });
      toast.success(
        `Message sent to ${res.recipientCount} recipient${res.recipientCount === 1 ? "" : "s"}`,
      );
      await navigate({ to: "/messages" });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error || !data) return <p className="text-destructive">{errMsg(q.error)}</p>;

  const box = "max-h-48 space-y-2 overflow-y-auto rounded-md border p-3";

  return (
    <div className="space-y-4">
      {readOnly && (
        <p className="rounded-md border p-3 text-sm text-muted-foreground">
          Sending is unavailable in View As.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="msg-subject">Subject</Label>
            <Input
              id="msg-subject"
              value={subject}
              maxLength={200}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="msg-body">Body</Label>
            <Textarea
              id="msg-body"
              rows={6}
              value={body}
              maxLength={10000}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Link (optional)</Label>
              <Select
                value={linkKind}
                onValueChange={(v) => {
                  setLinkKind(v as typeof linkKind);
                  setLinkId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No link</SelectItem>
                  <SelectItem value="project">A project</SelectItem>
                  <SelectItem value="document">A safety document</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {linkKind !== "none" && (
              <div className="space-y-1">
                <Label>{linkKind === "project" ? "Project" : "Safety document"}</Label>
                <Select value={linkId} onValueChange={setLinkId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose…" />
                  </SelectTrigger>
                  <SelectContent>
                    {linkKind === "project"
                      ? data.projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))
                      : data.safetyDocuments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.title}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audience</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Section title="People">
            <div className={box}>
              {data.people.map((p) => (
                <CheckRow
                  key={p.id}
                  id={`person-${p.id}`}
                  label={p.name}
                  checked={selection.userIds.includes(p.id)}
                  onChange={() => set("userIds", toggle(selection.userIds, p.id))}
                />
              ))}
            </div>
          </Section>
          <Section title="Divisions">
            <div className="space-y-2">
              {data.divisions.map((d) => (
                <CheckRow
                  key={d}
                  id={`division-${d}`}
                  label={d}
                  checked={selection.divisions.includes(d)}
                  onChange={() => set("divisions", toggle(selection.divisions, d))}
                />
              ))}
            </div>
          </Section>
          <Section title="Role in division">
            <div className="space-y-2">
              {selection.divisionRoles.map((r, i) => (
                <div key={`${r.division}-${r.roleId}`} className="flex items-center gap-2 text-sm">
                  <span>
                    {roleName(r.roleId)} in {r.division}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove"
                    onClick={() =>
                      set(
                        "divisionRoles",
                        selection.divisionRoles.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <Select value={pairDivision} onValueChange={setPairDivision}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Division" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.divisions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={pairRole} onValueChange={setPairRole}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    !pairDivision ||
                    !pairRole ||
                    selection.divisionRoles.some(
                      (r) => r.division === pairDivision && r.roleId === pairRole,
                    )
                  }
                  onClick={() => {
                    set("divisionRoles", [
                      ...selection.divisionRoles,
                      { division: pairDivision, roleId: pairRole },
                    ]);
                    setPairDivision("");
                    setPairRole("");
                  }}
                >
                  Add
                </Button>
              </div>
            </div>
          </Section>
          <Section title="Project teams">
            <div className={box}>
              {data.projects.map((p) => (
                <CheckRow
                  key={p.id}
                  id={`project-${p.id}`}
                  label={p.name}
                  checked={selection.projectIds.includes(p.id)}
                  onChange={() => set("projectIds", toggle(selection.projectIds, p.id))}
                />
              ))}
            </div>
          </Section>
          <Section title="Worker type">
            <div className="space-y-2">
              {WORKER_TYPES.map(([value, label]) => (
                <CheckRow
                  key={value}
                  id={`worker-${value}`}
                  label={label}
                  checked={selection.workerTypes.includes(value)}
                  onChange={() => set("workerTypes", toggle(selection.workerTypes, value))}
                />
              ))}
            </div>
          </Section>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{count} recipients</p>
        <Button type="button" disabled={!canSend} onClick={onSend}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
