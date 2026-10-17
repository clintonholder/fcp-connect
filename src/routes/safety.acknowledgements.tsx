import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileDown } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { useMyRoles } from "@/lib/roles";
import { generateSafetyAcknowledgementPdf } from "@/lib/safety-acknowledgement-pdf";
import { getSafetyAcknowledgementReport } from "@/lib/safety.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/safety/acknowledgements")({
  head: () => ({
    meta: [
      { title: "Acknowledgements — FCP Connect" },
      { property: "og:title", content: "Acknowledgements — FCP Connect" },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AcknowledgementsPage />
    </RequireAuth>
  ),
});

function AcknowledgementsPage() {
  const { can, loading } = useMyRoles();
  const fetchReport = useServerFn(getSafetyAcknowledgementReport);
  const q = useQuery({
    queryKey: ["safety-acknowledgement-report"],
    enabled: can.can_manage_safety,
    queryFn: () => fetchReport(),
  });
  const report = q.data ?? [];

  return (
    <main className="mx-auto max-w-4xl px-3 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Acknowledgements</h1>
        {can.can_manage_safety && (
          <Button
            variant="outline"
            disabled={!q.data}
            onClick={() => generateSafetyAcknowledgementPdf(report)}
          >
            <FileDown className="mr-1 h-4 w-4" /> Export PDF
          </Button>
        )}
      </div>
      <Link to="/safety" className="mt-2 inline-flex text-sm text-primary underline">
        Back to Safety
      </Link>

      {loading ? (
        <p className="mt-4 text-muted-foreground">Loading…</p>
      ) : !can.can_manage_safety ? (
        <p className="mt-4 text-muted-foreground">You don't have access to this report.</p>
      ) : q.isLoading ? (
        <p className="mt-4 text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="mt-4 text-destructive">
          {q.error instanceof Error ? q.error.message : "Something went wrong"}
        </p>
      ) : report.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No documents require acknowledgement.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {report.map(({ document: d, acknowledged, pending }) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle className="text-lg">{d.title}</CardTitle>
                <div className="text-sm text-muted-foreground">
                  {d.version ? `Version ${d.version}` : `Revision ${d.revision}`} ·{" "}
                  {acknowledged.length} of {acknowledged.length + pending.length} acknowledged
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h2 className="mb-1 text-sm font-medium">Acknowledged ({acknowledged.length})</h2>
                  {acknowledged.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nobody yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {acknowledged.map((a) => (
                        <li key={a.person.id}>
                          {a.person.name}{" "}
                          <span className="text-muted-foreground">
                            {new Date(a.acknowledgedAt).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h2 className="mb-1 text-sm font-medium">Not acknowledged ({pending.length})</h2>
                  {pending.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Everyone has acknowledged.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {pending.map((p) => (
                        <li key={p.id}>{p.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
