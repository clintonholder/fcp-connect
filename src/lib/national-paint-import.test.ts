import { describe, expect, it } from "vitest";
import {
  buildImport,
  extractBudget,
  mapHeaders,
  normalizeHeader,
  normalizeStatus,
  parseBool,
  parseDate,
  parseMoney,
  parseProgress,
  PROJECT_ALIASES,
  stripCrewSuffix,
  type RawTable,
} from "./national-paint-import";

const table = (headers: string[], rows: Record<string, unknown>[], firstRow = 6): RawTable => ({
  headers,
  rows,
  firstRow,
});

describe("stripCrewSuffix", () => {
  it("removes an Excel duplicate suffix and trims", () => {
    expect(stripCrewSuffix("Test Crew A.1")).toBe("Test Crew A");
    expect(stripCrewSuffix("Test Crew A.12 ")).toBe("Test Crew A");
    expect(stripCrewSuffix("  Test Crew B ")).toBe("Test Crew B");
  });
  it("leaves dots that are not a trailing number", () => {
    expect(stripCrewSuffix("Crew 2.5 North")).toBe("Crew 2.5 North");
  });
});

describe("normalizeStatus", () => {
  it("matches case-insensitively with collapsed whitespace", () => {
    expect(normalizeStatus("in   progress")).toBe("In Progress");
    expect(normalizeStatus(" VERBAL AWARD ")).toBe("Verbal Award");
    expect(normalizeStatus("Completed")).toBe("Completed");
  });
  it("returns null for unknown and blank values", () => {
    expect(normalizeStatus("On hold")).toBeNull();
    expect(normalizeStatus("  ")).toBeNull();
    expect(normalizeStatus(null)).toBeNull();
  });
});

describe("parseDate", () => {
  it("converts Excel serial dates", () => {
    expect(parseDate(45000)).toEqual({ value: "2023-03-15", bad: false });
    expect(parseDate(45000.75)).toEqual({ value: "2023-03-15", bad: false });
  });
  it("converts ISO and M/D/YYYY strings", () => {
    expect(parseDate("2026-02-03")).toEqual({ value: "2026-02-03", bad: false });
    expect(parseDate("2/3/2026")).toEqual({ value: "2026-02-03", bad: false });
  });
  it("treats blanks as empty and anything else as bad", () => {
    expect(parseDate(null)).toEqual({ value: null, bad: false });
    expect(parseDate("")).toEqual({ value: null, bad: false });
    expect(parseDate("soon")).toEqual({ value: null, bad: true });
    expect(parseDate("2/31/2026")).toEqual({ value: null, bad: true });
    expect(parseDate(true)).toEqual({ value: null, bad: true });
  });
});

describe("parseMoney", () => {
  it("parses numbers and money strings", () => {
    expect(parseMoney(1250.5)).toEqual({ value: 1250.5, bad: false });
    expect(parseMoney("$12,500.00")).toEqual({ value: 12500, bad: false });
    expect(parseMoney("($1,000)")).toEqual({ value: -1000, bad: false });
  });
  it("handles blank and bad values", () => {
    expect(parseMoney("")).toEqual({ value: null, bad: false });
    expect(parseMoney("TBD")).toEqual({ value: null, bad: true });
  });
});

describe("parseProgress", () => {
  it("keeps fractions and divides percentages", () => {
    expect(parseProgress(0.25)).toEqual({ value: 0.25, bad: false });
    expect(parseProgress(40)).toEqual({ value: 0.4, bad: false });
    expect(parseProgress(1)).toEqual({ value: 1, bad: false });
  });
  it("reports out-of-range values", () => {
    expect(parseProgress(150)).toEqual({ value: null, bad: true });
    expect(parseProgress(-0.1)).toEqual({ value: null, bad: true });
    expect(parseProgress(null)).toEqual({ value: null, bad: false });
  });
});

describe("parseBool", () => {
  it("accepts the documented true values", () => {
    for (const v of [true, "TRUE", "Yes", "y", "X", "1", 1]) expect(parseBool(v)).toBe(true);
  });
  it("treats everything else as false", () => {
    for (const v of [false, "FALSE", "No", "N", "0", 0, "", null, "maybe"]) {
      expect(parseBool(v)).toBe(false);
    }
  });
});

describe("mapHeaders", () => {
  it("normalizes headers", () => {
    expect(normalizeHeader("CMiC Job #")).toBe("cmicjob");
  });
  it("maps aliases ignoring case, spaces and punctuation, and reports leftovers", () => {
    const m = mapHeaders(
      ["cmic job number", "PROJECT  NAME", "Est. Start", "Sample Extra", "Status"],
      PROJECT_ALIASES,
    );
    expect(m.fields.cmic_job_number).toBe("cmic job number");
    expect(m.fields.name).toBe("PROJECT  NAME");
    expect(m.fields.est_start).toBe("Est. Start");
    expect(m.unmappedColumns).toEqual(["Sample Extra"]);
    expect(m.missingFields).toContain("deadline");
    expect(m.missingFields).not.toContain("status");
  });
});

describe("extractBudget", () => {
  it("takes the first 12 numeric cells as January to December", () => {
    const cells = ["Budget", ...Array.from({ length: 13 }, (_, i) => (i + 1) * 100)];
    const b = extractBudget(cells)!;
    expect(b).toHaveLength(12);
    expect(b[0]).toEqual({ month: 1, amount: 100 });
    expect(b[11]).toEqual({ month: 12, amount: 1200 });
  });
  it("returns null with fewer than 12 numeric cells", () => {
    expect(extractBudget([1, 2, 3, "x"])).toBeNull();
    expect(extractBudget(null)).toBeNull();
  });
});

describe("buildImport", () => {
  const pms = table(
    ["PM Name", "Contact Code"],
    [{ "PM Name": "Test PM One", "Contact Code": "T1" }],
  );
  const crews = table(
    ["Contractor", "Crew Owner", "Crew Name", "Crew Type", "Size", "Note"],
    [
      {
        Contractor: "Test Contractor",
        "Crew Owner": "Owner A",
        "Crew Name": "Test Crew A",
        "Crew Type": "in-house",
        Size: 4,
      },
      { Contractor: "test contractor", "Crew Name": "test crew a.1" },
      {
        Contractor: "Test Contractor",
        "Crew Name": "Test Crew B",
        "Crew Type": "Bogus",
        Size: "x",
      },
      { Contractor: null, "Crew Name": null },
    ],
  );
  const projects = table(
    [
      "CMiC Job #",
      "Project Name",
      "PM",
      "Contractor",
      "Crew",
      "Status",
      "Progress",
      "Est Start",
      "Est End",
      "Est Revenue",
      "Exclude Revenue",
      "Bonus Eligible",
      "Extra",
    ],
    [
      {
        "CMiC Job #": "J-1",
        "Project Name": "Sample Project 1",
        PM: "Test PM One",
        Contractor: "Test Contractor",
        Crew: "Test Crew A.1",
        Status: "in progress",
        Progress: 50,
        "Est Start": 45000,
        "Est End": "3/20/2023",
        "Est Revenue": "$12,500.00",
        "Exclude Revenue": "Yes",
        "Bonus Eligible": null,
      },
      {
        "Project Name": "Sample Project 2",
        PM: "Test PM Two",
        Contractor: "Other Contractor",
        Status: "Scheduled",
        Progress: 300,
        "Est Start": "soon",
      },
      { "Project Name": "Sample Project 3", Status: "On hold" },
      { "Project Name": "Sample Project 4", Status: "" },
      { "Project Name": null, Status: "Completed" },
    ],
  );
  const cells = Array.from({ length: 12 }, (_, i) => (i + 1) * 1000);

  const { payload, report } = buildImport({ pms, crews, projects, budgetCells: cells }, 2026);

  it("builds PMs, adding any used only by projects", () => {
    expect(payload.pms.map((p) => p.name)).toEqual(["Test PM One", "Test PM Two"]);
    expect(report.pmsAddedFromProjects).toEqual(["Test PM Two"]);
  });

  it("builds contractors from crews and projects", () => {
    expect(payload.contractors.map((c) => c.name)).toEqual(["Test Contractor", "Other Contractor"]);
  });

  it("strips suffixes, reports duplicate crews and keeps the first", () => {
    expect(payload.crews.map((c) => c.name)).toEqual(["Test Crew A", "Test Crew B"]);
    expect(payload.crews[0]).toMatchObject({
      crew_type: "In-House",
      size: 4,
      owner_name: "Owner A",
    });
    expect(report.duplicateCrews).toEqual([
      { contractor: "Test Contractor", name: "Test Crew A", rows: [6, 7] },
    ]);
  });

  it("skips projects with blank or unknown status and ignores empty rows", () => {
    expect(payload.projects.map((p) => p.name)).toEqual(["Sample Project 1", "Sample Project 2"]);
    const skipped = report.problems.filter((p) => p.message.startsWith("Skipped"));
    expect(skipped.map((p) => p.row)).toEqual([8, 9]);
  });

  it("converts project values", () => {
    expect(payload.projects[0]).toMatchObject({
      cmic_job_number: "J-1",
      crew: "Test Crew A",
      status: "In Progress",
      progress: 0.5,
      est_start: "2023-03-15",
      est_end: "2023-03-20",
      est_revenue: 12500,
      exclude_revenue: true,
      bonus_eligible: false,
    });
    expect(payload.projects[1]).toMatchObject({ progress: null, est_start: null });
  });

  it("reports bad values and unmapped columns", () => {
    expect(report.problems.some((p) => p.row === 8 && /crew type/i.test(p.message))).toBe(true);
    expect(report.problems.some((p) => p.row === 8 && /Size/.test(p.message))).toBe(true);
    expect(report.problems.some((p) => p.row === 7 && /progress/.test(p.message))).toBe(true);
    expect(report.problems.some((p) => p.row === 7 && /est_start/.test(p.message))).toBe(true);
    expect(report.unmappedColumns).toContainEqual({ table: "PMs", columns: ["Contact Code"] });
    expect(report.unmappedColumns).toContainEqual({ table: "Projects", columns: ["Extra"] });
    expect(report.missingFields).toContainEqual({
      table: "Projects",
      fields: expect.arrayContaining(["deadline", "city"]),
    });
  });

  it("imports the budget for the chosen year, or none when short", () => {
    expect(payload.budget_year).toBe(2026);
    expect(payload.budget).toHaveLength(12);
    const short = buildImport({ pms, crews, projects, budgetCells: [1, 2] }, 2026);
    expect(short.payload.budget).toEqual([]);
    expect(short.report.problems.some((p) => p.table === "Dashboard")).toBe(true);
  });

  it("handles missing tables", () => {
    const empty = buildImport({ pms: null, crews: null, projects: null, budgetCells: null }, 2026);
    expect(empty.payload.projects).toEqual([]);
    expect(empty.payload.pms).toEqual([]);
  });
});
