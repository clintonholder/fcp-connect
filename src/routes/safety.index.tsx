import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, FlaskConical, HeartPulse, ListChecks, Megaphone } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useMyRoles } from "@/lib/roles";
import { useProxy } from "@/lib/proxy-context";
import { pendingAcknowledgements, type AckDoc } from "@/lib/safety-acknowledgements";
import { visibleToViewer, type SafetyCategory } from "@/lib/safety-documents";
import { Badge } from "@/components/ui/badge";
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

const ackCard = {
  to: "/safety/acknowledgements",
  label: "Acknowledgements",
  description: "Who has acknowledged each safety document.",
  icon: ListChecks,
} as const;

// Categories each card lists, as in the document pages.
const CARD_CATEGORIES: Record<string, SafetyCategory[]> = {
  "/safety/sds": ["sds"],
  "/safety/first-aid": ["first_aid", "emergency"],
};

export const Route = createFileRoute("/safety/")({
  head: () => ({
    meta: [
      { title: "Safety — FCP Connect" },
      { property: "og:title", content: "Safety — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <SafetyHome />
    </RequireAuth>
  ),
});

function SafetyHome() {
  const { can } = useMyRoles();
  const { proxy } = useProxy();
  const { user } = useAuth();
  const viewerId = proxy?.userId ?? user?.id;
  const canSee = can.can_view_safety || can.can_manage_safety;

  const pendingQ = useQuery({
    queryKey: ["safety-pending-acknowledgements", viewerId, can.can_manage_safety],
    enabled: canSee && !!viewerId,
    queryFn: async () => {
      const [docs, acks] = await Promise.all([
        supabase
          .from("safety_documents")
          .select(
            "id, title, category, version, revision, archived, requires_acknowledgement, shareable_with_subs",
          )
          .eq("archived", false)
          .eq("requires_acknowledgement", true),
        supabase
          .from("safety_acknowledgements")
          .select("user_id, document_id, revision")
          .eq("user_id", viewerId!),
      ]);
      if (docs.error) throw docs.error;
      if (acks.error) throw acks.error;
      const visible = visibleToViewer(
        // visibleToViewer needs these fields; description is unused by it.
        ((docs.data ?? []) as AckDoc[]).map((d) => ({ ...d, description: null })),
        {
          canManage: can.can_manage_safety,
          isSubcontractor: proxy?.workerType === "subcontractor",
        },
      );
      return pendingAcknowledgements(visible, acks.data ?? [], viewerId!);
    },
  });

  const pendingCount = (to: string) => {
    const cats = CARD_CATEGORIES[to];
    return cats ? (pendingQ.data ?? []).filter((d) => cats.includes(d.category)).length : 0;
  };

  const shown = can.can_manage_safety ? [...cards, ackCard] : cards;

  return (
    <main className="mx-auto max-w-6xl px-3 py-6">
      <h1 className="mb-4 text-2xl font-semibold">Safety</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {shown.map(({ to, label, description, icon: Icon }) => {
          const count = pendingCount(to);
          return (
            <Link
              key={to}
              to={to}
              className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full transition-colors hover:bg-secondary">
                <CardContent className="flex flex-col items-start gap-2 p-5">
                  <Icon className="h-8 w-8 text-primary" />
                  <div className="flex flex-wrap items-center gap-2 text-lg font-medium">
                    {label}
                    {count > 0 && <Badge variant="destructive">{count} to acknowledge</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      <Link to="/" className="mt-4 inline-flex text-sm text-primary underline">
        Back to Home
      </Link>
    </main>
  );
}
