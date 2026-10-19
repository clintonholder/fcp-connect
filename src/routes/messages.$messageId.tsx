import { useEffect, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RequireAuth } from "@/components/RequireAuth";
import { useAuth } from "@/lib/auth-context";
import { useProxy } from "@/lib/proxy-context";
import { shouldMarkRead } from "@/lib/messages";
import { getMessage, markMessageRead } from "@/lib/messages.functions";

export const Route = createFileRoute("/messages/$messageId")({
  head: () => ({
    meta: [
      { title: "Message — FCP Connect" },
      { property: "og:title", content: "Message — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <MessagePage />
    </RequireAuth>
  ),
});

function MessagePage() {
  const { messageId } = Route.useParams();
  const { user } = useAuth();
  const { proxy, readOnly } = useProxy();
  const viewerId = proxy?.userId ?? user?.id;
  const queryClient = useQueryClient();
  const fetchMessage = useServerFn(getMessage);
  const markRead = useServerFn(markMessageRead);

  const q = useQuery({
    queryKey: ["message", messageId, viewerId],
    enabled: !!viewerId,
    queryFn: () => fetchMessage({ data: { messageId, viewAsUserId: proxy?.userId } }),
  });

  const mark = useMutation({
    mutationFn: () => markRead({ data: { messageId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages-unread"] });
      queryClient.invalidateQueries({ queryKey: ["messages-inbox"] });
    },
  });
  const marked = useRef(false);
  const msg = q.data;
  useEffect(() => {
    if (!msg || marked.current) return;
    if (shouldMarkRead({ readOnly, isRecipient: msg.isRecipient, readAt: msg.readAt })) {
      marked.current = true;
      mark.mutate();
    }
  }, [msg, readOnly, mark]);

  return (
    <main className="mx-auto max-w-3xl px-3 py-6">
      <Link to="/messages" className="inline-flex text-sm text-primary underline">
        Back to Messages
      </Link>
      {readOnly && (
        <p className="mt-3 text-sm text-muted-foreground">
          Viewing as {proxy?.name}: this message will not be marked as read.
        </p>
      )}
      {q.isLoading && <p className="mt-4 text-muted-foreground">Loading…</p>}
      {q.error && <p className="mt-4 text-destructive">{(q.error as Error).message}</p>}
      {msg && (
        <article className="mt-4 space-y-3">
          <h1 className="text-2xl font-semibold">{msg.subject}</h1>
          <div className="text-sm text-muted-foreground">
            From {msg.senderName} · {new Date(msg.sentAt).toLocaleString()}
          </div>
          {msg.link && (
            <div className="text-sm">
              {msg.link.kind === "project" ? (
                <Link
                  to="/project/$projectId"
                  params={{ projectId: msg.link.id }}
                  className="text-primary underline"
                >
                  {msg.link.name}
                </Link>
              ) : (
                <Link to="/safety" className="text-primary underline">
                  {msg.link.title}
                </Link>
              )}
            </div>
          )}
          <p className="whitespace-pre-wrap">{msg.body}</p>
        </article>
      )}
    </main>
  );
}
