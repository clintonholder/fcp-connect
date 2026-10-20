import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  filterFinanceRows,
  financeRows,
  financeTotals,
  pct1,
  pmOptions,
  sortFinanceRows,
  type FinanceRow,
  type FinanceSortKey,
  type OverallStatus,
} from "@/lib/national-paint-finance";
import { todayIso } from "@/lib/national-paint-projects";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_CLASS: Record<OverallStatus, string> = {
  RED: "bg-red-600 text-white hover:bg-red-600",
  YELLOW: "bg-yellow-400 text-black hover:bg-yellow-400",
  GREEN: "bg-green-600 text-white hover:bg-green-600",
};

const money = (v: number | null) => (v === null ? "" : moneyWhole.format(v));

type Column = {
  key: FinanceSortKey;
  label: string;
  align?: "left";
  wrap?: boolean;
  cell: (r: FinanceRow) => ReactNode;
  total?: (t: ReturnType<typeof financeTotals>) => ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "label",
    label: "Job",
    align: "left",
    cell: (r) => (
      <Link
        to="/national-paint/analysis"
        search={{ job: r.jobCode }}
        className="text-primary hover:underline"
      >
        {r.label}
      </Link>
    ),
    total: (t) => `${t.count} jobs`,
  },
  { key: "pm", label: "PM", align: "left", cell: (r) => r.pm ?? "" },
  { key: "systemStatus", label: "System status", align: "left", cell: (r) => r.systemStatus ?? "" },
  { key: "scheduleMatch", label: "Schedule match", align: "left", cell: (r) => r.scheduleMatch },
  {
    key: "currentRevenue",
    label: "Current revenue",
    cell: (r) => money(r.currentRevenue),
    total: (t) => money(t.currentRevenue),
  },
  {
    key: "currentBudget",
    label: "Current budget",
    cell: (r) => money(r.currentBudget),
    total: (t) => money(t.currentBudget),
  },
  {
    key: "projectedCost",
    label: "Projected cost",
    cell: (r) => money(r.projectedCost),
    total: (t) => money(t.projectedCost),
  },
  {
    key: "spentToDate",
    label: "Spent to date",
    cell: (r) => money(r.spentToDate),
    total: (t) => money(t.spentToDate),
  },
  {
    key: "billedToDate",
    label: "Billed to date",
    cell: (r) => money(r.billedToDate),
    total: (t) => money(t.billedToDate),
  },
  {
    key: "earnedRevenue",
    label: "Earned revenue",
    cell: (r) => money(r.earnedRevenue),
    total: (t) => money(t.earnedRevenue),
  },
  {
    key: "backlog",
    label: "Backlog",
    cell: (r) => money(r.backlog),
    total: (t) => money(t.backlog),
  },
  {
    key: "riskAdjustedCost",
    label: "Risk-adjusted cost",
    cell: (r) => money(r.riskAdjustedCost),
    total: (t) => money(t.riskAdjustedCost),
  },
  {
    key: "forecastProfit",
    label: "Forecast profit",
    cell: (r) => money(r.forecastProfit),
    total: (t) => money(t.forecastProfit),
  },
  {
    key: "forecastMargin",
    label: "Forecast margin",
    cell: (r) => pct1(r.forecastMargin),
    total: (t) => (t.forecastMargin === null ? "" : pct1(t.forecastMargin)),
  },
  {
    key: "commitmentGap",
    label: "Commitment gap",
    cell: (r) => money(r.commitmentGap),
    total: (t) => money(t.commitmentGap),
  },
  {
    key: "revenueCoVsCostCo",
    label: "Revenue CO vs Cost CO",
    cell: (r) => money(r.revenueCoVsCostCo),
    total: (t) => money(t.revenueCoVsCostCo),
  },
  {
    key: "costOverrun",
    label: "Cost overrun",
    cell: (r) => money(r.costOverrun),
    total: (t) => money(t.costOverrun),
  },
  {
    key: "unbudgetedSpend",
    label: "Unbudgeted spend",
    cell: (r) => money(r.unbudgetedSpend),
    total: (t) => money(t.unbudgetedSpend),
  },
  {
    key: "billingGap",
    label: "Billing gap",
    cell: (r) => money(r.billingGap),
    total: (t) => money(t.billingGap),
  },
  {
    key: "overallStatus",
    label: "Overall status",
    align: "left",
    cell: (r) => <Badge className={STATUS_CLASS[r.overallStatus]}>{r.overallStatus}</Badge>,
  },
  { key: "riskScore", label: "Risk score", cell: (r) => r.riskScore.toFixed(1) },
  {
    key: "riskExplanation",
    label: "Risk explanation",
    align: "left",
    wrap: true,
    cell: (r) => r.riskExplanation,
  },
];

const ALL = "all";
const th = "px-2 py-1.5 font-medium whitespace-nowrap";
const stickyHead =
  "sticky left-0 z-10 bg-muted px-2 py-1.5 text-left font-medium whitespace-nowrap";

export function NationalPaintFinance() {
  const jobsQ = useQuery({ queryKey: FINANCE_JOBS_KEY, queryFn: loadFinanceJobs });
  const projectsQ = useQuery({ queryKey: FINANCE_PROJECTS_KEY, queryFn: loadProjects });
  const pmsQ = useQuery({ queryKey: FINANCE_PMS_KEY, queryFn: loadPms });
  const [status, setStatus] = useState(ALL);
  const [pm, setPm] = useState(ALL);
  const [sortKey, setSortKey] = useState<FinanceSortKey>("riskScore");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const all = useMemo(
    () =>
      jobsQ.data && projectsQ.data && pmsQ.data
        ? financeRows(jobsQ.data, projectsQ.data, pmsQ.data, todayIso())
        : [],
    [jobsQ.data, projectsQ.data, pmsQ.data],
  );
  const rows = useMemo(
    () => sortFinanceRows(filterFinanceRows(all, { status, pm }), sortKey, direction),
    [all, status, pm, sortKey, direction],
  );
  const totals = useMemo(() => financeTotals(rows), [rows]);
  const pmChoices = useMemo(() => pmOptions(all), [all]);

  const failed = jobsQ.error ?? projectsQ.error ?? pmsQ.error;
  if (failed) return <p className="text-destructive">{errMsg(failed)}</p>;
  if (jobsQ.isLoading || projectsQ.isLoading || pmsQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if ((jobsQ.data ?? []).length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No Project Budget & Cost upload yet.{" "}
        <Link to="/national-paint/cmic" className="text-primary hover:underline">
          Upload it on the CMiC page
        </Link>
        .
      </p>
    );
  }

  function sortBy(key: FinanceSortKey) {
    if (key === sortKey) setDirection(direction === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDirection("asc");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filter by overall status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {(["RED", "YELLOW", "GREEN"] as const).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pm} onValueChange={setPm}>
          <SelectTrigger className="w-full sm:w-52" aria-label="Filter by PM">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All PMs</SelectItem>
            {pmChoices.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground sm:ml-auto">
          {rows.length} of {all.length} jobs
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No jobs match these filters.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                {COLUMNS.map((c) => {
                  const Icon =
                    sortKey !== c.key ? ArrowUpDown : direction === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={c.key}
                      className={`${c.key === "label" ? stickyHead : th} ${c.align === "left" ? "text-left" : "text-right"} ${c.wrap ? "min-w-72" : ""}`}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-medium"
                        onClick={() => sortBy(c.key)}
                      >
                        {c.label}
                        <Icon className="h-3 w-3" />
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.jobCode} className="border-t">
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={
                        c.key === "label"
                          ? "sticky left-0 z-10 bg-background px-2 py-1 whitespace-nowrap"
                          : `px-2 py-1 ${c.align === "left" ? "text-left" : "text-right"} ${c.wrap ? "min-w-72" : "whitespace-nowrap"}`
                      }
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 font-semibold">
                {COLUMNS.map((c) => (
                  <td
                    key={c.key}
                    className={
                      c.key === "label"
                        ? "sticky left-0 z-10 bg-background px-2 py-1 whitespace-nowrap"
                        : `px-2 py-1 ${c.align === "left" ? "text-left" : "text-right"} whitespace-nowrap`
                    }
                  >
                    {c.total?.(totals)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
