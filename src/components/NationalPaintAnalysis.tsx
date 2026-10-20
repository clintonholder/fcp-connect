import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChevronDown, ChevronRight, ChevronsUpDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  categoryModel,
  categoryModelText,
  causeTests,
  cmicSourceText,
  costBridge,
  costCodeDetail,
  forecastComparison,
  headerBanner,
  isTotalJob,
  jobEndDate,
  jobFinance,
  jobLabel,
  jobPm,
  mdy,
  pct1,
  primaryCostPressure,
  scheduleChip,
  summaryText,
  type CostLine,
  type DriverFlag,
  type FinanceJob,
  type ScheduleChip,
} from "@/lib/national-paint-finance";
import { todayIso } from "@/lib/national-paint-projects";
import { readAll } from "@/lib/national-paint-read";
import { moneyWhole } from "@/lib/national-paint-revenue";
import {
  errMsg,
  FINANCE_JOBS_KEY,
  FINANCE_PMS_KEY,
  FINANCE_PROJECTS_KEY,
  loadFinanceJobs,
  loadPms,
  loadProjects,
} from "@/components/national-paint-finance-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const LINE_COLUMNS =
  "cost_code, cost_code_name, category_name, original_budgeted_cost, current_budgeted_cost, projected_cost, spent_to_date, committed_to_date, committed_remaining, spent_outside_commitments";

/** The selected job's JC Cost Summaries lines; no summaries row means no lines. */
async function loadLines(jobCode: string): Promise<CostLine[]> {
  const head = await supabase
    .from("np_cmic_jobs")
    .select("id")
    .eq("source", "cost_summaries")
    .eq("job_code", jobCode)
    .maybeSingle();
  if (head.error) throw new Error(head.error.message);
  if (!head.data) return [];
  const jobId = head.data.id;
  return readAll<CostLine>(
    (from, to) =>
      supabase
        .from("np_cmic_cost_lines")
        .select(LINE_COLUMNS)
        .eq("job_id", jobId)
        .order("id")
        .range(from, to) as never,
  );
}

const money = (v: number) => moneyWhole.format(v);
const BANNER: Record<string, string> = {
  RED: "bg-red-600 text-white",
  YELLOW: "bg-yellow-400 text-black",
  GREEN: "bg-green-600 text-white",
};
const CHIP: Record<ScheduleChip["tone"], string> = {
  neutral: "bg-secondary text-secondary-foreground",
  yellow: "bg-yellow-300 text-black",
  orange: "bg-orange-400 text-black",
  red: "bg-red-600 text-white",
};
const FLAG: Record<DriverFlag, string> = {
  "OVER BUDGET": "bg-red-600 text-white",
  UNBUDGETED: "bg-orange-400 text-black",
  "SOURCE FCST > MODEL": "bg-orange-400 text-black",
  "COST CODE MISMATCH": "bg-yellow-300 text-black",
  OK: "bg-green-600 text-white",
};

const th = "px-2 py-1.5 text-right font-medium whitespace-nowrap";
const td = "px-2 py-1 text-right whitespace-nowrap";
const stickyHead =
  "sticky left-0 z-10 bg-muted px-2 py-1.5 text-left font-medium whitespace-nowrap";
const stickyCell = "sticky left-0 z-10 bg-background px-2 py-1 text-left whitespace-nowrap";
const chartClass = "aspect-auto h-64 w-full";

function Tile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold break-words">{value}</div>
    </div>
  );
}

const tiles = "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4";

export function NationalPaintAnalysis() {
  const { job: code } = useSearch({ from: "/national-paint/analysis" });
  const navigate = useNavigate();
  const jobsQ = useQuery({ queryKey: FINANCE_JOBS_KEY, queryFn: loadFinanceJobs });
  const projectsQ = useQuery({ queryKey: FINANCE_PROJECTS_KEY, queryFn: loadProjects });
  const pmsQ = useQuery({ queryKey: FINANCE_PMS_KEY, queryFn: loadPms });
  const linesQ = useQuery({
    queryKey: ["np-analysis-lines", code],
    queryFn: () => loadLines(code as string),
    enabled: !!code,
  });
  const [pickerOpen, setPickerOpen] = useState(false);

  const options = useMemo(
    () =>
      (jobsQ.data ?? [])
        .filter((j) => !isTotalJob(j))
        .map((j) => ({ code: j.job_code, label: jobLabel(j) }))
        .sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase())),
    [jobsQ.data],
  );
  const job = useMemo(
    () => (jobsQ.data ?? []).find((j) => j.job_code === code && !isTotalJob(j)),
    [jobsQ.data, code],
  );

  const failed = jobsQ.error ?? projectsQ.error ?? pmsQ.error ?? (code ? linesQ.error : null);
  if (failed) return <p className="text-destructive">{errMsg(failed)}</p>;
  if (jobsQ.isLoading || projectsQ.isLoading || pmsQ.isLoading)
    return <p className="text-sm text-muted-foreground">Loading…</p>;

  const selected = options.find((o) => o.code === code);
  const picker = (
    <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between sm:w-96">
          <span className="truncate">{selected?.label ?? "Choose a job…"}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,90vw)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search jobs" />
          <CommandList>
            <CommandEmpty>No job found.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.code}
                  value={o.label}
                  onSelect={() => {
                    setPickerOpen(false);
                    navigate({ to: "/national-paint/analysis", search: { job: o.code } });
                  }}
                >
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Project financial analysis</h2>
        {picker}
      </div>
      {!code ? (
        <p className="text-sm text-muted-foreground">Choose a job to see its analysis.</p>
      ) : !job ? (
        <p className="text-sm text-muted-foreground">
          This job is not in the latest Project Budget & Cost upload.
        </p>
      ) : linesQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Analysis
          job={job}
          lines={linesQ.data ?? []}
          pm={jobPm(job.job_code, job.contact_code, projectsQ.data ?? [], pmsQ.data ?? [])}
        />
      )}
    </div>
  );
}

function Analysis({ job, lines, pm }: { job: FinanceJob; lines: CostLine[]; pm: string | null }) {
  const today = todayIso();
  const n = (x: number | null) => x ?? 0;
  const revenue = n(job.current_budgeted_revenue);
  const finance = jobFinance(job, today)!;
  const cats = categoryModel(lines, revenue);
  const codes = costCodeDetail(lines);
  const original = n(job.original_budget);
  const current = n(job.current_budget);
  const cmic = n(job.projected_total_costs);
  const actual = cats.totals.actual;
  const catForecast = cats.totals.forecast;
  const catProfit = revenue - catForecast;
  const catMargin = revenue === 0 ? 0 : catProfit / revenue;
  const earned = n(job.earned_revenue);
  const billed = n(job.billed_to_date);

  const chip = scheduleChip(job, today);
  const end = jobEndDate(job);
  const banner = headerBanner(finance, catMargin, revenue);
  const bridge = costBridge(original, current, actual, catForecast, cmic);
  const comparison = forecastComparison(catForecast, cmic, actual, revenue);
  const tests = causeTests(cats, revenue, job.spent_to_date);
  const noLines = "No JC Cost Summaries lines for this job.";

  const bridgeConfig = { amount: { label: "Amount", color: "#2563eb" } } satisfies ChartConfig;
  const catConfig = {
    current: { label: "Current Budget", color: "#2563eb" },
    actual: { label: "Actual Spent", color: "#d97706" },
  } satisfies ChartConfig;
  const bridgeData = bridge.map((b, i) => ({
    name: ["Original", "Current", "Actual", "Category fcst", "CMiC fcst"][i],
    amount: b.amount,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>SYSTEM: {job.status || "—"}</span>
        <span>END: {end ? mdy(end) : "—"}</span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${CHIP[chip.tone]}`}>
          {chip.label}
        </span>
      </div>

      <div className={`space-y-1 rounded-md p-3 font-semibold ${BANNER[banner.status]}`}>
        {banner.lines.map((l) => (
          <div key={l}>{l}</div>
        ))}
      </div>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Financial position at a glance</h3>
        <div className={tiles}>
          <Tile label="Original cost budget" value={money(original)} />
          <Tile label="Current cost budget" value={money(current)} />
          <Tile label="Actual cost to date" value={money(actual)} />
          <Tile label="Category-based forecast" value={money(catForecast)} />
          <Tile label="CMiC source forecast" value={money(cmic)} />
          <Tile label="Category forecast profit" value={money(catProfit)} />
          <Tile label="Category forecast margin" value={pct1(catMargin)} />
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Cost bridge</h3>
        <p className="text-sm text-muted-foreground">
          Where the job started, where it is, and two views of where it may finish.
        </p>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className={stickyHead}>Position</th>
                <th className={th}>Amount</th>
                <th className={th}>vs current budget</th>
                <th className={`${th} min-w-72 text-left`}>How to interpret</th>
              </tr>
            </thead>
            <tbody>
              {bridge.map((b) => (
                <tr key={b.label} className="border-t">
                  <td className={stickyCell}>{b.label}</td>
                  <td className={td}>{money(b.amount)}</td>
                  <td className={td}>{money(b.vsCurrent)}</td>
                  <td className="min-w-72 px-2 py-1 text-left">{b.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost position: budget → actual → forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={bridgeConfig} className={chartClass}>
              <BarChart data={bridgeData}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  fontSize={11}
                />
                <YAxis
                  width={56}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="amount" fill="var(--color-amount)" />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Forecast comparison</h3>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className={stickyHead}>Measure</th>
                <th className={th}>Category model</th>
                <th className={th}>CMiC source</th>
                <th className={th}>Difference</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((c) => {
                const f = c.percent ? pct1 : money;
                return (
                  <tr key={c.measure} className="border-t">
                    <td className={stickyCell}>{c.measure}</td>
                    <td className={td}>{f(c.category)}</td>
                    <td className={td}>{f(c.cmic)}</td>
                    <td className={td}>{f(c.difference)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Revenue, billing & delivery position</h3>
        <div className={tiles}>
          <Tile label="Current revenue" value={money(revenue)} />
          <Tile label="Earned revenue" value={money(earned)} />
          <Tile label="Billed to date" value={money(billed)} />
          <Tile label="Billing position" value={money(earned - billed)} />
          <Tile label="% complete" value={pct1(revenue === 0 ? 0 : earned / revenue)} />
          <Tile label="Project manager" value={pm ?? "—"} />
          <Tile label="System status" value={job.status || "—"} />
        </div>
        <p className="text-sm">
          {summaryText({
            original,
            current,
            actual,
            categoryRemaining: cats.totals.remaining,
            categoryForecast: catForecast,
            categoryProfit: catProfit,
            categoryMargin: catMargin,
            cmic,
            billingGap: finance.billingGap,
            revenue,
          })}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border p-3 text-sm">
            <div className="mb-1 font-medium">Category model</div>
            {categoryModelText(cats.totals.remaining)}
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="mb-1 font-medium">CMiC source model</div>
            {cmicSourceText(cmic, current, catForecast)}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Cost category drivers</h3>
        {cats.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{noLines}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className={stickyHead}>Category</th>
                    <th className={th}>Original Budget</th>
                    <th className={th}>Current Budget</th>
                    <th className={th}>Actual Spent</th>
                    <th className={th}>Remaining Budget</th>
                    <th className={th}>Forecast Cost</th>
                    <th className={th}>Over / (Under)</th>
                    <th className={th}>Share of Spend</th>
                    <th className={th}>Margin Impact</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.rows.map((r) => (
                    <tr key={r.name} className="border-t">
                      <td className={stickyCell}>{r.name}</td>
                      <td className={td}>{money(r.original)}</td>
                      <td className={td}>{money(r.current)}</td>
                      <td className={td}>{money(r.actual)}</td>
                      <td className={td}>{money(r.remaining)}</td>
                      <td className={td}>{money(r.forecast)}</td>
                      <td className={td}>{money(r.over)}</td>
                      <td className={td}>{pct1(r.share)}</td>
                      <td className={td}>{pct1(r.marginImpact)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 font-semibold">
                    <td className="sticky left-0 z-10 bg-background px-2 py-1 text-left">Total</td>
                    <td className={td}>{money(cats.totals.original)}</td>
                    <td className={td}>{money(cats.totals.current)}</td>
                    <td className={td}>{money(cats.totals.actual)}</td>
                    <td className={td}>{money(cats.totals.remaining)}</td>
                    <td className={td}>{money(cats.totals.forecast)}</td>
                    <td className={td}>{money(cats.totals.over)}</td>
                    <td className={td}></td>
                    <td className={td}>{pct1(revenue === 0 ? 0 : cats.totals.over / revenue)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Current budget vs actual spend by category
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={catConfig}
                  className="aspect-auto w-full"
                  style={{ height: Math.max(256, cats.rows.length * 56) }}
                >
                  <BarChart data={cats.rows} layout="vertical">
                    <CartesianGrid horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                    />
                    <YAxis type="category" dataKey="name" width={90} tickLine={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="current" fill="var(--color-current)" />
                    <Bar dataKey="actual" fill="var(--color-actual)" />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-lg font-semibold">Cause & margin impact tests</h3>
        {cats.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{noLines}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className={stickyHead}>Signal</th>
                    <th className={th}>Amount</th>
                    <th className={th}>Margin impact</th>
                    <th className={`${th} min-w-72 text-left`}>Management interpretation</th>
                  </tr>
                </thead>
                <tbody>
                  {tests.map((t) => (
                    <tr key={t.signal} className="border-t">
                      <td className={stickyCell}>{t.signal}</td>
                      <td className={td}>{money(t.amount)}</td>
                      <td className={td}>{t.marginImpact === null ? "" : pct1(t.marginImpact)}</td>
                      <td className="min-w-72 px-2 py-1 text-left">{t.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm font-medium">{primaryCostPressure(cats, revenue)}</p>
          </>
        )}
      </section>

      <CostCodeDetail codes={codes} noLines={noLines} />
    </div>
  );
}

function CostCodeDetail({
  codes,
  noLines,
}: {
  codes: ReturnType<typeof costCodeDetail>;
  noLines: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="space-y-2">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex items-center gap-1 text-lg font-semibold">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Cost code detail
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {codes.length === 0 ? (
          <p className="text-sm text-muted-foreground">{noLines}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className={stickyHead}>Cost Code</th>
                  <th className={`${th} text-left`}>Cost Code Name</th>
                  <th className={`${th} text-left`}>Category</th>
                  <th className={th}>Original Budget</th>
                  <th className={th}>Current Budget</th>
                  <th className={th}>Source Projected</th>
                  <th className={th}>Actual Spent</th>
                  <th className={th}>Committed</th>
                  <th className={th}>Commit. Remaining</th>
                  <th className={th}>Outside Commitments</th>
                  <th className={th}>Allocated Rem. Forecast</th>
                  <th className={th}>Selected Forecast</th>
                  <th className={th}>Over / (Under)</th>
                  <th className={`${th} text-left`}>Driver Flag</th>
                </tr>
              </thead>
              <tbody>
                {codes.map((r) => (
                  <tr key={`${r.costCode}|${r.category}`} className="border-t">
                    <td className={stickyCell}>{r.costCode}</td>
                    <td className="px-2 py-1 text-left whitespace-nowrap">{r.costCodeName}</td>
                    <td className="px-2 py-1 text-left whitespace-nowrap">{r.category}</td>
                    <td className={td}>{money(r.original)}</td>
                    <td className={td}>{money(r.current)}</td>
                    <td className={td}>{money(r.sourceProjected)}</td>
                    <td className={td}>{money(r.actual)}</td>
                    <td className={td}>{money(r.committed)}</td>
                    <td className={td}>{money(r.commitRemaining)}</td>
                    <td className={td}>{money(r.outsideCommitments)}</td>
                    <td className={td}>{money(r.allocatedRemaining)}</td>
                    <td className={td}>{money(r.selectedForecast)}</td>
                    <td className={td}>{money(r.over)}</td>
                    <td className="px-2 py-1 text-left whitespace-nowrap">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${FLAG[r.driverFlag]}`}
                      >
                        {r.driverFlag}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
