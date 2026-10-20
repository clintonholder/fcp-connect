import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProxy } from "@/lib/proxy-context";
import { readSheetCells } from "@/lib/national-paint-import";
import {
  CMIC_REPORTS,
  CMIC_SHEET,
  checkCmicFile,
  checkPayloadSize,
  parseCmicExport,
  type CmicParseResult,
  type CmicReportKey,
} from "@/lib/national-paint-cmic";
import {
  cmicMatchStatus,
  rankCmicMatches,
  type CmicConfidence,
  type CmicMatchJob,
  type CmicSuggestion,
} from "@/lib/national-paint-cmic-match";
import { setNpProjectCmicJob, uploadNpCmic } from "@/lib/national-paint.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const PAGE = 1000;
const JOBS_KEY = ["np-cmic-jobs"];
const PROJECTS_KEY = ["np-cmic-projects"];
const LINES_KEY = ["np-cmic-cost-lines"];

type JobRow = CmicMatchJob & { id: string; created_at: string };
type ProjectRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  status: string;
  est_start: string | null;
  cmic_job_number: string | null;
};

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** PostgREST returns at most 1,000 rows per request, so read in blocks until a short page. */
async function readAll<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}

const loadJobs = () =>
  readAll<JobRow>(
    (from, to) =>
      supabase
        .from("np_cmic_jobs")
        .select(
          "id, source, job_code, job_name, customer_name, est_start, actual_start, job_start, created_at",
        )
        .order("id")
        .range(from, to) as never,
  );

const loadProjects = () =>
  readAll<ProjectRow>(
    (from, to) =>
      supabase
        .from("np_projects")
        .select("id, name, city, state, status, est_start, cmic_job_number")
        .order("id")
        .range(from, to) as never,
  );

async function loadLineCount() {
  const { count, error } = await supabase
    .from("np_cmic_cost_lines")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const num = new Intl.NumberFormat("en-US");

type Slot = {
  fileName: string;
  result: CmicParseResult | null;
  error: string | null;
  loading: boolean;
};

const confidenceVariant: Record<CmicConfidence, "default" | "secondary" | "outline"> = {
  high: "default",
  medium: "secondary",
  low: "outline",
};

export function NationalPaintCmic() {
  const { readOnly } = useProxy();
  const qc = useQueryClient();
  const jobsQ = useQuery({ queryKey: JOBS_KEY, queryFn: loadJobs });
  const projectsQ = useQuery({ queryKey: PROJECTS_KEY, queryFn: loadProjects });
  const linesQ = useQuery({ queryKey: LINES_KEY, queryFn: loadLineCount });
  const upload = useServerFn(uploadNpCmic);
  const setMatch = useServerFn(setNpProjectCmicJob);

  const [slots, setSlots] = useState<Record<CmicReportKey, Slot | null>>({
    budget_cost: null,
    cost_summaries: null,
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [unmatchedOnly, setUnmatchedOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const jobs = useMemo(() => jobsQ.data ?? [], [jobsQ.data]);
  const projects = useMemo(
    () =>
      [...(projectsQ.data ?? [])].sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      ),
    [projectsQ.data],
  );

  const jobNames = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const j of [...jobs].sort((a, b) =>
      a.source === b.source ? 0 : a.source === "budget_cost" ? -1 : 1,
    )) {
      const code = j.job_code.trim();
      if (!m.has(code) || (!m.get(code) && j.job_name)) m.set(code, j.job_name);
    }
    return m;
  }, [jobs]);
  const codeOptions = useMemo(
    () => [...jobNames.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    [jobNames],
  );
  const knownCodes = useMemo(
    () => new Set([...jobNames.keys()].map((c) => c.toUpperCase())),
    [jobNames],
  );

  const rows = useMemo(
    () =>
      projects.map((p) => {
        const code = p.cmic_job_number?.trim() || null;
        const inData = code ? knownCodes.has(code.toUpperCase()) : false;
        return {
          p,
          code,
          inData,
          status: jobs.length ? cmicMatchStatus(p.name, code, jobs) : null,
          suggestions: jobs.length ? rankCmicMatches(p, jobs) : [],
        };
      }),
    [projects, jobs, knownCodes],
  );
  const shown = unmatchedOnly
    ? rows.filter((r) => !r.code || (jobs.length > 0 && !r.inData))
    : rows;

  const summary = (source: CmicReportKey) => {
    const list = jobs.filter((j) => j.source === source);
    const latest = list.reduce((m, j) => (j.created_at > m ? j.created_at : m), "");
    return { count: list.length, latest };
  };

  async function choose(report: CmicReportKey, file: File | undefined) {
    if (!file) {
      setSlots((s) => ({ ...s, [report]: null }));
      return;
    }
    setSlots((s) => ({
      ...s,
      [report]: { fileName: file.name, result: null, error: null, loading: true },
    }));
    let next: Slot;
    try {
      checkCmicFile(file);
      const result = parseCmicExport(await readSheetCells(file, CMIC_SHEET), report);
      checkPayloadSize({ [report]: result.part });
      next = { fileName: file.name, result, error: null, loading: false };
    } catch (e) {
      next = { fileName: file.name, result: null, error: errMsg(e), loading: false };
    }
    setSlots((s) => ({ ...s, [report]: next }));
  }

  const ready = (Object.keys(slots) as CmicReportKey[]).filter((k) => slots[k]?.result);
  const anyError = (Object.keys(slots) as CmicReportKey[]).some((k) => slots[k]?.error);

  async function doUpload() {
    setUploading(true);
    try {
      const part = (k: CmicReportKey) => {
        const slot = slots[k];
        if (!slot?.result) return undefined;
        return {
          fileName: slot.fileName,
          skippedRows: slot.result.rowsSkipped,
          problemCount: slot.result.problems.length,
          payload: slot.result.part as never,
        };
      };
      const data = { budgetCost: part("budget_cost"), costSummaries: part("cost_summaries") };
      checkPayloadSize(data);
      const counts = await upload({ data });
      const bits = [
        counts.budget_jobs !== null && `${num.format(counts.budget_jobs)} Budget & Cost jobs`,
        counts.cost_summary_jobs !== null &&
          `${num.format(counts.cost_summary_jobs)} Cost Summaries jobs`,
        counts.cost_lines !== null && `${num.format(counts.cost_lines)} cost lines`,
      ].filter(Boolean);
      toast.success(`CMiC data replaced: ${bits.join(", ")}`);
      setSlots({ budget_cost: null, cost_summaries: null });
      setConfirmOpen(false);
      await Promise.all([
        qc.invalidateQueries({ queryKey: JOBS_KEY }),
        qc.invalidateQueries({ queryKey: LINES_KEY }),
      ]);
    } catch (e) {
      toast.error(errMsg(e));
      setConfirmOpen(false);
    } finally {
      setUploading(false);
    }
  }

  async function save(p: ProjectRow, jobCode: string | null) {
    setBusyId(p.id);
    try {
      await setMatch({ data: { id: p.id, jobCode } });
      toast.success(jobCode ? `${p.name} matched to ${jobCode}` : `${p.name} match cleared`);
      await qc.invalidateQueries({ queryKey: PROJECTS_KEY });
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  }

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });

  const loadError = jobsQ.error ?? projectsQ.error ?? linesQ.error;
  const replaced = ready.map((k) => CMIC_REPORTS[k].label).join(" and ");

  return (
    <div className="space-y-8">
      {loadError && <p className="text-sm text-destructive">{errMsg(loadError)}</p>}

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">CMiC data</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["budget_cost", "cost_summaries"] as const).map((k) => {
            const s = summary(k);
            return (
              <div key={k} className="rounded-md border p-3 text-sm">
                <div className="font-medium">{CMIC_REPORTS[k].label}</div>
                {s.count === 0 ? (
                  <div className="text-muted-foreground">Not uploaded</div>
                ) : (
                  <div className="text-muted-foreground">
                    {num.format(s.count)} jobs
                    {k === "cost_summaries" && linesQ.data !== undefined
                      ? `, ${num.format(linesQ.data)} cost lines`
                      : ""}
                    {" · uploaded "}
                    {dateFmt.format(new Date(s.latest))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Upload</h2>
        <p className="text-sm text-muted-foreground">
          The files are read in your browser and only the parsed rows are sent. Each upload replaces
          that report&apos;s data; confirmed project matches are kept.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["budget_cost", "cost_summaries"] as const).map((k) => (
            <div key={k} className="space-y-2">
              <Label htmlFor={`np-cmic-${k}`}>{CMIC_REPORTS[k].label}</Label>
              <Input
                id={`np-cmic-${k}`}
                type="file"
                accept=".xlsx"
                disabled={readOnly}
                onChange={(e) => {
                  void choose(k, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              {slots[k] && <PreviewCard report={k} slot={slots[k]!} />}
            </div>
          ))}
        </div>
        {!readOnly && (
          <Button
            disabled={ready.length === 0 || anyError || uploading}
            onClick={() => setConfirmOpen(true)}
          >
            Upload
          </Button>
        )}
      </section>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace CMiC data?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces the {replaced} data. Confirmed project matches are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={uploading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={uploading}
              onClick={(e) => {
                e.preventDefault();
                void doUpload();
              }}
            >
              {uploading ? "Uploading…" : "Replace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Project matches</h2>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {shown.length} of {rows.length} projects
            </span>
            <Label htmlFor="np-cmic-unmatched" className="flex items-center gap-2">
              <Switch
                id="np-cmic-unmatched"
                checked={unmatchedOnly}
                onCheckedChange={setUnmatchedOnly}
              />
              Unmatched only
            </Label>
          </div>
        </div>
        {jobs.length === 0 && !jobsQ.isLoading && (
          <p className="text-sm text-muted-foreground">
            Upload the CMiC exports to see suggested matches.
          </p>
        )}
        {(jobsQ.isLoading || projectsQ.isLoading) && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Current match</TableHead>
                <TableHead>CMiC status</TableHead>
                <TableHead>Suggestions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => (
                <Fragment key={r.p.id}>
                  <TableRow className="align-top">
                    <TableCell>
                      <ProjectName p={r.p} />
                    </TableCell>
                    <TableCell>{r.p.status}</TableCell>
                    <TableCell>
                      <CurrentMatch
                        code={r.code}
                        inData={r.inData}
                        hasData={jobs.length > 0}
                        names={jobNames}
                      />
                    </TableCell>
                    <TableCell>{r.status ?? "—"}</TableCell>
                    <TableCell className="space-y-2">
                      <Suggestions
                        row={r}
                        open={expanded.has(r.p.id)}
                        onToggle={() => toggle(r.p.id)}
                        readOnly={readOnly}
                        busy={busyId === r.p.id}
                        onUse={(code) => save(r.p, code)}
                      />
                      <MatchActions
                        project={r.p}
                        code={r.code}
                        options={codeOptions}
                        readOnly={readOnly}
                        busy={busyId === r.p.id}
                        onSave={(code) => save(r.p, code)}
                      />
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 sm:hidden">
          {shown.map((r) => (
            <div key={r.p.id} className="space-y-2 rounded-md border p-3 text-sm">
              <ProjectName p={r.p} />
              <div className="text-muted-foreground">{r.p.status}</div>
              <div>
                <span className="text-muted-foreground">Current: </span>
                <CurrentMatch
                  code={r.code}
                  inData={r.inData}
                  hasData={jobs.length > 0}
                  names={jobNames}
                />
              </div>
              <div>
                <span className="text-muted-foreground">CMiC status: </span>
                {r.status ?? "—"}
              </div>
              <Suggestions
                row={r}
                open={expanded.has(r.p.id)}
                onToggle={() => toggle(r.p.id)}
                readOnly={readOnly}
                busy={busyId === r.p.id}
                onUse={(code) => save(r.p, code)}
              />
              <MatchActions
                project={r.p}
                code={r.code}
                options={codeOptions}
                readOnly={readOnly}
                busy={busyId === r.p.id}
                onSave={(code) => save(r.p, code)}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function PreviewCard({ report, slot }: { report: CmicReportKey; slot: Slot }) {
  const r = slot.result;
  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="break-all font-medium">{slot.fileName}</div>
      {slot.loading && <p className="text-muted-foreground">Reading…</p>}
      {slot.error && <p className="text-destructive">{slot.error}</p>}
      {r && (
        <>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Header row</dt>
            <dd>{r.headerRow}</dd>
            <dt className="text-muted-foreground">Rows read</dt>
            <dd>{num.format(r.rowsRead)}</dd>
            <dt className="text-muted-foreground">Jobs</dt>
            <dd>{num.format(r.jobs)}</dd>
            {report === "cost_summaries" && (
              <>
                <dt className="text-muted-foreground">Cost lines</dt>
                <dd>{num.format(r.costLines)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Rows skipped</dt>
            <dd>{num.format(r.rowsSkipped)}</dd>
            <dt className="text-muted-foreground">Duplicate job codes</dt>
            <dd>{r.duplicates.length}</dd>
          </dl>
          {r.missingColumns.length > 0 && (
            <p>
              <span className="text-muted-foreground">Columns not found (imported empty): </span>
              {r.missingColumns.join(", ")}
            </p>
          )}
          {r.unmappedColumns.length > 0 && (
            <p>
              <span className="text-muted-foreground">Columns ignored: </span>
              {r.unmappedColumns.join(", ")}
            </p>
          )}
          {r.problems.length > 0 && (
            <div>
              <div className="text-muted-foreground">
                {r.problems.length} problem{r.problems.length === 1 ? "" : "s"}
                {r.problems.length > 50 ? " (first 50 shown)" : ""}
              </div>
              <ul className="max-h-40 overflow-y-auto">
                {r.problems.slice(0, 50).map((p, i) => (
                  <li key={i}>
                    Row {p.row}, {p.column}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="text-muted-foreground">First jobs</div>
            <ul>
              {r.sample.map((j) => (
                <li key={j.job_code} className="break-words">
                  {j.job_code}
                  {j.job_name ? ` — ${j.job_name}` : ""}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function ProjectName({ p }: { p: ProjectRow }) {
  const place = [p.city, p.state].filter(Boolean).join(", ");
  return (
    <div>
      <div className="font-medium">{p.name}</div>
      {place && <div className="text-xs text-muted-foreground">{place}</div>}
    </div>
  );
}

function CurrentMatch({
  code,
  inData,
  hasData,
  names,
}: {
  code: string | null;
  inData: boolean;
  hasData: boolean;
  names: Map<string, string | null>;
}) {
  if (!code) return <span className="text-muted-foreground">None</span>;
  const name = names.get(code);
  return (
    <span className="space-x-2">
      <span>
        {code}
        {name ? ` — ${name}` : ""}
      </span>
      {hasData && !inData && <Badge variant="destructive">Not in CMiC data</Badge>}
    </span>
  );
}

type ReviewRow = { p: ProjectRow; code: string | null; suggestions: CmicSuggestion[] };

function Suggestions({
  row,
  open,
  onToggle,
  readOnly,
  busy,
  onUse,
}: {
  row: ReviewRow;
  open: boolean;
  onToggle: () => void;
  readOnly: boolean;
  busy: boolean;
  onUse: (code: string) => void;
}) {
  const list = row.suggestions;
  if (list.length === 0) return <span className="text-muted-foreground">No suggestions</span>;
  const shownList = open ? list : list.slice(0, 1);
  return (
    <div className="space-y-2">
      {shownList.map((s) => (
        <div key={s.job_code} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-words">
              {s.job_code}
              {s.job_name ? ` — ${s.job_name}` : ""}
            </span>
            <Badge variant={confidenceVariant[s.confidence]}>{s.confidence}</Badge>
            {!readOnly && s.job_code !== row.code && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onUse(s.job_code)}>
                Use
              </Button>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {s.note}
            {open && s.reasons.length > 0 ? ` · ${s.reasons.join(", ")}` : ""}
          </div>
        </div>
      ))}
      {list.length > 1 && (
        <button
          type="button"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={onToggle}
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {open ? "Show less" : `All ${list.length} suggestions`}
        </button>
      )}
    </div>
  );
}

function MatchActions({
  project,
  code,
  options,
  readOnly,
  busy,
  onSave,
}: {
  project: ProjectRow;
  code: string | null;
  options: [string, string | null][];
  readOnly: boolean;
  busy: boolean;
  onSave: (code: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  if (readOnly) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" disabled={busy || options.length === 0}>
            Choose job…
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,90vw)] p-0" align="start">
          <Command>
            <CommandInput placeholder={`Search jobs for ${project.name}`} />
            <CommandList>
              <CommandEmpty>No job found.</CommandEmpty>
              <CommandGroup>
                {options.map(([c, name]) => (
                  <CommandItem
                    key={c}
                    value={`${c} ${name ?? ""}`}
                    onSelect={() => {
                      setOpen(false);
                      onSave(c);
                    }}
                  >
                    {c}
                    {name ? ` — ${name}` : ""}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {code && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSave(null)}>
          Clear
        </Button>
      )}
    </div>
  );
}
