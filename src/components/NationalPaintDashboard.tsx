import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useProxy } from "@/lib/proxy-context";
import { saveNpMonthlyTargets } from "@/lib/national-paint.functions";
import { formatPercent, todayIso } from "@/lib/national-paint-projects";
import {
  COUNT_STATUSES,
  MONTH_NAMES,
  moneyWhole,
  dashboardKpis,
  dashboardRows,
  projectCountByPmStatus,
  revenueByPm,
  scheduledByMonth,
  type RevenueProject,
  type TargetRow,
} from "@/lib/national-paint-revenue";
import { NationalPaintYearSelect } from "@/components/NationalPaintYearSelect";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#65a30d"];

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

async function loadProjects() {
  const [projects, pms] = await Promise.all([
    supabase
      .from("np_projects")
      .select("id, name, pm_id, status, est_start, est_end, est_revenue, exclude_revenue"),
    supabase.from("np_pms").select("id, name"),
  ]);
  const failed = [projects, pms].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    projects: (projects.data ?? []) as RevenueProject[],
    pms: pms.data ?? [],
  };
}

async function loadTargets(year: number) {
  const { data, error } = await supabase
    .from("np_budget_targets")
    .select("month, amount, reported_revenue")
    .eq("year", year);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    month: r.month,
    amount: Number(r.amount),
    reported_revenue: r.reported_revenue === null ? null : Number(r.reported_revenue),
  })) as TargetRow[];
}

const th = "px-2 py-1.5 text-right font-medium whitespace-nowrap";
const td = "px-2 py-1 text-right whitespace-nowrap";

export function NationalPaintDashboard() {
  const { readOnly } = useProxy();
  const thisYear = Number(todayIso().slice(0, 4));
  const [year, setYear] = useState(thisYear);
  const [editOpen, setEditOpen] = useState(false);
  const projectsQ = useQuery({ queryKey: ["np-dashboard-projects"], queryFn: loadProjects });
  const targetsQ = useQuery({
    queryKey: ["np-dashboard-targets", year],
    queryFn: () => loadTargets(year),
  });
  const projects = projectsQ.data;
  const targets = targetsQ.data;

  const rows = useMemo(
    () =>
      projects && targets
        ? dashboardRows(targets, scheduledByMonth(projects.projects, year))
        : null,
    [projects, targets, year],
  );
  const counts = useMemo(
    () => (projects ? projectCountByPmStatus(projects.projects, projects.pms) : []),
    [projects],
  );
  const revenuePie = useMemo(
    () => (projects ? revenueByPm(projects.projects, projects.pms) : []),
    [projects],
  );

  if (projectsQ.isLoading || targetsQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  const error = projectsQ.error ?? targetsQ.error;
  if (error || !rows || !targets) return <p className="text-destructive">{errMsg(error)}</p>;

  const kpis = dashboardKpis(rows);
  const tiles = [
    {
      label: "Revenue",
      value: moneyWhole.format(kpis.revenue),
      note: "Reported, or scheduled where not reported",
    },
    { label: "Budget", value: moneyWhole.format(kpis.budget) },
    { label: "Budget Attainment", value: formatPercent(kpis.attainment) },
    {
      label: "Budget Variance",
      value: moneyWhole.format(kpis.variance),
      bad: kpis.variance < 0,
    },
  ];

  const money = (v: number) => moneyWhole.format(v);
  const tableRows: { label: string; cells: string[]; total: string; bad?: boolean[] }[] = [
    {
      label: "Budget",
      cells: rows.months.map((m) => money(m.budget)),
      total: money(rows.totals.budget),
    },
    {
      label: "Scheduled",
      cells: rows.months.map((m) => money(m.scheduled)),
      total: money(rows.totals.scheduled),
    },
    {
      label: "Reported",
      cells: rows.months.map((m) => (m.reported === null ? "" : money(m.reported))),
      total: money(rows.totals.actual),
    },
    {
      label: "Variance",
      cells: rows.months.map((m) => money(m.variance)),
      total: money(rows.totals.variance),
      bad: [...rows.months.map((m) => m.variance < 0), rows.totals.variance < 0],
    },
    {
      label: "Attainment %",
      cells: rows.months.map((m) => formatPercent(m.attainment)),
      total: formatPercent(rows.totals.attainment),
    },
    {
      label: "YTD Budget",
      cells: rows.months.map((m) => money(m.ytdBudget)),
      total: money(rows.totals.ytdBudget),
    },
    {
      label: "YTD Scheduled",
      cells: rows.months.map((m) => money(m.ytdScheduled)),
      total: money(rows.totals.ytdScheduled),
    },
    {
      label: "YTD Reported/Scheduled",
      cells: rows.months.map((m) => money(m.ytdActual)),
      total: money(rows.totals.ytdActual),
    },
    {
      label: "YTD Variance",
      cells: rows.months.map((m) => money(m.ytdVariance)),
      total: money(rows.totals.ytdVariance),
      bad: [...rows.months.map((m) => m.ytdVariance < 0), rows.totals.ytdVariance < 0],
    },
    {
      label: "YTD Attainment %",
      cells: rows.months.map((m) => formatPercent(m.ytdAttainment)),
      total: formatPercent(rows.totals.ytdAttainment),
    },
  ];

  const monthlyData = rows.months.map((m) => ({
    month: MONTH_NAMES[m.month - 1],
    budget: m.budget,
    scheduled: m.scheduled,
    reported: m.reported,
  }));
  const monthlyConfig: ChartConfig = {
    budget: { label: "Budget", color: "#94a3b8" },
    scheduled: { label: "Scheduled", color: "#2563eb" },
    reported: { label: "Reported", color: "#d97706" },
  };
  const countConfig: ChartConfig = Object.fromEntries(
    COUNT_STATUSES.map((s, i) => [s, { label: s, color: PALETTE[i] }]),
  );
  const pieConfig: ChartConfig = Object.fromEntries(
    revenuePie.map((r, i) => [r.name, { label: r.name, color: PALETTE[i % PALETTE.length] }]),
  );
  const chartClass = "aspect-auto h-64 w-full";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <NationalPaintYearSelect
          id="np-dash-year"
          year={year}
          onChange={setYear}
          thisYear={thisYear}
        />
        {!readOnly && <Button onClick={() => setEditOpen(true)}>Edit targets</Button>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <Card key={t.label}>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm font-medium text-muted-foreground">{t.label}</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className={`text-xl font-semibold ${t.bad ? "text-destructive" : ""}`}>
                {t.value}
              </p>
              {t.note && <p className="text-xs text-muted-foreground">{t.note}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="sticky left-0 z-10 bg-muted px-2 py-1.5 text-left font-medium whitespace-nowrap">
                {year}
              </th>
              {MONTH_NAMES.map((m) => (
                <th key={m} className={th}>
                  {m}
                </th>
              ))}
              <th className={th}>Total</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => (
              <tr key={r.label} className="border-t">
                <td className="sticky left-0 z-10 bg-background px-2 py-1 font-medium whitespace-nowrap">
                  {r.label}
                </td>
                {r.cells.map((c, i) => (
                  <td key={i} className={`${td} ${r.bad?.[i] ? "text-destructive" : ""}`}>
                    {c}
                  </td>
                ))}
                <td className={`${td} font-medium ${r.bad?.[12] ? "text-destructive" : ""}`}>
                  {r.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Budget vs scheduled vs reported</CardTitle>
          </CardHeader>
          <CardContent>
            {rows.totals.budget === 0 && rows.totals.scheduled === 0 && rows.totals.actual === 0 ? (
              <p className="text-sm text-muted-foreground">No budget or revenue for {year}.</p>
            ) : (
              <ChartContainer config={monthlyConfig} className={chartClass}>
                <ComposedChart data={monthlyData}>
                  <CartesianGrid vertical={false} />
                  <XAxis xAxisId="b" dataKey="month" tickLine={false} axisLine={false} />
                  <XAxis xAxisId="s" dataKey="month" hide />
                  <YAxis
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar xAxisId="b" dataKey="budget" fill="var(--color-budget)" />
                  <Bar xAxisId="s" dataKey="scheduled" fill="var(--color-scheduled)" barSize={10} />
                  <Line
                    xAxisId="b"
                    dataKey="reported"
                    stroke="var(--color-reported)"
                    strokeWidth={2}
                    connectNulls={false}
                  />
                </ComposedChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project count by PM / status</CardTitle>
          </CardHeader>
          <CardContent>
            {counts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects with a PM yet.</p>
            ) : (
              <ChartContainer config={countConfig} className={chartClass}>
                <BarChart data={counts} layout="vertical">
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={80} tickLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {COUNT_STATUSES.map((s, i) => (
                    <Bar key={s} dataKey={s} stackId="count" fill={PALETTE[i]} />
                  ))}
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by PM</CardTitle>
          </CardHeader>
          <CardContent>
            {revenuePie.length === 0 ? (
              <p className="text-sm text-muted-foreground">No revenue by PM yet.</p>
            ) : (
              <ChartContainer config={pieConfig} className={chartClass}>
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
                  <ChartLegend content={<ChartLegendContent nameKey="name" />} />
                  <Pie data={revenuePie} dataKey="revenue" nameKey="name">
                    {revenuePie.map((r, i) => (
                      <Cell key={r.pmId} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {!readOnly && (
        <EditTargetsDialog
          key={`${year}-${editOpen}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          year={year}
          targets={targets}
        />
      )}
    </div>
  );
}

function EditTargetsDialog({
  open,
  onOpenChange,
  year,
  targets,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  targets: TargetRow[];
}) {
  const qc = useQueryClient();
  const save = useServerFn(saveNpMonthlyTargets);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() =>
    MONTH_NAMES.map((_, i) => {
      const t = targets.find((x) => x.month === i + 1);
      return {
        amount: t ? String(t.amount) : "",
        reported: t?.reported_revenue == null ? "" : String(t.reported_revenue),
      };
    }),
  );

  const set = (i: number, key: "amount" | "reported", value: string) =>
    setForm((f) => f.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  const submit = async () => {
    setBusy(true);
    try {
      await save({
        data: {
          year,
          months: form.map((r, i) => ({
            month: i + 1,
            amount: r.amount.trim() === "" ? 0 : Number(r.amount),
            reported_revenue: r.reported.trim() === "" ? null : Number(r.reported),
          })),
        },
      });
      await qc.invalidateQueries({ queryKey: ["np-dashboard-targets", year] });
      toast.success(`Saved ${year} targets`);
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {year} targets</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Leave Reported blank to use the scheduled revenue for that month.
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2 text-sm font-medium">
            <span>Month</span>
            <span>Budget</span>
            <span>Reported</span>
          </div>
          {MONTH_NAMES.map((m, i) => (
            <div key={m} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2">
              <span className="text-sm">{m}</span>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                aria-label={`${m} budget`}
                value={form[i].amount}
                onChange={(e) => set(i, "amount", e.target.value)}
              />
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                aria-label={`${m} reported`}
                value={form[i].reported}
                onChange={(e) => set(i, "reported", e.target.value)}
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void submit()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
