import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireAuth } from "@/components/RequireAuth";

export const Route = createFileRoute("/safety/toolbox")({
  head: () => ({
    meta: [
      { title: "Toolbox talks — FCP Connect" },
      { property: "og:title", content: "Toolbox talks — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <main className="mx-auto max-w-6xl px-3 py-6">
        <h1 className="text-2xl font-semibold">Toolbox talks</h1>
        <p className="mt-2 text-muted-foreground">Coming soon.</p>
        <Link to="/safety" className="mt-4 inline-flex text-sm text-primary underline">
          Back to Safety
        </Link>
      </main>
    </RequireAuth>
  ),
});
