import { NP_STATUSES, type NpStatus } from "@/lib/national-paint-import";
import { isoToDay } from "@/lib/national-paint-projects";

/**
 * National Paint revenue rules, ported from the workbook (Projects Jan..Dec columns, PM Revenue
 * pivot and Dashboard rows 23-32). Pure helpers: no DOM, network or Supabase.
 */

/** Whole-dollar en-US USD formatter for the revenue pages. */
export const moneyWhole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const DAY_MS = 86_400_000;
const MAX_AMOUNT = 1e12;

export const REVENUE_STATUSES: readonly NpStatus[] = [
  "Completed",
  "In Progress",
  "Scheduled",
  "Upcoming",
  "Verbal Award",
];

/** The statuses the "Project count by PM / status" chart stacks. */
export const COUNT_STATUSES = ["In Progress", "Scheduled", "Upcoming", "Verbal Award"] as const;

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export type RevenueProject = {
  pm_id: string | null;
  status: NpStatus;
  est_start: string | null;
  est_end: string | null;
  est_revenue: number | null;
  exclude_revenue: boolean;
};
type Pm = { id: string; name: string };

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const zeros = () => Array.from({ length: 12 }, () => 0);

/** Est Revenue spread over calendar days from Est Start to Est End inclusive, per month of `year`. */
export function monthlyRevenue(project: RevenueProject, year: number): number[] {
  const { est_start, est_end, est_revenue } = project;
  if (
    project.exclude_revenue ||
    !REVENUE_STATUSES.includes(project.status) ||
    est_start === null ||
    est_end === null ||
    est_revenue === null
  ) {
    return zeros();
  }
  const start = isoToDay(est_start);
  const end = isoToDay(est_end);
  const totalDays = Math.max(1, end - start + 1);
  return zeros().map((_, m) => {
    const monthStart = Date.UTC(year, m, 1) / DAY_MS;
    const monthEnd = Date.UTC(year, m + 1, 1) / DAY_MS - 1;
    const overlap = Math.max(0, Math.min(end, monthEnd) - Math.max(start, monthStart) + 1);
    return (est_revenue * overlap) / totalDays;
  });
}

export function distributedTotal(months: number[]): number {
  return sum(months);
}

/** The MTD Scheduled row: monthly revenue summed over all projects. */
export function scheduledByMonth(projects: RevenueProject[], year: number): number[] {
  const out = zeros();
  for (const p of projects) monthlyRevenue(p, year).forEach((v, m) => (out[m] += v));
  return out;
}

/* ------------------------------ PM Revenue ------------------------------ */

export type RevenueLine = { months: number[]; total: number };
export type PmStatusRow = RevenueLine & { status: NpStatus };
export type PmRevenueGroup = RevenueLine & {
  pmId: string | null;
  name: string;
  statuses: PmStatusRow[];
};
export type PmRevenue = { groups: PmRevenueGroup[]; grand: RevenueLine };

export const NO_PM = "No PM";

const byNameCI = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

/** The PM Revenue pivot: PM, then status, with Jan..Dec and Total; "No PM" sorts last. */
export function pmRevenue(projects: RevenueProject[], pms: Pm[], year: number): PmRevenue {
  const known = new Map(pms.map((p) => [p.id, p.name]));
  const buckets = new Map<string | null, RevenueProject[]>();
  for (const p of projects) {
    const key = p.pm_id !== null && known.has(p.pm_id) ? p.pm_id : null;
    buckets.set(key, [...(buckets.get(key) ?? []), p]);
  }
  const groups: PmRevenueGroup[] = [...buckets.entries()].map(([pmId, list]) => {
    const statuses: PmStatusRow[] = NP_STATUSES.filter((s) => list.some((p) => p.status === s)).map(
      (status) => {
        const months = scheduledByMonth(
          list.filter((p) => p.status === status),
          year,
        );
        return { status, months, total: sum(months) };
      },
    );
    const months = zeros().map((_, m) => sum(statuses.map((s) => s.months[m])));
    return {
      pmId,
      name: pmId === null ? NO_PM : (known.get(pmId) ?? NO_PM),
      statuses,
      months,
      total: sum(months),
    };
  });
  groups.sort((a, b) => (a.pmId === null ? 1 : b.pmId === null ? -1 : byNameCI(a.name, b.name)));
  const months = zeros().map((_, m) => sum(groups.map((g) => g.months[m])));
  return { groups, grand: { months, total: sum(months) } };
}

/* ------------------------------ Dashboard ------------------------------ */

export type TargetRow = { month: number; amount: number; reported_revenue: number | null };

export type DashboardMonth = {
  month: number;
  budget: number;
  scheduled: number;
  reported: number | null;
  actual: number;
  variance: number;
  attainment: number;
  ytdBudget: number;
  ytdScheduled: number;
  ytdActual: number;
  ytdVariance: number;
  ytdAttainment: number;
};
export type DashboardTotals = {
  budget: number;
  scheduled: number;
  actual: number;
  variance: number;
  attainment: number;
  ytdBudget: number;
  ytdScheduled: number;
  ytdActual: number;
  ytdVariance: number;
  ytdAttainment: number;
};
export type DashboardData = { months: DashboardMonth[]; totals: DashboardTotals };

/** Workbook Dashboard rows 24-32. Actual is Reported where entered, else Scheduled. */
export function dashboardRows(targets: TargetRow[], scheduled: number[]): DashboardData {
  let ytdBudget = 0;
  let ytdScheduled = 0;
  let ytdActual = 0;
  let ytdVariance = 0;
  const months = zeros().map((_, i): DashboardMonth => {
    const target = targets.find((t) => t.month === i + 1);
    const budget = target?.amount ?? 0;
    const reported = target?.reported_revenue ?? null;
    const sched = scheduled[i] ?? 0;
    const actual = reported ?? sched;
    const variance = actual - budget;
    ytdBudget += budget;
    ytdScheduled += sched;
    ytdActual += actual;
    ytdVariance += variance;
    return {
      month: i + 1,
      budget,
      scheduled: sched,
      reported,
      actual,
      variance,
      attainment: budget === 0 ? 0 : actual / budget,
      ytdBudget,
      ytdScheduled,
      ytdActual,
      ytdVariance,
      ytdAttainment: ytdBudget === 0 ? 0 : (ytdBudget + ytdVariance) / ytdBudget,
    };
  });
  const budget = sum(months.map((m) => m.budget));
  const variance = sum(months.map((m) => m.variance));
  const dec = months[11];
  return {
    months,
    totals: {
      budget,
      scheduled: sum(months.map((m) => m.scheduled)),
      actual: sum(months.map((m) => m.actual)),
      variance,
      attainment: budget === 0 ? 0 : (variance + budget) / budget,
      ytdBudget: dec.ytdBudget,
      ytdScheduled: dec.ytdScheduled,
      ytdActual: dec.ytdActual,
      ytdVariance: dec.ytdVariance,
      ytdAttainment: dec.ytdAttainment,
    },
  };
}

export function dashboardKpis(rows: DashboardData) {
  const dec = rows.months[11];
  return {
    revenue: rows.totals.actual,
    budget: rows.totals.budget,
    attainment: dec.ytdAttainment,
    variance: dec.ytdVariance,
  };
}

/* ------------------------------ Charts ------------------------------ */

export type PmCount = { pmId: string; name: string } & Record<
  (typeof COUNT_STATUSES)[number],
  number
>;

/** Project counts per PM for the four chart statuses; no year or exclude filter. */
export function projectCountByPmStatus(projects: RevenueProject[], pms: Pm[]): PmCount[] {
  return [...pms]
    .sort((a, b) => byNameCI(a.name, b.name))
    .map((pm) => {
      const mine = projects.filter((p) => p.pm_id === pm.id);
      const count = (s: (typeof COUNT_STATUSES)[number]) =>
        mine.filter((p) => p.status === s).length;
      return {
        pmId: pm.id,
        name: pm.name,
        "In Progress": count("In Progress"),
        Scheduled: count("Scheduled"),
        Upcoming: count("Upcoming"),
        "Verbal Award": count("Verbal Award"),
      };
    })
    .filter((r) => COUNT_STATUSES.some((s) => r[s] > 0));
}

/** Full Est Revenue per PM over the five revenue statuses; no exclude or year filter. */
export function revenueByPm(
  projects: RevenueProject[],
  pms: Pm[],
): { pmId: string; name: string; revenue: number }[] {
  return [...pms]
    .sort((a, b) => byNameCI(a.name, b.name))
    .map((pm) => ({
      pmId: pm.id,
      name: pm.name,
      revenue: sum(
        projects
          .filter((p) => p.pm_id === pm.id && REVENUE_STATUSES.includes(p.status))
          .map((p) => p.est_revenue ?? 0),
      ),
    }))
    .filter((r) => r.revenue !== 0);
}

/* ------------------------------ Validation ------------------------------ */

export type MonthlyTargetsInput = {
  year: number;
  months: { month: number; amount: number; reported_revenue: number | null }[];
};

const cents = (n: number) => Math.round(n * 100) / 100;

function amountOf(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    throw new Error(`${label} must be a number of 0 or more`);
  }
  if (v >= MAX_AMOUNT) throw new Error(`${label} is too large`);
  return cents(v);
}

/** Validates the monthly targets from the browser; blank reported becomes null. */
export function validateMonthlyTargets(input: {
  year: unknown;
  months: unknown;
}): MonthlyTargetsInput {
  const year = input?.year;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error("Year must be a whole number from 2000 to 2100");
  }
  const list = input.months;
  if (!Array.isArray(list) || list.length !== 12) throw new Error("Provide all 12 months");
  const seen = new Set<number>();
  const months = list.map(
    (raw: { month?: unknown; amount?: unknown; reported_revenue?: unknown }) => {
      const month = raw?.month;
      if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error("Each month must be a number from 1 to 12");
      }
      if (seen.has(month)) throw new Error("Each month can appear only once");
      seen.add(month);
      const name = MONTH_NAMES[month - 1];
      const blank = [null, undefined, ""].includes(raw.reported_revenue as null);
      return {
        month,
        amount: amountOf(raw.amount, `${name} budget`),
        reported_revenue: blank ? null : amountOf(raw.reported_revenue, `${name} reported`),
      };
    },
  );
  return { year, months: months.sort((a, b) => a.month - b.month) };
}
