import { createFileRoute, Link } from "@tanstack/react-router";
import { ClipboardCheck, FlaskConical, HeartPulse, Megaphone } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { Card, CardContent } from "@/components/ui/card";

const cards = [
  {
    to: "/safety/jha",
    label: "JHA",
    description: "Job hazard analyses.",
    icon: ClipboardCheck,
  },
  {
    to: "/safety/toolbox",
    label: "Toolbox talks",
    description: "Short safety talks for the crew.",
    icon: Megaphone,
  },
  {
    to: "/safety/sds",
    label: "SDS / MSDS",
    description: "Safety data sheets for materials.",
    icon: FlaskConical,
  },
  {
    to: "/safety/first-aid",
    label: "First aid",
    description: "First aid and emergency procedures.",
    icon: HeartPulse,
  },
] as const;

export const Route = createFileRoute("/safety/")({
  head: () => ({
    meta: [
      { title: "Safety — FCP Connect" },
      { property: "og:title", content: "Safety — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <main className="mx-auto max-w-6xl px-3 py-6">
        <h1 className="mb-4 text-2xl font-semibold">Safety</h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map(({ to, label, description, icon: Icon }) => (
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
        <Link to="/" className="mt-4 inline-flex text-sm text-primary underline">
          Back to Home
        </Link>
      </main>
    </RequireAuth>
  ),
});
