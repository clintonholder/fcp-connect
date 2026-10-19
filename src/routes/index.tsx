import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderKanban, MessageSquare, PaintRoller, ShieldCheck } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useMyRoles } from "@/lib/roles";
import { useUnreadMessageCount } from "@/lib/use-unread-messages";

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

const nationalPaintTile = {
  to: "/national-paint",
  label: "National Paint",
  description: "Projects, crews, schedule and finance.",
  icon: PaintRoller,
} as const;

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
  const unread = useUnreadMessageCount();
  const { can } = useMyRoles();
  const visibleTiles = can.can_manage_national_paint ? [...tiles, nationalPaintTile] : tiles;
  return (
    <main className="mx-auto max-w-6xl px-3 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Home</h1>
      <div
        className={`grid grid-cols-1 gap-4 ${visibleTiles.length > 3 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}
      >
        {visibleTiles.map(({ to, label, description, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors hover:bg-secondary">
              <CardContent className="flex flex-col items-start gap-2 p-5">
                <Icon className="h-8 w-8 text-primary" />
                <div className="flex items-center gap-2 text-lg font-medium">
                  {label}
                  {to === "/messages" && unread > 0 && (
                    <Badge variant="destructive">{unread} unread</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
