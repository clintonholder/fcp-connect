import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderKanban, MessageSquare, ShieldCheck } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { Card, CardContent } from "@/components/ui/card";

const tiles = [
  {
    to: "/projects",
    label: "Projects",
    description: "Job sites, photos and checklists.",
    icon: FolderKanban,
  },
  {
    to: "/safety",
    label: "Safety",
    description: "Safety documents and reports.",
    icon: ShieldCheck,
  },
  {
    to: "/messages",
    label: "Messages",
    description: "Your inbox and team messages.",
    icon: MessageSquare,
  },
] as const;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Home — FCP Connect" },
      {
        name: "description",
        content: "Choose where to work in FCP Connect: projects, safety or messages.",
      },
      { property: "og:title", content: "Home — FCP Connect" },
      {
        property: "og:description",
        content: "Choose where to work in FCP Connect: projects, safety or messages.",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <HomePage />
    </RequireAuth>
  ),
});

function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-3 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Home</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tiles.map(({ to, label, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors hover:bg-secondary">
              <CardContent className="flex flex-col items-start gap-2 p-5">
                <Icon className="h-8 w-8 text-primary" />
                <div className="text-lg font-medium">{label}</div>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
