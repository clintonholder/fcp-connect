import { describe, expect, it } from "vitest";
import {
  categoryModel,
  categoryModelText,
  causeTests,
  cmicSourceText,
  costBridge,
  costCodeDetail,
  filterFinanceRows,
  financeRows,
  financeTotals,
  forecastComparison,
  headerBanner,
  isStale,
  isTotalJob,
  jobFinance,
  jobLabel,
  jobPm,
  pmOptions,
  primaryCostPressure,
  scheduleChip,
  scheduleMatch,
  sortFinanceRows,
  summaryText,
  type CostLine,
  type FinanceJob,
  type FinanceRow,
} from "@/lib/national-paint-finance";

const TODAY = "2026-06-15";

function job(over: Partial<FinanceJob> = {}): FinanceJob {
  return {
    job_code: "J-100",
    job_name: "Test Job",
    contact_code: null,
    status: "Started",
    est_end: "2026-06-25",
    actual_end: null,
    awarded_contract_value: 100000,
    current_budgeted_revenue: 100000,
    billed_to_date: 50000,
    original_budget: 60000,
    current_budget: 60000,
    projected_total_costs: 60000,
    spent_to_date: 30000,
    profit_pct: 40,
    cost_remaining: 30000,
    earned_revenue: 50000,
    backlog: 50000,
    ...over,
  };
}

describe("jobFinance", () => {
  it("worked RED example", () => {
    const f = jobFinance(
      job({
        awarded_contract_value: 90000,
        original_budget: 60000,
        current_budget: 70000,
        projected_total_costs: 75000,
        spent_to_date: 50000,
        cost_remaining: 30000,
        earned_revenue: 70000,
        billed_to_date: 60000,
      }),
      TODAY,
    )!;
    expect(f.riskAdjustedCost).toBe(80000);
    expect(f.forecastProfit).toBe(20000);
    expect(f.forecastMargin).toBeCloseTo(0.2, 10);
    expect(f.commitmentGap).toBe(5000);
    expect(f.revenueCoVsCostCo).toBe(0);
    expect(f.costOverrun).toBe(10000);
    expect(f.unbudgetedSpend).toBe(0);
    expect(f.billingGap).toBe(10000);
    expect(f.stale).toBe(false);
    expect(f.overallStatus).toBe("RED");
    expect(f.riskExplanation).toBe(
      "Commitments exceed forecast by $5,000; Risk-adjusted cost exceeds budget by $10,000; Earned revenue exceeds billing by $10,000",
    );
    expect(f.riskScore).toBe(28.2);
    expect(f.profitPctUsed).toBe(0.4);
  });

  it("GREEN, and with the award blank", () => {
    const f = jobFinance(job(), TODAY)!;
    expect(f.overallStatus).toBe("GREEN");
    expect(f.riskExplanation).toBe("No material exception");
    expect(f.riskScore).toBe(1);
    const g = jobFinance(job({ awarded_contract_value: null }), TODAY)!;
    expect(g.revenueCoVsCostCo).toBeNull();
    expect(g.overallStatus).toBe("GREEN");
    expect(g.riskExplanation).toBe("Awarded contract value missing — CO mismatch not evaluated");
  });

  it("baseline notes", () => {
    expect(jobFinance(job({ original_budget: null }), TODAY)!.riskExplanation).toBe(
      "Original cost budget missing — CO mismatch not evaluated",
    );
    expect(
      jobFinance(job({ original_budget: null, awarded_contract_value: 0 }), TODAY)!.riskExplanation,
    ).toBe("Awarded contract value and original cost budget missing — CO mismatch not evaluated");
    expect(jobFinance(job({ profit_pct: null }), TODAY)!.profitPctUsed).toBeNull();
  });

  it("margin below 20% is RED", () => {
    const f = jobFinance(
      job({ projected_total_costs: 80010, current_budget: 80010, original_budget: 80010 }),
      TODAY,
    )!;
    expect(f.overallStatus).toBe("RED");
    expect(f.riskExplanation).toContain("Forecast margin 20.0% is below 20%");
  });

  it("CO mismatch of -500 is RED", () => {
    const f = jobFinance(job({ current_budgeted_revenue: 99500 }), TODAY)!;
    expect(f.revenueCoVsCostCo).toBe(-500);
    expect(f.overallStatus).toBe("RED");
    expect(f.riskExplanation).toBe("Revenue/cost CO mismatch -$500");
    const g = jobFinance(job({ current_budgeted_revenue: 100500 }), TODAY)!;
    expect(g.riskExplanation).toBe("Revenue/cost CO mismatch +$500");
  });

  it("revenue 0 gives margin 0 and RED", () => {
    const f = jobFinance(job({ current_budgeted_revenue: 0, awarded_contract_value: 0 }), TODAY)!;
    expect(f.forecastMargin).toBe(0);
    expect(f.overallStatus).toBe("RED");
  });

  it("stale on an otherwise clean job is YELLOW", () => {
    const f = jobFinance(job({ status: "Pending", est_end: "2026-05-15" }), TODAY)!;
    expect(f.stale).toBe(true);
    expect(f.overallStatus).toBe("YELLOW");
    expect(f.riskExplanation).toBe("Forecast is stale or incomplete");
  });

  it("stale thresholds", () => {
    expect(isStale(job({ est_end: "2026-05-16" }), TODAY)).toBe(false);
    expect(isStale(job({ est_end: "2026-05-15" }), TODAY)).toBe(true);
    expect(isStale(job({ est_end: null }), TODAY)).toBe(true);
    expect(isStale(job({ projected_total_costs: null }), TODAY)).toBe(true);
    expect(isStale(job({ est_end: null, actual_end: "2026-01-01" }), TODAY)).toBe(false);
    expect(isStale(job({ status: "Closed", est_end: null }), TODAY)).toBe(false);
  });

  it("YELLOW for unbudgeted spend", () => {
    const f = jobFinance(job({ current_budget: 25000, original_budget: 25000 }), TODAY)!;
    expect(f.unbudgetedSpend).toBe(5000);
    expect(f.costOverrun).toBe(35000);
  });

  it("TOTAL rows give null", () => {
    expect(jobFinance(job({ job_name: "Grand Total" }), TODAY)).toBeNull();
    expect(isTotalJob(job({ job_code: "total" }))).toBe(true);
    expect(isTotalJob(job())).toBe(false);
  });

  it("lists all eight items in order and caps the score at 100", () => {
    const f = jobFinance(
      job({
        status: "Started",
        est_end: null,
        awarded_contract_value: null,
        original_budget: null,
        current_budgeted_revenue: 1000000,
        current_budget: 100000,
        projected_total_costs: 1000000,
        spent_to_date: 900000,
        cost_remaining: 500000,
        earned_revenue: 600000,
        billed_to_date: 0,
      }),
      TODAY,
    )!;
    expect(f.riskExplanation).toBe(
      [
        "Awarded contract value and original cost budget missing — CO mismatch not evaluated",
        "Forecast margin -40.0% is below 20%",
        "Commitments exceed forecast by $400,000",
        "Risk-adjusted cost exceeds budget by $1,300,000",
        "Spend exceeds budget by $800,000",
        "Earned revenue exceeds billing by $600,000",
        "Forecast is stale or incomplete",
      ].join("; "),
    );
    expect(f.riskScore).toBe(100);
  });

  it("includes the CO item between commitments and overrun", () => {
    const f = jobFinance(
      job({
        current_budgeted_revenue: 90000,
        projected_total_costs: 50000,
        spent_to_date: 40000,
        cost_remaining: 30000,
        current_budget: 50000,
        original_budget: 50000,
      }),
      TODAY,
    )!;
    const parts = f.riskExplanation.split("; ");
    expect(parts[0]).toMatch(/^Commitments/);
    expect(parts[1]).toMatch(/^Revenue\/cost CO mismatch/);
    expect(parts[2]).toMatch(/^Risk-adjusted cost/);
  });
});

describe("labels, pm and schedule match", () => {
  it("jobLabel", () => {
    expect(jobLabel(job())).toBe("J-100 - Test Job");
    expect(jobLabel(job({ job_name: " " }))).toBe("J-100");
  });

  const pms = [
    { id: "a", name: "Zed" },
    { id: "b", name: "Amy" },
  ];
  const projects = [
    { pm_id: "a", cmic_job_number: "j-100" },
    { pm_id: "b", cmic_job_number: " J-100 " },
    { pm_id: "a", cmic_job_number: "J-100" },
    { pm_id: null, cmic_job_number: "J-200" },
  ];

  it("scheduleMatch is case-insensitive and trimmed", () => {
    expect(scheduleMatch(" J-100", projects)).toBe("Found");
    expect(scheduleMatch("J-300", projects)).toBe("Missing");
    expect(scheduleMatch("", projects)).toBe("Missing");
  });

  it("jobPm", () => {
    expect(jobPm("J-100", "XX", projects.slice(0, 1), pms)).toBe("Zed");
    expect(jobPm("J-100", "XX", projects, pms)).toBe("Amy, Zed");
    expect(jobPm("J-300", "XX", projects, pms)).toBe("XX");
    expect(jobPm("J-200", "XX", projects, pms)).toBe("XX");
    expect(jobPm("J-300", null, projects, pms)).toBeNull();
    expect(jobPm("J-300", "  ", projects, pms)).toBeNull();
  });
});

function row(over: Partial<FinanceRow>): FinanceRow {
  return {
    jobCode: "A",
    label: "A",
    pm: "Amy",
    systemStatus: "Started",
    scheduleMatch: "Found",
    currentRevenue: 100,
    currentBudget: 50,
    projectedCost: 50,
    spentToDate: 20,
    billedToDate: 10,
    earnedRevenue: 10,
    backlog: 90,
    riskAdjustedCost: 50,
    forecastProfit: 50,
    forecastMargin: 0.5,
    commitmentGap: 0,
    revenueCoVsCostCo: null,
    costOverrun: 0,
    unbudgetedSpend: 0,
    billingGap: 0,
    overallStatus: "GREEN",
    riskScore: 1,
    riskExplanation: "No material exception",
    ...over,
  };
}

describe("finance table helpers", () => {
  const rows = [
    row({ label: "B", riskScore: 5, revenueCoVsCostCo: null, pm: null, overallStatus: "RED" }),
    row({ label: "A", riskScore: 5, revenueCoVsCostCo: 3, overallStatus: "YELLOW" }),
    row({ label: "C", riskScore: 9, revenueCoVsCostCo: -2, pm: "Zed" }),
  ];

  it("sorts with blanks last both ways and ties by label", () => {
    expect(sortFinanceRows(rows, "riskScore", "desc").map((r) => r.label)).toEqual(["C", "A", "B"]);
    expect(sortFinanceRows(rows, "riskScore", "asc").map((r) => r.label)).toEqual(["A", "B", "C"]);
    expect(sortFinanceRows(rows, "revenueCoVsCostCo", "asc").map((r) => r.label)).toEqual([
      "C",
      "A",
      "B",
    ]);
    expect(sortFinanceRows(rows, "revenueCoVsCostCo", "desc").map((r) => r.label)).toEqual([
      "A",
      "C",
      "B",
    ]);
    expect(sortFinanceRows(rows, "pm", "asc").map((r) => r.label)).toEqual(["A", "C", "B"]);
    expect(sortFinanceRows(rows, "overallStatus", "desc").map((r) => r.label)).toEqual([
      "B",
      "A",
      "C",
    ]);
  });

  it("filters by status and PM", () => {
    expect(filterFinanceRows(rows, { status: "all", pm: "all" })).toHaveLength(3);
    expect(filterFinanceRows(rows, { status: "RED", pm: "all" }).map((r) => r.label)).toEqual([
      "B",
    ]);
    expect(filterFinanceRows(rows, { status: "all", pm: "No PM" }).map((r) => r.label)).toEqual([
      "B",
    ]);
    expect(filterFinanceRows(rows, { status: "all", pm: "Zed" }).map((r) => r.label)).toEqual([
      "C",
    ]);
    expect(pmOptions(rows)).toEqual(["Amy", "No PM", "Zed"]);
  });

  it("totals", () => {
    const t = financeTotals(rows);
    expect(t.count).toBe(3);
    expect(t.currentRevenue).toBe(300);
    expect(t.forecastProfit).toBe(150);
    expect(t.forecastMargin).toBe(0.5);
    expect(t.revenueCoVsCostCo).toBe(1);
    expect(financeTotals([row({ currentRevenue: 0 })]).forecastMargin).toBeNull();
    expect(financeTotals([]).forecastMargin).toBeNull();
  });

  it("financeRows skips TOTAL rows and fills PM", () => {
    const out = financeRows(
      [job(), job({ job_code: "T", job_name: "Total" })],
      [{ pm_id: "a", cmic_job_number: "J-100" }],
      [{ id: "a", name: "Amy" }],
      TODAY,
    );
    expect(out).toHaveLength(1);
    expect(out[0].pm).toBe("Amy");
    expect(out[0].scheduleMatch).toBe("Found");
  });
});

function line(over: Partial<CostLine>): CostLine {
  return {
    cost_code: null,
    cost_code_name: null,
    category_name: null,
    original_budgeted_cost: 0,
    current_budgeted_cost: 0,
    projected_cost: 0,
    spent_to_date: 0,
    committed_to_date: 0,
    committed_remaining: 0,
    spent_outside_commitments: 0,
    ...over,
  };
}

const LINES: CostLine[] = [
  line({
    cost_code: "A",
    category_name: "Labor",
    current_budgeted_cost: 10000,
    spent_to_date: 12000,
  }),
  line({
    cost_code: "B",
    category_name: "Labor",
    current_budgeted_cost: 5000,
    spent_to_date: 0,
    projected_cost: 5000,
  }),
  line({
    cost_code: "C",
    category_name: "Material",
    current_budgeted_cost: 4000,
    spent_to_date: 6000,
  }),
  line({ cost_code: "D", category_name: "Material", current_budgeted_cost: 0, spent_to_date: 500 }),
  line({ cost_code: "E", category_name: "Equipment Rental", spent_to_date: 300 }),
  line({ cost_code: "F", category_name: null, spent_to_date: 9999 }),
];

describe("categoryModel and costCodeDetail", () => {
  const model = categoryModel(LINES, 100000);

  it("categories", () => {
    expect(model.rows.map((r) => r.name)).toEqual(["Equipment Rental", "Labor", "Material"]);
    expect(model.rows.map((r) => r.forecast)).toEqual([300, 15000, 6500]);
    expect(model.rows.map((r) => r.over)).toEqual([300, 0, 2500]);
    expect(model.totals.actual).toBe(18800);
    expect(model.totals.forecast).toBe(21800);
    expect(model.rows[2].marginImpact).toBeCloseTo(0.025, 10);
    expect(model.rows[2].share).toBeCloseTo(6500 / 18800, 10);
  });

  it("empty lines and zero revenue", () => {
    const m = categoryModel([], 0);
    expect(m.rows).toEqual([]);
    expect(m.totals.forecast).toBe(0);
    expect(categoryModel(LINES, 0).rows[2].marginImpact).toBe(0);
  });

  it("cost code rows and flags", () => {
    const rows = costCodeDetail(LINES);
    expect(rows.map((r) => r.costCode)).toEqual(["A", "B", "C", "D", "E"]);
    const by = Object.fromEntries(rows.map((r) => [r.costCode, r]));
    expect(by.A.allocatedRemaining).toBe(2000);
    expect(by.A.selectedForecast).toBe(14000);
    expect(by.A.driverFlag).toBe("OVER BUDGET");
    expect(by.B.allocatedRemaining).toBe(1000);
    expect(by.B.selectedForecast).toBe(1000);
    expect(by.B.driverFlag).toBe("SOURCE FCST > MODEL");
    expect(by.C.driverFlag).toBe("OVER BUDGET");
    expect(by.D.driverFlag).toBe("COST CODE MISMATCH");
    expect(by.E.driverFlag).toBe("UNBUDGETED");
    for (const cat of model.rows) {
      const sum = rows
        .filter((r) => r.category === cat.name)
        .reduce((t, r) => t + r.selectedForecast, 0);
      expect(sum).toBe(cat.forecast);
    }
  });

  it("OK flag", () => {
    const rows = costCodeDetail([
      line({
        cost_code: "X",
        category_name: "Labor",
        current_budgeted_cost: 100,
        spent_to_date: 40,
        projected_cost: 100,
      }),
    ]);
    expect(rows[0].driverFlag).toBe("OK");
    expect(rows[0].selectedForecast).toBe(100);
  });
});

describe("causeTests and primaryCostPressure", () => {
  const model = categoryModel(LINES, 100000);

  it("signals", () => {
    const t = causeTests(model, 100000, 18800);
    expect(t[0].amount).toBe(0);
    expect(t[0].text).toBe("No labor-related overrun under the selected model.");
    expect(t[1].amount).toBe(2500);
    expect(t[1].marginImpact).toBeCloseTo(0.025, 10);
    expect(t[1].text).toBe("Material spend is above budget and reduces forecast margin by 2.5%.");
    expect(t[2].amount).toBe(0);
    expect(t[2].text).toBe("Travel and fuel remain within budget.");
    expect(t[3].amount).toBe(300);
    expect(t[3].text).toBe(
      "Equipment reduces forecast margin by 0.3%; review rental duration and utilization.",
    );
    expect(t[4].amount).toBe(2800);
    expect(t[4].text).toBe(
      "Category overruns explain 2.8% of margin erosion versus current budget.",
    );
    expect(t[5].text.startsWith("PASS")).toBe(true);
    expect(causeTests(model, 100000, 18000)[5].text.startsWith("REVIEW")).toBe(true);
  });

  it("pressure", () => {
    expect(primaryCostPressure(model, 100000)).toBe(
      "Primary cost pressure: Material $2,500; next: Equipment Rental $300. Together they reduce margin by 2.8%.",
    );
    expect(primaryCostPressure(categoryModel([], 0), 0)).toBe("No category overrun identified.");
    const one = categoryModel([LINES[2]], 100000);
    expect(primaryCostPressure(one, 100000)).toBe(
      "Primary cost pressure: Material $2,000. Together they reduce margin by 2.0%.",
    );
  });
});

describe("schedule chip and banner", () => {
  it("chips", () => {
    expect(scheduleChip({ status: " closed", actual_end: null, est_end: null }, TODAY)).toEqual({
      label: "CLOSED",
      tone: "neutral",
    });
    expect(scheduleChip({ status: "Started", actual_end: null, est_end: null }, TODAY).label).toBe(
      "NO DATE",
    );
    expect(
      scheduleChip({ status: "Started", actual_end: null, est_end: "2026-06-15" }, TODAY).label,
    ).toBe("ON TRACK");
    expect(
      scheduleChip({ status: "Started", actual_end: null, est_end: "2026-08-01" }, TODAY).label,
    ).toBe("ON TRACK");
    expect(
      scheduleChip({ status: "Started", actual_end: null, est_end: "2026-05-01" }, TODAY),
    ).toEqual({ label: "45 DAYS PAST", tone: "yellow" });
    const tone = (end: string) =>
      scheduleChip({ status: "Started", actual_end: end, est_end: null }, TODAY).tone;
    expect(tone("2026-06-10")).toBe("neutral");
    expect(tone("2026-04-16")).toBe("orange");
    expect(tone("2026-03-01")).toBe("red");
  });

  it("banner", () => {
    const f = jobFinance(job(), TODAY)!;
    expect(headerBanner(f, 0.22, 100000).lines[1]).toBe("MARGIN: YELLOW 22.0%");
    expect(headerBanner(f, 0.19, 100000).marginLevel).toBe("RED");
    expect(headerBanner(f, 0.25, 100000).marginLevel).toBe("GREEN");
    expect(headerBanner(f, 0.5, 100000).lines[0]).toBe("OVERALL: GREEN | EXPOSURE 1");
    expect(headerBanner(f, 0.5, 100000).lines[2]).toBe("BILLING: OK $0");
    const red = { ...f, billingGap: 30000 };
    expect(headerBanner(red, 0.5, 100000).lines[2]).toBe("BILLING: RED $30,000");
    expect(headerBanner({ ...f, billingGap: 10000 }, 0.5, 100000).lines[2]).toBe(
      "BILLING: YELLOW $10,000",
    );
    expect(headerBanner({ ...f, billingGap: 10000 }, 0.5, 0).billingLevel).toBe("YELLOW");
  });
});

describe("analysis text", () => {
  it("cost bridge", () => {
    const b = costBridge(60000, 70000, 80000, 85000, 90000);
    expect(b.map((r) => r.amount)).toEqual([60000, 70000, 80000, 85000, 90000]);
    expect(b[0].vsCurrent).toBe(-10000);
    expect(b[1].text).toBe("Current budget changed by $10,000 from original.");
    expect(b[2].text).toBe("Spend is already $10,000 over current budget.");
    expect(b[4].text).toBe(
      "CMiC expects final cost to be $20,000 over the current budget and $5,000 above the category forecast.",
    );
    const c = costBridge(70000, 70000, 50000, 70000, 60000);
    expect(c[1].text).toBe("No approved budget change.");
    expect(c[2].text).toBe("Spend remains $20,000 below current budget.");
    expect(c[4].text).toContain("$10,000 under the current budget and $10,000 below");
  });

  it("forecast comparison", () => {
    const r = forecastComparison(85000, 90000, 80000, 100000);
    expect(r[0]).toMatchObject({ category: 85000, cmic: 90000, difference: 5000 });
    expect(r[1]).toMatchObject({ category: 5000, cmic: 10000 });
    expect(r[2]).toMatchObject({ category: 15000, cmic: 10000, difference: -5000 });
    expect(r[3].percent).toBe(true);
    expect(r[3].category).toBeCloseTo(0.15, 10);
    expect(forecastComparison(1, 1, 5, 0)[3]).toMatchObject({ category: 0, cmic: 0 });
    expect(forecastComparison(1, 1, 5, 0)[1]).toMatchObject({ category: 0, cmic: 0 });
  });

  const base = {
    original: 60000,
    current: 70000,
    actual: 80000,
    categoryRemaining: 5000,
    categoryForecast: 85000,
    categoryProfit: 15000,
    categoryMargin: 0.15,
    cmic: 90000,
    billingGap: 10000,
    revenue: 100000,
  };

  it("summary", () => {
    expect(summaryText(base)).toBe(
      "The job began with a $60,000 cost budget and is currently budgeted at $70,000. Actual cost is $80,000, or $10,000 over budget. The category model expects $5,000 of remaining cost and a final cost of $85,000, producing $15,000 profit and 15.0% margin. CMiC projects $90,000, which is $5,000 above the category model. Earned revenue is $10,000 ahead of billing (10% of revenue), which drives the high exposure score.",
    );
    const t = summaryText({ ...base, actual: 60000, cmic: 80000, billingGap: 0 });
    expect(t).toContain("$10,000 under budget");
    expect(t).toContain("$5,000 below the category model. Billing and earned revenue are aligned.");
  });

  it("source and category model text", () => {
    expect(cmicSourceText(70000, 70000, 70000)).toBe(
      "CMiC projects final cost of $70,000, which is $0 over current budget and $0 below the category model.",
    );
    expect(categoryModelText(5000)).toContain("Remaining cost: $5,000.");
  });
});
