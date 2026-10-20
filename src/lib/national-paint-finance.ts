import { isoToDay, formatPercent } from "@/lib/national-paint-projects";
import { NO_PM, moneyWhole } from "@/lib/national-paint-revenue";

/**
 * National Paint finance rules, ported from the workbook (Project Budget & Cost columns Y..AL and
 * the Project Analysis sheet). Pure helpers: no DOM, network or Supabase.
 */

export type FinanceJob = {
  job_code: string;
  job_name: string | null;
  contact_code: string | null;
  status: string | null;
  est_end: string | null;
  actual_end: string | null;
  awarded_contract_value: number | null;
  current_budgeted_revenue: number | null;
  billed_to_date: number | null;
  original_budget: number | null;
  current_budget: number | null;
  projected_total_costs: number | null;
  spent_to_date: number | null;
  profit_pct: number | null;
  cost_remaining: number | null;
  earned_revenue: number | null;
  backlog: number | null;
};

export type OverallStatus = "RED" | "YELLOW" | "GREEN";

export type JobFinance = {
  profitPctUsed: number | null;
  riskAdjustedCost: number;
  forecastProfit: number;
  forecastMargin: number;
  commitmentGap: number;
  revenueCoVsCostCo: number | null;
  costOverrun: number;
  unbudgetedSpend: number;
  billingGap: number;
  stale: boolean;
  overallStatus: OverallStatus;
  riskExplanation: string;
  riskScore: number;
};

const n = (x: number | null | undefined) => x ?? 0;
const DAY_MS = 86_400_000;
const MARGIN_FLOOR = 0.2;

/** Fraction to one-decimal percent text, e.g. 0.123 to "12.3%". */
export function pct1(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function isTotalJob(job: Pick<FinanceJob, "job_code" | "job_name">): boolean {
  return `${job.job_code} ${job.job_name ?? ""}`.toUpperCase().includes("TOTAL");
}

export function jobLabel(job: Pick<FinanceJob, "job_code" | "job_name">): string {
  const name = job.job_name?.trim();
  return name ? `${job.job_code} - ${name}` : job.job_code;
}

export function isStale(job: FinanceJob, today: string): boolean {
  const status = (job.status ?? "").trim().toLowerCase();
  if (status !== "started" && status !== "pending") return false;
  if (job.actual_end) return false;
  return (
    job.projected_total_costs === null ||
    !job.est_end ||
    isoToDay(job.est_end) < isoToDay(today) - 30
  );
}

const round1 = (x: number) => Math.round(x * 10) / 10;

function signedMoney(x: number): string {
  return x > 0 ? `+${moneyWhole.format(x)}` : moneyWhole.format(x);
}

/** The workbook Y..AL columns for one job, or null for a TOTAL row. */
export function jobFinance(job: FinanceJob, today: string): JobFinance | null {
  if (isTotalJob(job)) return null;
  const revenue = n(job.current_budgeted_revenue);
  const spent = n(job.spent_to_date);
  const rac = Math.max(n(job.projected_total_costs), spent + n(job.cost_remaining));
  const forecastProfit = revenue - rac;
  const forecastMargin = revenue === 0 ? 0 : forecastProfit / revenue;
  const commitmentGap = Math.max(0, spent + n(job.cost_remaining) - n(job.projected_total_costs));
  const awardMissing = !(job.awarded_contract_value !== null && job.awarded_contract_value > 0);
  const originalMissing = job.original_budget === null;
  const co =
    !awardMissing && !originalMissing
      ? revenue -
        (job.awarded_contract_value as number) -
        (n(job.current_budget) - (job.original_budget as number))
      : null;
  const costOverrun = Math.max(0, rac - n(job.current_budget));
  const unbudgetedSpend = Math.max(0, spent - n(job.current_budget));
  const billingGap = Math.max(0, n(job.earned_revenue) - n(job.billed_to_date));
  const stale = isStale(job, today);
  const coMismatch = Math.abs(n(co)) > 0.01;

  const overallStatus: OverallStatus =
    forecastMargin < MARGIN_FLOOR || commitmentGap > 0 || coMismatch
      ? "RED"
      : costOverrun > 0 || unbudgetedSpend > 0 || billingGap > 0 || stale
        ? "YELLOW"
        : "GREEN";

  const baseline =
    awardMissing && originalMissing
      ? "Awarded contract value and original cost budget missing — CO mismatch not evaluated"
      : awardMissing
        ? "Awarded contract value missing — CO mismatch not evaluated"
        : originalMissing
          ? "Original cost budget missing — CO mismatch not evaluated"
          : "";
  const riskExplanation =
    [
      baseline,
      forecastMargin < MARGIN_FLOOR ? `Forecast margin ${pct1(forecastMargin)} is below 20%` : "",
      commitmentGap > 0 ? `Commitments exceed forecast by ${moneyWhole.format(commitmentGap)}` : "",
      coMismatch ? `Revenue/cost CO mismatch ${signedMoney(n(co))}` : "",
      costOverrun > 0
        ? `Risk-adjusted cost exceeds budget by ${moneyWhole.format(costOverrun)}`
        : "",
      unbudgetedSpend > 0 ? `Spend exceeds budget by ${moneyWhole.format(unbudgetedSpend)}` : "",
      billingGap > 0 ? `Earned revenue exceeds billing by ${moneyWhole.format(billingGap)}` : "",
      stale ? "Forecast is stale or incomplete" : "",
    ]
      .filter(Boolean)
      .join("; ") || "No material exception";

  const rev = Math.abs(revenue);
  const marginMiss = Math.max(0, (MARGIN_FLOOR - forecastMargin) * rev);
  const riskAmt = Math.max(
    marginMiss,
    commitmentGap,
    Math.abs(n(co)),
    costOverrun,
    unbudgetedSpend,
    billingGap,
  );
  const riskScore = round1(
    1 +
      99 *
        Math.min(
          1,
          0.6 * Math.min(1, riskAmt / Math.max(1, rev) / 0.25) +
            0.35 * Math.min(1, riskAmt / 100000) +
            0.05 * (stale ? 1 : 0),
        ),
  );

  return {
    profitPctUsed: job.profit_pct === null ? null : job.profit_pct / 100,
    riskAdjustedCost: rac,
    forecastProfit,
    forecastMargin,
    commitmentGap,
    revenueCoVsCostCo: co,
    costOverrun,
    unbudgetedSpend,
    billingGap,
    stale,
    overallStatus,
    riskExplanation,
    riskScore,
  };
}

// ---- PM and schedule match ----

export type FinanceProject = { pm_id: string | null; cmic_job_number: string | null };
type Pm = { id: string; name: string };

const codeKey = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();

function matchedProjects<P extends FinanceProject>(jobCode: string, projects: P[]): P[] {
  const key = codeKey(jobCode);
  return key ? projects.filter((p) => codeKey(p.cmic_job_number) === key) : [];
}

export function scheduleMatch(jobCode: string, projects: FinanceProject[]): "Found" | "Missing" {
  return matchedProjects(jobCode, projects).length > 0 ? "Found" : "Missing";
}

/** The matched project(s)' PM, else the CMiC contact code, else null. */
export function jobPm(
  jobCode: string,
  contactCode: string | null,
  projects: FinanceProject[],
  pms: Pm[],
): string | null {
  const names = new Map(pms.map((p) => [p.id, p.name]));
  const found = new Set<string>();
  for (const p of matchedProjects(jobCode, projects)) {
    const name = p.pm_id ? names.get(p.pm_id) : undefined;
    if (name) found.add(name);
  }
  if (found.size > 0) {
    return [...found].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join(", ");
  }
  return contactCode?.trim() || null;
}

// ---- Finance table ----

export type FinanceRow = {
  jobCode: string;
  label: string;
  pm: string | null;
  systemStatus: string | null;
  scheduleMatch: "Found" | "Missing";
  currentRevenue: number;
  currentBudget: number;
  projectedCost: number;
  spentToDate: number;
  billedToDate: number;
  earnedRevenue: number;
  backlog: number;
  riskAdjustedCost: number;
  forecastProfit: number;
  forecastMargin: number;
  commitmentGap: number;
  revenueCoVsCostCo: number | null;
  costOverrun: number;
  unbudgetedSpend: number;
  billingGap: number;
  overallStatus: OverallStatus;
  riskScore: number;
  riskExplanation: string;
};

export function financeRows(
  jobs: FinanceJob[],
  projects: FinanceProject[],
  pms: Pm[],
  today: string,
): FinanceRow[] {
  const rows: FinanceRow[] = [];
  for (const job of jobs) {
    const f = jobFinance(job, today);
    if (!f) continue;
    rows.push({
      jobCode: job.job_code,
      label: jobLabel(job),
      pm: jobPm(job.job_code, job.contact_code, projects, pms),
      systemStatus: job.status,
      scheduleMatch: scheduleMatch(job.job_code, projects),
      currentRevenue: n(job.current_budgeted_revenue),
      currentBudget: n(job.current_budget),
      projectedCost: n(job.projected_total_costs),
      spentToDate: n(job.spent_to_date),
      billedToDate: n(job.billed_to_date),
      earnedRevenue: n(job.earned_revenue),
      backlog: n(job.backlog),
      riskAdjustedCost: f.riskAdjustedCost,
      forecastProfit: f.forecastProfit,
      forecastMargin: f.forecastMargin,
      commitmentGap: f.commitmentGap,
      revenueCoVsCostCo: f.revenueCoVsCostCo,
      costOverrun: f.costOverrun,
      unbudgetedSpend: f.unbudgetedSpend,
      billingGap: f.billingGap,
      overallStatus: f.overallStatus,
      riskScore: f.riskScore,
      riskExplanation: f.riskExplanation,
    });
  }
  return rows;
}

export type FinanceFilters = { status: string; pm: string };

export function filterFinanceRows(rows: FinanceRow[], filters: FinanceFilters): FinanceRow[] {
  return rows.filter(
    (r) =>
      (filters.status === "all" || r.overallStatus === filters.status) &&
      (filters.pm === "all" || (r.pm ?? NO_PM) === filters.pm),
  );
}

export function pmOptions(rows: FinanceRow[]): string[] {
  return [...new Set(rows.map((r) => r.pm ?? NO_PM))].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
}

export type FinanceSortKey = keyof Omit<FinanceRow, "jobCode">;

const STATUS_RANK: Record<OverallStatus, number> = { GREEN: 1, YELLOW: 2, RED: 3 };

function sortValue(r: FinanceRow, key: FinanceSortKey): string | number | null {
  const v = r[key];
  if (key === "overallStatus") return STATUS_RANK[r.overallStatus];
  if (typeof v === "string") return v.trim() === "" ? null : v.toLowerCase();
  return v;
}

/** Sorted copy; blanks last in both directions, ties by job label. */
export function sortFinanceRows(
  rows: FinanceRow[],
  key: FinanceSortKey,
  direction: "asc" | "desc",
): FinanceRow[] {
  const sign = direction === "asc" ? 1 : -1;
  const byLabel = (a: FinanceRow, b: FinanceRow) =>
    a.label.toLowerCase().localeCompare(b.label.toLowerCase());
  return [...rows].sort((a, b) => {
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x === null && y === null) return byLabel(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    const c =
      typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
    return c === 0 ? byLabel(a, b) : c * sign;
  });
}

export type FinanceTotals = {
  count: number;
  currentRevenue: number;
  currentBudget: number;
  projectedCost: number;
  spentToDate: number;
  billedToDate: number;
  earnedRevenue: number;
  backlog: number;
  riskAdjustedCost: number;
  forecastProfit: number;
  forecastMargin: number | null;
  commitmentGap: number;
  revenueCoVsCostCo: number;
  costOverrun: number;
  unbudgetedSpend: number;
  billingGap: number;
};

export function financeTotals(rows: FinanceRow[]): FinanceTotals {
  const sum = (f: (r: FinanceRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  const currentRevenue = sum((r) => r.currentRevenue);
  const forecastProfit = sum((r) => r.forecastProfit);
  return {
    count: rows.length,
    currentRevenue,
    currentBudget: sum((r) => r.currentBudget),
    projectedCost: sum((r) => r.projectedCost),
    spentToDate: sum((r) => r.spentToDate),
    billedToDate: sum((r) => r.billedToDate),
    earnedRevenue: sum((r) => r.earnedRevenue),
    backlog: sum((r) => r.backlog),
    riskAdjustedCost: sum((r) => r.riskAdjustedCost),
    forecastProfit,
    forecastMargin: currentRevenue === 0 ? null : forecastProfit / currentRevenue,
    commitmentGap: sum((r) => r.commitmentGap),
    revenueCoVsCostCo: sum((r) => r.revenueCoVsCostCo ?? 0),
    costOverrun: sum((r) => r.costOverrun),
    unbudgetedSpend: sum((r) => r.unbudgetedSpend),
    billingGap: sum((r) => r.billingGap),
  };
}

// ---- Project Analysis ----

export type CostLine = {
  cost_code: string | null;
  cost_code_name: string | null;
  category_name: string | null;
  original_budgeted_cost: number | null;
  current_budgeted_cost: number | null;
  projected_cost: number | null;
  spent_to_date: number | null;
  committed_to_date: number | null;
  committed_remaining: number | null;
  spent_outside_commitments: number | null;
};

const lc = (s: string) => s.toLowerCase();
const nonBlank = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);

export type ScheduleChip = {
  label: string;
  tone: "neutral" | "yellow" | "orange" | "red";
};

export function jobEndDate(job: Pick<FinanceJob, "actual_end" | "est_end">): string | null {
  return job.actual_end || job.est_end || null;
}

/** ISO date to m/d/yyyy. */
export function mdy(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y}`;
}

export function scheduleChip(
  job: Pick<FinanceJob, "status" | "actual_end" | "est_end">,
  today: string,
): ScheduleChip {
  if ((job.status ?? "").trim().toUpperCase() === "CLOSED") {
    return { label: "CLOSED", tone: "neutral" };
  }
  const end = jobEndDate(job);
  if (!end) return { label: "NO DATE", tone: "neutral" };
  const days = Math.max(isoToDay(today) - isoToDay(end), 0);
  if (days <= 0) return { label: "ON TRACK", tone: "neutral" };
  const tone = days >= 90 ? "red" : days >= 60 ? "orange" : days >= 30 ? "yellow" : "neutral";
  return { label: `${days} DAYS PAST`, tone };
}

export type Level = "RED" | "YELLOW" | "GREEN";

export function headerBanner(finance: JobFinance, categoryMargin: number, currentRevenue: number) {
  const marginLevel: Level =
    categoryMargin < 0.2 ? "RED" : categoryMargin < 0.25 ? "YELLOW" : "GREEN";
  const gap = finance.billingGap;
  const billingLevel: "OK" | "RED" | "YELLOW" =
    gap <= 1 ? "OK" : ratio(gap, currentRevenue) >= 0.25 ? "RED" : "YELLOW";
  return {
    status: finance.overallStatus,
    marginLevel,
    billingLevel,
    lines: [
      `OVERALL: ${finance.overallStatus} | EXPOSURE ${Math.round(finance.riskScore)}`,
      `MARGIN: ${marginLevel} ${pct1(categoryMargin)}`,
      `BILLING: ${billingLevel} ${moneyWhole.format(gap)}`,
    ],
  };
}

export type CategoryRow = {
  name: string;
  original: number;
  current: number;
  actual: number;
  remaining: number;
  forecast: number;
  over: number;
  share: number;
  marginImpact: number;
};

export type CategoryModel = {
  rows: CategoryRow[];
  totals: {
    original: number;
    current: number;
    actual: number;
    remaining: number;
    forecast: number;
    over: number;
  };
};

/** Section 8: lines with a blank category name are left out. */
export function categoryModel(lines: CostLine[], currentRevenue: number): CategoryModel {
  const by = new Map<string, { original: number; current: number; actual: number }>();
  for (const l of lines) {
    const name = nonBlank(l.category_name);
    if (!name) continue;
    const c = by.get(name) ?? { original: 0, current: 0, actual: 0 };
    c.original += n(l.original_budgeted_cost);
    c.current += n(l.current_budgeted_cost);
    c.actual += n(l.spent_to_date);
    by.set(name, c);
  }
  const base = [...by.entries()].sort((a, b) => lc(a[0]).localeCompare(lc(b[0])));
  const totalActual = base.reduce((t, [, c]) => t + c.actual, 0);
  const rows = base.map(([name, c]) => {
    const remaining = Math.max(c.current - c.actual, 0);
    const forecast = c.actual + remaining;
    const over = forecast - c.current;
    return {
      name,
      ...c,
      remaining,
      forecast,
      over,
      share: ratio(c.actual, totalActual),
      marginImpact: ratio(over, currentRevenue),
    };
  });
  const sum = (f: (r: CategoryRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  return {
    rows,
    totals: {
      original: sum((r) => r.original),
      current: sum((r) => r.current),
      actual: sum((r) => r.actual),
      remaining: sum((r) => r.remaining),
      forecast: sum((r) => r.forecast),
      over: sum((r) => r.over),
    },
  };
}

export type DriverFlag =
  "COST CODE MISMATCH" | "UNBUDGETED" | "OVER BUDGET" | "SOURCE FCST > MODEL" | "OK";

export type CostCodeRow = {
  costCode: string;
  costCodeName: string | null;
  category: string;
  original: number;
  current: number;
  sourceProjected: number;
  actual: number;
  committed: number;
  commitRemaining: number;
  outsideCommitments: number;
  allocatedRemaining: number;
  selectedForecast: number;
  over: number;
  driverFlag: DriverFlag;
};

/** Section 10: one row per (cost code, category) pair with both non-blank. */
export function costCodeDetail(lines: CostLine[]): CostCodeRow[] {
  const cats = new Map(categoryModel(lines, 0).rows.map((r) => [r.name, r]));
  const by = new Map<string, CostCodeRow>();
  for (const l of lines) {
    const costCode = nonBlank(l.cost_code);
    const category = nonBlank(l.category_name);
    if (!costCode || !category) continue;
    const key = `${costCode}|${category}`;
    let r = by.get(key);
    if (!r) {
      r = {
        costCode,
        costCodeName: l.cost_code_name,
        category,
        original: 0,
        current: 0,
        sourceProjected: 0,
        actual: 0,
        committed: 0,
        commitRemaining: 0,
        outsideCommitments: 0,
        allocatedRemaining: 0,
        selectedForecast: 0,
        over: 0,
        driverFlag: "OK",
      };
      by.set(key, r);
    }
    r.original += n(l.original_budgeted_cost);
    r.current += n(l.current_budgeted_cost);
    r.sourceProjected += n(l.projected_cost);
    r.actual += n(l.spent_to_date);
    r.committed += n(l.committed_to_date);
    r.commitRemaining += n(l.committed_remaining);
    r.outsideCommitments += n(l.spent_outside_commitments);
  }
  for (const r of by.values()) {
    const cat = cats.get(r.category);
    const catCurrent = cat?.current ?? 0;
    r.allocatedRemaining =
      catCurrent === 0
        ? 0
        : (Math.max(catCurrent - (cat?.actual ?? 0), 0) * r.current) / catCurrent;
    r.selectedForecast = r.actual + r.allocatedRemaining;
    r.over = r.selectedForecast - r.current;
    r.driverFlag =
      r.actual > 0 && r.current === 0
        ? catCurrent > 0
          ? "COST CODE MISMATCH"
          : "UNBUDGETED"
        : r.over > 0
          ? "OVER BUDGET"
          : r.sourceProjected > r.selectedForecast + 1
            ? "SOURCE FCST > MODEL"
            : "OK";
  }
  return [...by.entries()].sort((a, b) => lc(a[0]).localeCompare(lc(b[0]))).map(([, r]) => r);
}

export type CauseTest = {
  signal: string;
  amount: number;
  marginImpact: number | null;
  text: string;
};

export function causeTests(
  categories: CategoryModel,
  currentRevenue: number,
  jobSpentToDate: number | null,
): CauseTest[] {
  const overOf = (word: string) =>
    categories.rows.filter((r) => lc(r.name).includes(lc(word))).reduce((t, r) => t + r.over, 0);
  const test = (signal: string, amount: number, yes: (m: string) => string, no: string) => {
    const marginImpact = ratio(amount, currentRevenue);
    return { signal, amount, marginImpact, text: amount > 0 ? yes(pct1(marginImpact)) : no };
  };
  const total = categories.totals.over;
  const recon = categories.totals.actual - n(jobSpentToDate);
  return [
    test(
      "Labor-related overrun",
      overOf("Labor"),
      (m) => `Labor and burden reduce forecast margin by ${m}.`,
      "No labor-related overrun under the selected model.",
    ),
    test(
      "Material overrun",
      overOf("Material"),
      (m) => `Material spend is above budget and reduces forecast margin by ${m}.`,
      "Material remains within current budget.",
    ),
    test(
      "Travel & fuel overrun",
      overOf("Travel"),
      (m) =>
        `Travel and fuel reduce forecast margin by ${m}; review mobilization, lodging, and route assumptions.`,
      "Travel and fuel remain within budget.",
    ),
    test(
      "Equipment overrun",
      overOf("Equipment"),
      (m) => `Equipment reduces forecast margin by ${m}; review rental duration and utilization.`,
      "Equipment remains within budget.",
    ),
    test(
      "Total category overrun",
      total,
      (m) => `Category overruns explain ${m} of margin erosion versus current budget.`,
      "No total category overrun under the selected model.",
    ),
    {
      signal: "Detail-to-JobCost reconciliation",
      amount: recon,
      marginImpact: ratio(recon, currentRevenue),
      text:
        Math.abs(recon) < 1
          ? "PASS — JC Cost Summaries agrees to project spent to date."
          : `REVIEW — JC Cost Summaries differs from project spent to date by ${moneyWhole.format(recon)}.`,
    },
  ];
}

export function primaryCostPressure(categories: CategoryModel, currentRevenue: number): string {
  if (categories.totals.over <= 0) return "No category overrun identified.";
  const ranked = [...categories.rows].sort((a, b) => b.over - a.over);
  const [first, second] = ranked;
  const impact = pct1(ratio(first.over + (second?.over ?? 0), currentRevenue));
  const head = `Primary cost pressure: ${first.name} ${moneyWhole.format(first.over)}`;
  const next = second ? `; next: ${second.name} ${moneyWhole.format(second.over)}` : "";
  return `${head}${next}. Together they reduce margin by ${impact}.`;
}

export type BridgeRow = { label: string; amount: number; vsCurrent: number; text: string };

export function cmicSourceText(cmic: number, current: number, category: number): string {
  return `CMiC projects final cost of ${moneyWhole.format(cmic)}, which is ${moneyWhole.format(Math.abs(cmic - current))} ${cmic >= current ? "over" : "under"} current budget and ${moneyWhole.format(Math.abs(cmic - category))} ${cmic > category ? "above" : "below"} the category model.`;
}

export function costBridge(
  original: number,
  current: number,
  actual: number,
  categoryForecast: number,
  cmic: number,
): BridgeRow[] {
  const money = (x: number) => moneyWhole.format(x);
  const row = (label: string, amount: number, text: string) => ({
    label,
    amount,
    vsCurrent: amount - current,
    text,
  });
  const budgetChange = current - original;
  const actualDiff = actual - current;
  return [
    row("Original cost budget", original, "Original approved cost baseline."),
    row(
      "Current cost budget",
      current,
      budgetChange === 0
        ? "No approved budget change."
        : `Current budget changed by ${money(budgetChange)} from original.`,
    ),
    row(
      "Actual cost to date",
      actual,
      actualDiff > 0
        ? `Spend is already ${money(actualDiff)} over current budget.`
        : `Spend remains ${money(-actualDiff)} below current budget.`,
    ),
    row(
      "Category-based forecast",
      categoryForecast,
      "Actual spend plus unused category budget; expected final cost under the selected planning method.",
    ),
    row(
      "CMiC source forecast",
      cmic,
      `CMiC expects final cost to be ${money(Math.abs(cmic - current))} ${cmic >= current ? "over" : "under"} the current budget and ${money(Math.abs(cmic - categoryForecast))} ${cmic > categoryForecast ? "above" : "below"} the category forecast.`,
    ),
  ];
}

export type ComparisonRow = {
  measure: string;
  category: number;
  cmic: number;
  difference: number;
  percent: boolean;
};

export function forecastComparison(
  categoryForecast: number,
  cmicForecast: number,
  actual: number,
  revenue: number,
): ComparisonRow[] {
  const row = (measure: string, category: number, cmic: number, percent = false) => ({
    measure,
    category,
    cmic,
    difference: cmic - category,
    percent,
  });
  const catProfit = revenue - categoryForecast;
  const cmicProfit = revenue - cmicForecast;
  return [
    row("Final cost", categoryForecast, cmicForecast),
    row(
      "Cost remaining",
      Math.max(categoryForecast - actual, 0),
      Math.max(cmicForecast - actual, 0),
    ),
    row("Forecast profit", catProfit, cmicProfit),
    row("Forecast margin", ratio(catProfit, revenue), ratio(cmicProfit, revenue), true),
  ];
}

export type SummaryInput = {
  original: number;
  current: number;
  actual: number;
  categoryRemaining: number;
  categoryForecast: number;
  categoryProfit: number;
  categoryMargin: number;
  cmic: number;
  billingGap: number;
  revenue: number;
};

export function summaryText(s: SummaryInput): string {
  const m = (x: number) => moneyWhole.format(x);
  const billing =
    s.billingGap > 0
      ? `Earned revenue is ${m(s.billingGap)} ahead of billing (${formatPercent(ratio(s.billingGap, s.revenue))} of revenue), which drives the high exposure score.`
      : "Billing and earned revenue are aligned.";
  return `The job began with a ${m(s.original)} cost budget and is currently budgeted at ${m(s.current)}. Actual cost is ${m(s.actual)}, or ${m(Math.abs(s.actual - s.current))} ${s.actual > s.current ? "over" : "under"} budget. The category model expects ${m(s.categoryRemaining)} of remaining cost and a final cost of ${m(s.categoryForecast)}, producing ${m(s.categoryProfit)} profit and ${pct1(s.categoryMargin)} margin. CMiC projects ${m(s.cmic)}, which is ${m(Math.abs(s.cmic - s.categoryForecast))} ${s.cmic > s.categoryForecast ? "above" : "below"} the category model. ${billing}`;
}

export function categoryModelText(categoryRemaining: number): string {
  return `Uses actual cost by category plus only the unused portion of each category budget. This avoids adding the full budget again when actuals were posted to a different cost code. Remaining cost: ${moneyWhole.format(categoryRemaining)}.`;
}
