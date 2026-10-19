import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useMyRoles } from "@/lib/roles";
import { useProxy } from "@/lib/proxy-context";
import {
  buildImport,
  readWorkbook,
  type ImportPayload,
  type ImportReport,
} from "@/lib/national-paint-import";
import { importNationalPaintWorkbook } from "@/lib/national-paint.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/national-paint/import")({
  head: () => ({
    meta: [
      { title: "Import — National Paint — FCP Connect" },
      { property: "og:title", content: "Import — National Paint — FCP Connect" },
    ],
  }),
  component: ImportPage,
});

type Parsed = { fileName: string; payload: ImportPayload; report: ImportReport; errors: string[] };

function ImportPage() {
  const { isAdmin } = useMyRoles();
  const { readOnly } = useProxy();
  const runImport = useServerFn(importNationalPaintWorkbook);
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!isAdmin) return <p className="text-muted-foreground">Administrators only.</p>;

  async function parse(f: File | null, y: number) {
    setParsed(null);
    setReadError(null);
    if (!f) return;
    setReading(true);
    try {
      const data = await readWorkbook(f);
      const { payload, report } = buildImport(data, y);
      setParsed({ fileName: f.name, payload, report, errors: data.errors });
    } catch (e) {
      setReadError(e instanceof Error ? e.message : "Could not read the workbook.");
    } finally {
      setReading(false);
    }
  }

  async function doImport() {
    if (!parsed) return;
    setImporting(true);
    try {
      const counts = await runImport({
        data: {
          fileName: parsed.fileName,
          budgetYear: year,
          duplicateCrewCount: parsed.report.duplicateCrews.length,
          skippedRowCount: parsed.report.problems.length,
          payload: parsed.payload,
        },
      });
      toast.success(
        `Imported ${counts.pms} PMs, ${counts.contractors} contractors, ${counts.crews} crews, ${counts.projects} projects and ${counts.budget_months} budget months.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
      setConfirmOpen(false);
    }
  }

  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  const blocked = !parsed || parsed.errors.length > 0 || reading || importing;

  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Import</h2>
      <p className="text-sm text-muted-foreground">
        Choose the National Paint Scheduling Tool workbook. It is read in your browser; the file is
        never uploaded.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="np-file">Workbook</Label>
          <Input
            id="np-file"
            type="file"
            accept=".xlsm,.xlsx"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              void parse(f, year);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="np-year">Budget year</Label>
          <Select
            value={String(year)}
            onValueChange={(v) => {
              setYear(Number(v));
              void parse(file, Number(v));
            }}
          >
            <SelectTrigger id="np-year" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {reading && <p className="text-sm text-muted-foreground">Reading workbook…</p>}
      {readError && <p className="text-sm text-destructive">{readError}</p>}

      {parsed && <Preview parsed={parsed} year={year} />}

      {!readOnly && (
        <Button disabled={blocked} onClick={() => setConfirmOpen(true)}>
          Import
        </Button>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace National Paint data?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces all National Paint PMs, contractors, crews and projects, and the {year}{" "}
              budget. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={importing}
              onClick={(e) => {
                e.preventDefault();
                void doImport();
              }}
            >
              {importing ? "Importing…" : "Import"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Preview({ parsed, year }: { parsed: Parsed; year: number }) {
  const { payload, report, errors } = parsed;
  const counts: [string, number][] = [
    ["PMs", payload.pms.length],
    ["Contractors", payload.contractors.length],
    ["Crews", payload.crews.length],
    ["Projects", payload.projects.length],
    [`Budget months (${year})`, payload.budget.length],
  ];
  return (
    <div className="space-y-4">
      {errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-destructive">Workbook problems</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm">
              {errors.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">To import</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            {counts.map(([label, n]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-lg font-medium">{n}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Duplicate crews ({report.duplicateCrews.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {report.duplicateCrews.length === 0 ? (
            <p className="text-muted-foreground">None.</p>
          ) : (
            <ul className="list-disc pl-5">
              {report.duplicateCrews.map((d) => (
                <li key={`${d.contractor}|${d.name}`}>
                  {d.name}
                  {d.contractor ? ` (${d.contractor})` : ""}: rows {d.rows.join(", ")}. The first is
                  kept.
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Skipped or reported rows ({report.problems.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {report.problems.length === 0 ? (
            <p className="text-muted-foreground">None.</p>
          ) : (
            <ul className="max-h-72 list-disc overflow-y-auto pl-5">
              {report.problems.map((p, i) => (
                <li key={i}>
                  {p.table}
                  {p.row ? ` row ${p.row}` : ""}: {p.message}
                </li>
              ))}
            </ul>
          )}
          {report.pmsAddedFromProjects.length > 0 && (
            <p className="mt-2">
              PMs added because projects use them but the PMs table does not list them:{" "}
              {report.pmsAddedFromProjects.join(", ")}.
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Columns</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            <p className="font-medium">Unmapped columns</p>
            {report.unmappedColumns.length === 0 ? (
              <p className="text-muted-foreground">None.</p>
            ) : (
              <ul className="list-disc pl-5">
                {report.unmappedColumns.map((u) => (
                  <li key={u.table}>
                    {u.table}: {u.columns.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="font-medium">Fields with no matching column</p>
            {report.missingFields.length === 0 ? (
              <p className="text-muted-foreground">None.</p>
            ) : (
              <ul className="list-disc pl-5">
                {report.missingFields.map((u) => (
                  <li key={u.table}>
                    {u.table}: {u.fields.join(", ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
