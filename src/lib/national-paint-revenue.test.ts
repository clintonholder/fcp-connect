import { describe, expect, it } from "vitest";
import {
  dashboardKpis,
  dashboardRows,
  distributedTotal,
  monthlyRevenue,
  pmRevenue,
  projectCountByPmStatus,
  revenueByPm,
  scheduledByMonth,
  validateMonthlyTargets,
  type RevenueProject,
} from "@/lib/national-paint-revenue";

const project = (over: Partial<RevenueProject> = {}): RevenueProject => ({
  pm_id: "pm1",
  status: "Scheduled",
  est_start: "2026-01-15",
  est_end: "2026-02-14",
  est_revenue: 31000,
  exclude_revenue: false,
  ...over,
});

describe("monthlyRevenue", () => {
  it("splits over calendar days across two months", () => {
    const m = monthlyRevenue(project(), 2026);
    expect(m[0]).toBeCloseTo(17000);
    expect(m[1]).toBeCloseTo(14000);
    expect(m.slice(2).every((v) => v === 0)).toBe(true);
    expect(distributedTotal(m)).toBeCloseTo(31000);
  });

  it("drops the share outside the year", () => {
    const p = project({ est_start: "2025-12-17", est_end: "2026-01-15", est_revenue: 30000 });
    const m26 = monthlyRevenue(p, 2026);
    expect(m26[0]).toBeCloseTo(15000);
    expect(distributedTotal(m26)).toBeCloseTo(15000);
    expect(monthlyRevenue(p, 2025)[11]).toBeCloseTo(15000);
  });

  it("puts a one-day project in its month", () => {
    const m = monthlyRevenue(project({ est_start: "2026-03-10", est_end: "2026-03-10" }), 2026);
    expect(m[2]).toBe(31000);
    expect(distributedTotal(m)).toBe(31000);
  });

  it("handles leap years", () => {
    const p = project({ est_start: "2028-02-01", est_end: "2028-02-29", est_revenue: 2900 });
    expect(monthlyRevenue(p, 2028)[1]).toBeCloseTo(2900);
  });

  it("gives zeros when the rule excludes the project", () => {
    for (const over of [
      { status: "Potential" as const },
      { exclude_revenue: true },
      { est_end: null },
      { est_start: null },
      { est_revenue: null },
    ]) {
      expect(monthlyRevenue(project(over), 2026)).toEqual(Array(12).fill(0));
    }
  });
});

describe("scheduledByMonth", () => {
  it("sums projects per month", () => {
    const s = scheduledByMonth([project(), project({ est_revenue: 3100 })], 2026);
    expect(s[0]).toBeCloseTo(18700);
    expect(s[1]).toBeCloseTo(15400);
  });
});

describe("dashboardRows", () => {
  const scheduled = [80, 120, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const targets = [
    { month: 1, amount: 100, reported_revenue: 90 },
    { month: 2, amount: 100, reported_revenue: null },
  ];
  const rows = dashboardRows(targets, scheduled);

  it("computes monthly rows", () => {
    expect(rows.months[0].actual).toBe(90);
    expect(rows.months[1].actual).toBe(120);
    expect(rows.months[0].variance).toBe(-10);
    expect(rows.months[1].variance).toBe(20);
    expect(rows.months[0].attainment).toBeCloseTo(0.9);
    expect(rows.months[1].attainment).toBeCloseTo(1.2);
    expect(rows.months[2].attainment).toBe(0);
    expect(rows.months[0].reported).toBe(90);
    expect(rows.months[1].reported).toBeNull();
  });

  it("computes YTD and totals", () => {
    expect(rows.months[1].ytdBudget).toBe(200);
    expect(rows.months[1].ytdVariance).toBe(10);
    expect(rows.months[1].ytdAttainment).toBeCloseTo(1.05);
    expect(rows.totals.budget).toBe(200);
    expect(rows.totals.actual).toBe(210);
    expect(rows.totals.variance).toBe(10);
    expect(rows.totals.attainment).toBeCloseTo(1.05);
    expect(dashboardKpis(rows)).toMatchObject({ revenue: 210, budget: 200, variance: 10 });
    expect(dashboardKpis(rows).attainment).toBeCloseTo(1.05);
  });

  it("counts a reported 0 as reported", () => {
    const r = dashboardRows([{ month: 1, amount: 100, reported_revenue: 0 }], scheduled);
    expect(r.months[0].actual).toBe(0);
  });
});

describe("pmRevenue", () => {
  const pms = [
    { id: "b", name: "bob" },
    { id: "a", name: "Alice" },
    { id: "c", name: "Idle" },
  ];
  const projects = [
    project({ pm_id: "b", status: "Completed" }),
    project({ pm_id: "a", status: "Upcoming" }),
    project({ pm_id: "a", status: "Potential" }),
    project({ pm_id: null }),
    project({ pm_id: "gone" }),
  ];
  const r = pmRevenue(projects, pms, 2026);

  it("orders PMs by name with No PM last and omits empty PMs", () => {
    expect(r.groups.map((g) => g.name)).toEqual(["Alice", "bob", "No PM"]);
  });

  it("orders statuses and keeps zero-value rows", () => {
    const alice = r.groups[0];
    expect(alice.statuses.map((s) => s.status)).toEqual(["Potential", "Upcoming"]);
    expect(alice.statuses[0].total).toBe(0);
    expect(r.groups[2].statuses).toHaveLength(1);
    expect(r.groups[2].total).toBeCloseTo(62000);
  });

  it("totals the groups", () => {
    expect(r.grand.total).toBeCloseTo(124000);
    expect(r.grand.months[0]).toBeCloseTo(17000 * 4);
  });
});

describe("chart helpers", () => {
  const pms = [
    { id: "b", name: "Bea" },
    { id: "a", name: "amy" },
    { id: "c", name: "Cal" },
  ];
  const projects = [
    project({ pm_id: "b", status: "In Progress" }),
    project({ pm_id: "b", status: "In Progress", exclude_revenue: true }),
    project({ pm_id: "a", status: "Completed" }),
    project({ pm_id: "c", status: "Potential", est_revenue: 500 }),
    project({ pm_id: null, status: "Scheduled" }),
  ];

  it("counts four statuses per PM", () => {
    const counts = projectCountByPmStatus(projects, pms);
    expect(counts.map((c) => c.name)).toEqual(["Bea"]);
    expect(counts[0]["In Progress"]).toBe(2);
  });

  it("sums full revenue over revenue statuses, skipping zero and no-PM", () => {
    const r = revenueByPm(projects, pms);
    expect(r.map((x) => [x.name, x.revenue])).toEqual([
      ["amy", 31000],
      ["Bea", 62000],
    ]);
  });
});

describe("validateMonthlyTargets", () => {
  const months = (n = 12) =>
    Array.from({ length: n }, (_, i) => ({ month: i + 1, amount: 10.456, reported_revenue: null }));

  it("cleans a valid input", () => {
    const v = validateMonthlyTargets({
      year: 2026,
      months: months().map((m) => (m.month === 2 ? { ...m, reported_revenue: "" } : m)),
    });
    expect(v.months[0].amount).toBe(10.46);
    expect(v.months[1].reported_revenue).toBeNull();
  });

  it("rejects bad input", () => {
    expect(() => validateMonthlyTargets({ year: 2026, months: months(11) })).toThrow();
    const dup = months();
    dup[11].month = 1;
    expect(() => validateMonthlyTargets({ year: 2026, months: dup })).toThrow();
    const neg = months();
    neg[0].amount = -1;
    expect(() => validateMonthlyTargets({ year: 2026, months: neg })).toThrow();
    const negRep = months();
    (negRep[0] as { reported_revenue: number | null }).reported_revenue = -5;
    expect(() => validateMonthlyTargets({ year: 2026, months: negRep })).toThrow();
    expect(() => validateMonthlyTargets({ year: 2026.5, months: months() })).toThrow();
  });
});
