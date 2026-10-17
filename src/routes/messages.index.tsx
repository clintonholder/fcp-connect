import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { useMyRoles } from "@/lib/roles";
import { useProxy } from "@/lib/proxy-context";

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

function MessagesPage() {
  const { can } = useMyRoles();
  const { readOnly } = useProxy();
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
      <p className="mt-2 text-muted-foreground">Coming soon.</p>
      <Link to="/" className="mt-4 inline-flex text-sm text-primary underline">
        Back to Home
      </Link>
    </main>
  );
}
