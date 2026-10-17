import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/messages")({
  head: () => ({
    meta: [
      { title: "Messages — FCP Connect" },
      { property: "og:title", content: "Messages — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <main className="mx-auto max-w-6xl px-3 py-6">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="mt-2 text-muted-foreground">Coming soon.</p>
        <Link to="/" className="mt-4 inline-flex text-sm text-primary underline">
          Back to Home
        </Link>
      </main>
    </RequireAuth>
  ),
});
