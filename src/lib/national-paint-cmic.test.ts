import { describe, expect, it } from "vitest";
import {
  CMIC_LINE_FIELDS,
  CMIC_MAX_BUDGET_JOBS,
  CMIC_MAX_COST_LINES,
  CMIC_MAX_FILE_BYTES,
  CMIC_MAX_PAYLOAD_BYTES,
  CMIC_MAX_SUMMARY_JOBS,
  checkCmicFile,
  checkPayloadSize,
  findHeaderRow,
  parseCmicExport,
  payloadSize,
  type CmicBudgetJob,
  type CmicSummaryJob,
} from "@/lib/national-paint-cmic";

type Grid = Map<number, Map<number, unknown>>;

/** Builds a cell grid from row number to values starting at column A; null leaves a cell empty. */
function grid(rows: Record<number, unknown[]>): Grid {
  const g: Grid = new Map();
  for (const [r, values] of Object.entries(rows)) {
    const row = new Map<number, unknown>();
    values.forEach((v, i) => {
      if (v !== null && v !== undefined && v !== "") row.set(i + 1, v);
    });
    g.set(Number(r), row);
  }
  return g;
}

const BC_HEAD = [
  "Job",
  "Customer Name",
  "Contact Code",
  "Job Status (System)",
  "Estimated Start Date",
  "Estimated Completion Date",
  "Actual Start Date",
  "Actual Completion Date",
  "Awarded Contract Value",
  "Current Budgeted Revenue Amount",
  "Billed to Date",
  "Original Budget Amount",
  "Current Budget Amount",
  "Projected Total Costs",
  "Spent to Date",
  "Estimated Profit",
  "Profit %",
  "% Complete",
  "Bill %",
  "Billing Remaining",
  "Cost Remaining",
  "Earned Revenue",
  "Backlog",
];

const bcRow = (job: unknown, extra: Record<number, unknown> = {}) => {
  const r: unknown[] = new Array(BC_HEAD.length).fill(null);
  r[0] = job;
  r[1] = "Acme Stores";
  r[3] = "Started";
  for (const [i, v] of Object.entries(extra)) r[Number(i)] = v;
  return r;
};

const bcGrid = (headerRow: number, data: unknown[][]) => {
  const rows: Record<number, unknown[]> = { 1: ["Project Budget and Cost"] };
  for (let r = 4; r < headerRow; r++) rows[r] = [`Filter ${r}: `];
  rows[headerRow] = BC_HEAD;
  data.forEach((d, i) => (rows[headerRow + 1 + i] = d));
  return grid(rows);
};

const CS_HEAD = [
  "Company Code",
  "Company Name",
  "Job Code",
  "Job Name",
  "Job Start Date",
  "Job Status",
  "Division Code",
  "Division Name",
  "Cost Code",
  "Cost Code Name",
  "Category Code",
  "Category Name",
  "Original Budgeted Cost",
  "Change Order Amount",
  "Current Budgeted Cost",
  "Projected Cost",
  "Budgeted Revenue",
  "Budget Variance",
  "Committed to Date",
  "Committed Remaining",
  "Yet to Buy",
  "Spent to Date",
  "Billed to Date",
  "Spent Against Commitments",
  "Spent Outside of Commitments",
];

const csRow = (job: unknown, cost: unknown, cat: unknown, extra: Record<number, unknown> = {}) => {
  const r: unknown[] = new Array(CS_HEAD.length).fill(null);
  r[0] = "C1";
  r[2] = job;
  r[3] = `Name ${String(job)}`;
  r[6] = "01";
  r[8] = cost;
  r[10] = cat;
  for (const [i, v] of Object.entries(extra)) r[Number(i)] = v;
  return r;
};

const csGrid = (data: unknown[][], head: string[] = CS_HEAD) => {
  const rows: Record<number, unknown[]> = { 1: ["JC Cost Summaries"], 3: head };
  data.forEach((d, i) => (rows[4 + i] = d));
  return grid(rows);
};

describe("findHeaderRow", () => {
  it("finds the Budget & Cost header at row 11 below filter-label rows", () => {
    expect(findHeaderRow(bcGrid(11, [bcRow("99.0001 - Test")]), "budget_cost")).toBe(11);
  });

  it("still finds the header when it is shifted to another row", () => {
    expect(findHeaderRow(bcGrid(7, [bcRow("99.0001 - Test")]), "budget_cost")).toBe(7);
    expect(findHeaderRow(bcGrid(15, [bcRow("99.0001 - Test")]), "budget_cost")).toBe(15);
  });

  it("finds the Cost Summaries header at row 3 with row 2 missing", () => {
    const g = csGrid([csRow("99.0001", "01020", "L")]);
    expect(g.has(2)).toBe(false);
    expect(findHeaderRow(g, "cost_summaries")).toBe(3);
  });

  it("ignores filter-label rows such as Job:", () => {
    expect(findHeaderRow(grid({ 4: ["Job: "], 5: ["Job Status: "] }), "budget_cost")).toBeNull();
  });

  it("only looks in the first 30 rows", () => {
    expect(findHeaderRow(bcGrid(31, [bcRow("99.0001 - Test")]), "budget_cost")).toBeNull();
  });
});

describe("parseCmicExport budget_cost", () => {
  it("reads jobs, tolerating empty cells and missing rows", () => {
    const g = bcGrid(11, [bcRow("99.0001 - Test Store"), bcRow("99.0002 - Other")]);
    g.delete(13);
    const r = parseCmicExport(g, "budget_cost");
    expect(r.headerRow).toBe(11);
    expect(r.jobs).toBe(1);
    expect(r.part.jobs[0]).toMatchObject({
      job_code: "99.0001",
      job_name: "Test Store",
      customer_name: "Acme Stores",
      status: "Started",
      contact_code: null,
      backlog: null,
    });
  });

  it("skips and counts rows with a blank job, including the totals row", () => {
    const g = bcGrid(11, [
      bcRow("99.0001 - A"),
      bcRow(null, { 8: 500 }),
      bcRow("99.0002 - B"),
      [null, null, null, null, null, null, null, null, 1234],
    ]);
    const r = parseCmicExport(g, "budget_cost");
    expect(r.jobs).toBe(2);
    expect(r.rowsSkipped).toBe(2);
    expect(r.rowsRead).toBe(4);
  });

  it("parses serial and string dates", () => {
    const g = bcGrid(11, [bcRow("99.0001 - A", { 4: 45000, 5: "2026-03-05", 6: "3/7/2026" })]);
    const job = parseCmicExport(g, "budget_cost").part.jobs[0];
    expect(job).toMatchObject({
      est_start: "2023-03-15",
      est_end: "2026-03-05",
      actual_start: "2026-03-07",
    });
  });

  it("parses numeric, string and (12.00) amounts and keeps percentages as exported", () => {
    const g = bcGrid(11, [
      bcRow("99.0001 - A", { 8: 1500.5, 9: "$2,000.00", 10: "(12.00)", 16: 12.5 }),
    ]);
    expect(parseCmicExport(g, "budget_cost").part.jobs[0]).toMatchObject({
      awarded_contract_value: 1500.5,
      current_budgeted_revenue: 2000,
      billed_to_date: -12,
      profit_pct: 12.5,
    });
  });

  it("reports a bad number by row and column without the value", () => {
    const g = bcGrid(11, [bcRow("99.0001 - A", { 8: "SECRET-77x" })]);
    const r = parseCmicExport(g, "budget_cost");
    expect((r.part.jobs[0] as CmicBudgetJob).awarded_contract_value).toBeNull();
    expect(r.problems).toHaveLength(1);
    expect(r.problems[0]).toMatchObject({ row: 12, column: "Awarded Contract Value" });
    expect(JSON.stringify(r.problems)).not.toContain("SECRET");
  });

  it("reports a bad date without the value", () => {
    const g = bcGrid(11, [bcRow("99.0001 - A", { 4: "not-a-date-99" })]);
    const r = parseCmicExport(g, "budget_cost");
    expect(r.problems[0]).toMatchObject({ row: 12, column: "Estimated Start Date" });
    expect(JSON.stringify(r.problems)).not.toContain("not-a-date");
  });

  it("splits the job at the first ' - ' only", () => {
    const g = bcGrid(11, [bcRow("99.0001 - Store - Interior - Repaint"), bcRow("99.0002")]);
    const jobs = parseCmicExport(g, "budget_cost").part.jobs;
    expect(jobs[0]).toMatchObject({ job_code: "99.0001", job_name: "Store - Interior - Repaint" });
    expect(jobs[1]).toMatchObject({ job_code: "99.0002", job_name: null });
  });

  it("keeps the first of a duplicate job code and reports the row numbers", () => {
    const g = bcGrid(11, [
      bcRow("99.0001 - First"),
      bcRow("99.0002 - B"),
      bcRow("99.0001 - Second"),
    ]);
    const r = parseCmicExport(g, "budget_cost");
    expect(r.jobs).toBe(2);
    expect(r.part.jobs[0].job_name).toBe("First");
    expect(r.duplicates).toEqual([{ job_code: "99.0001", rows: [12, 14] }]);
  });

  it("accepts the singular and shorter header aliases and reports unknown columns", () => {
    const head = [
      "Job",
      "Customer Name",
      "Job Status (System)",
      "Current Budgeted Revenue",
      "Extra",
    ];
    const g = grid({ 2: head, 3: ["99.0001 - A", "Acme", "Started", 10, "x"] });
    const r = parseCmicExport(g, "budget_cost");
    expect((r.part.jobs[0] as CmicBudgetJob).current_budgeted_revenue).toBe(10);
    expect(r.unmappedColumns).toEqual(["Extra"]);
    expect(r.missingColumns).toContain("Backlog");
  });
});

describe("parseCmicExport cost_summaries", () => {
  it("keeps leading-zero codes as text", () => {
    const g = csGrid([csRow("A123456", "01020", "L")]);
    const line = (parseCmicExport(g, "cost_summaries").part.jobs[0] as CmicSummaryJob).lines[0];
    expect(line.slice(0, 6)).toEqual(["01", null, "01020", null, "L", null]);
  });

  it("groups lines by job in CMIC_LINE_FIELDS order, with job fields from the first line", () => {
    const g = csGrid([
      csRow("99.0001", "01020", "L", { 4: 45000, 5: "Started", 12: 100, 23: 7 }),
      csRow("99.0002", "02", "M"),
      csRow("99.0001", "01030", "M", { 3: "Later name", 12: 200, 24: 9 }),
    ]);
    const r = parseCmicExport(g, "cost_summaries");
    expect(r.jobs).toBe(2);
    expect(r.costLines).toBe(3);
    const [a] = r.part.jobs as CmicSummaryJob[];
    expect(a).toMatchObject({
      job_code: "99.0001",
      job_name: "Name 99.0001",
      status: "Started",
      job_start: "2023-03-15",
      company_code: "C1",
    });
    expect(a.lines).toHaveLength(2);
    expect(a.lines[0]).toHaveLength(CMIC_LINE_FIELDS.length);
    expect(a.lines[0][CMIC_LINE_FIELDS.indexOf("original_budgeted_cost")]).toBe(100);
    expect(a.lines[0][CMIC_LINE_FIELDS.indexOf("spent_against_commitments")]).toBe(7);
    expect(a.lines[1][CMIC_LINE_FIELDS.indexOf("original_budgeted_cost")]).toBe(200);
    expect(a.lines[1][CMIC_LINE_FIELDS.indexOf("spent_outside_commitments")]).toBe(9);
    expect(a.lines[1][2]).toBe("01030");
  });

  it("accepts the plural and singular commitment header aliases", () => {
    const singular = CS_HEAD.map((h) =>
      h === "Spent Against Commitments"
        ? "Spent Against Commitment"
        : h === "Spent Outside of Commitments"
          ? "Spent Outside of Commitment"
          : h,
    );
    for (const head of [CS_HEAD, singular]) {
      const g = csGrid([csRow("99.0001", "01", "L", { 23: 5, 24: 6 })], head);
      const r = parseCmicExport(g, "cost_summaries");
      expect(r.missingColumns).toEqual([]);
      const line = (r.part.jobs[0] as CmicSummaryJob).lines[0];
      expect(line.slice(-2)).toEqual([5, 6]);
    }
  });
});

describe("parseCmicExport errors", () => {
  it("names the other report when the wrong one is chosen, both ways", () => {
    const bc = bcGrid(11, [bcRow("99.0001 - A")]);
    const cs = csGrid([csRow("99.0001", "01", "L")]);
    expect(() => parseCmicExport(bc, "cost_summaries")).toThrow(
      "This is the Project Budget & Cost export. Choose it under Project Budget & Cost.",
    );
    expect(() => parseCmicExport(cs, "budget_cost")).toThrow(
      "This is the JC Cost Summaries export. Choose it under JC Cost Summaries.",
    );
  });

  it("fails when there is no header row", () => {
    expect(() => parseCmicExport(grid({ 1: ["Title"], 2: ["a", "b"] }), "budget_cost")).toThrow(
      "No header row with Job, Customer Name, Job Status (System) was found in the first 30 rows.",
    );
  });

  it("fails when there are no job rows", () => {
    expect(() => parseCmicExport(bcGrid(11, []), "budget_cost")).toThrow(
      "The export has no job rows.",
    );
    expect(() => parseCmicExport(bcGrid(11, [bcRow(null)]), "budget_cost")).toThrow(
      "The export has no job rows.",
    );
  });
});

describe("file checks and caps", () => {
  it("requires an .xlsx name, case-insensitively", () => {
    const msg = "Choose the .xlsx file exported from CMiC (Table Visual Export).";
    expect(() => checkCmicFile({ name: "report.csv", size: 10 })).toThrow(msg);
    expect(() => checkCmicFile({ name: "report.xlsx.zip", size: 10 })).toThrow(msg);
    expect(() => checkCmicFile({ name: "REPORT.XLSX", size: 10 })).not.toThrow();
  });

  it("rejects files over 20 MB", () => {
    expect(() => checkCmicFile({ name: "a.xlsx", size: CMIC_MAX_FILE_BYTES })).not.toThrow();
    expect(() => checkCmicFile({ name: "a.xlsx", size: CMIC_MAX_FILE_BYTES + 1 })).toThrow(
      "This file is larger than 20 MB.",
    );
  });

  it("caps Budget & Cost jobs", () => {
    const ok = Array.from({ length: CMIC_MAX_BUDGET_JOBS }, (_, i) => bcRow(`J${i} - A`));
    expect(parseCmicExport(bcGrid(11, ok), "budget_cost").jobs).toBe(CMIC_MAX_BUDGET_JOBS);
    expect(() => parseCmicExport(bcGrid(11, [...ok, bcRow("Jx - A")]), "budget_cost")).toThrow(
      "This export has more than 2,000 jobs.",
    );
  });

  it("caps Cost Summaries jobs", () => {
    const rows = Array.from({ length: CMIC_MAX_SUMMARY_JOBS + 1 }, (_, i) =>
      csRow(`J${i}`, "01", "L"),
    );
    expect(() => parseCmicExport(csGrid(rows), "cost_summaries")).toThrow(
      "This export has more than 3,000 jobs.",
    );
  });

  it("caps cost lines", () => {
    const rows = Array.from({ length: CMIC_MAX_COST_LINES + 1 }, (_, i) =>
      csRow(`J${i % 100}`, String(i), "L"),
    );
    expect(() => parseCmicExport(csGrid(rows), "cost_summaries")).toThrow(
      "This export has more than 30,000 cost lines.",
    );
  });

  it("caps the payload size", () => {
    const small = { jobs: [{ job_code: "a" }] };
    expect(payloadSize(small)).toBe(JSON.stringify(small).length);
    expect(() => checkPayloadSize(small)).not.toThrow();
    expect(() => checkPayloadSize({ text: "x".repeat(CMIC_MAX_PAYLOAD_BYTES) })).toThrow(
      "This upload is larger than 6 MB.",
    );
  });
});
