import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { useMyRoles } from "@/lib/roles";
import { useProxy } from "@/lib/proxy-context";
import { getInbox, getSentMessages } from "@/lib/messages.functions";

export const Route = createFileRoute("/messages/")({
  head: () => ({
    meta: [
      { title: "Messages — FCP Connect" },
      { property: "og:title", content: "Messages — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <MessagesPage />
    </RequireAuth>
  ),
});

function Inbox({ viewAsUserId, viewerId }: { viewAsUserId?: string; viewerId?: string }) {
  const fetchInbox = useServerFn(getInbox);
  const q = useQuery({
    queryKey: ["messages-inbox", viewerId],
    enabled: !!viewerId,
    queryFn: () => fetchInbox({ data: { viewAsUserId } }),
  });
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{(q.error as Error).message}</p>;
  if (!q.data?.length) return <p className="text-muted-foreground">No messages yet.</p>;
  return (
    <div className="space-y-2">
      {q.data.map((m) => (
        <Card key={m.id}>
          <CardContent className="flex items-center justify-between gap-2 p-4">
            <div className="min-w-0">
              <Link
                to="/messages/$messageId"
                params={{ messageId: m.id }}
                className={`block truncate hover:underline ${m.readAt ? "" : "font-bold"}`}
              >
                {m.subject}
              </Link>
              <div className="text-sm text-muted-foreground">
                {m.senderName} · {new Date(m.sentAt).toLocaleString()}
              </div>
            </div>
            {!m.readAt && <Badge>Unread</Badge>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Sent({ viewAsUserId, viewerId }: { viewAsUserId?: string; viewerId?: string }) {
  const fetchSent = useServerFn(getSentMessages);
  const q = useQuery({
    queryKey: ["messages-sent", viewerId],
    enabled: !!viewerId,
    queryFn: () => fetchSent({ data: { viewAsUserId } }),
  });
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{(q.error as Error).message}</p>;
  if (!q.data?.length) {
    return <p className="text-muted-foreground">You haven't sent any messages.</p>;
  }
  return (
    <div className="space-y-2">
      {q.data.map((m) => (
        <Card key={m.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <Link
                to="/messages/$messageId"
                params={{ messageId: m.id }}
                className="truncate font-medium hover:underline"
              >
                {m.subject}
              </Link>
              <span className="shrink-0 text-sm text-muted-foreground">
                Read by {m.readCount} of {m.recipientCount}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {new Date(m.sentAt).toLocaleString()}
            </div>
            <ul className="space-y-0.5 text-sm">
              {m.recipients.map((r) => (
                <li key={r.userId} className="flex justify-between gap-2">
                  <span>{r.name}</span>
                  <span className="text-muted-foreground">
                    {r.readAt ? `Read ${new Date(r.readAt).toLocaleString()}` : "Unread"}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MessagesPage() {
  const { user } = useAuth();
  const { can } = useMyRoles();
  const { proxy, readOnly } = useProxy();
  const viewerId = proxy?.userId ?? user?.id;
  return (
    <main className="mx-auto max-w-6xl px-3 py-6">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Messages</h1>
        {can.can_send_messages && !readOnly && (
          <Button asChild>
            <Link to="/messages/new">New message</Link>
          </Button>
        )}
      </div>
      <Tabs defaultValue="inbox" className="mt-4">
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          {can.can_send_messages && <TabsTrigger value="sent">Sent</TabsTrigger>}
        </TabsList>
        <TabsContent value="inbox">
          <Inbox viewAsUserId={proxy?.userId} viewerId={viewerId} />
        </TabsContent>
        {can.can_send_messages && (
          <TabsContent value="sent">
            <Sent viewAsUserId={proxy?.userId} viewerId={viewerId} />
          </TabsContent>
        )}
      </Tabs>
      <Link to="/" className="mt-4 inline-flex text-sm text-primary underline">
        Back to Home
      </Link>
    </main>
  );
}
