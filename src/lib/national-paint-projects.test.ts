import { describe, expect, it } from "vitest";
import {
  computePace,
  contractorOptions,
  crewOptions,
  filterProjects,
  formatPercent,
  progressFromInput,
  progressToInput,
  sortProjects,
  todayIso,
  validateProject,
  type ProjectInput,
} from "@/lib/national-paint-projects";

const base: ProjectInput = {
  name: "Alpha",
  cmic_job_number: null,
  address: null,
  city: null,
  state: null,
  pm_id: null,
  contractor_id: null,
  crew_id: null,
  status: "Potential",
  progress: null,
  est_start: null,
  est_end: null,
  deadline: null,
  est_revenue: null,
  notes: null,
  tag: null,
  exclude_revenue: false,
  bonus_eligible: false,
};
const row = (o: Partial<ProjectInput>): ProjectInput => ({ ...base, ...o });

describe("computePace", () => {
  it("is blank when a date is missing", () => {
    expect(computePace(null, "2026-01-11", "2026-01-06")).toBeNull();
    expect(computePace("2026-01-01", null, "2026-01-06")).toBeNull();
  });
  it("is blank on or before Est Start", () => {
    expect(computePace("2026-01-05", "2026-01-15", "2026-01-05")).toBeNull();
    expect(computePace("2026-01-05", "2026-01-15", "2026-01-01")).toBeNull();
  });
  it("is the elapsed share mid-way", () => {
    expect(computePace("2026-01-01", "2026-01-11", "2026-01-06")).toBe(0.5);
  });
  it("is 1 after Est End", () => {
    expect(computePace("2026-01-01", "2026-01-11", "2026-03-01")).toBe(1);
  });
  it("uses a minimum span of one day", () => {
    expect(computePace("2026-01-01", "2026-01-01", "2026-01-02")).toBe(1);
  });
  it("is not thrown off by daylight saving changes", () => {
    expect(computePace("2026-03-01", "2026-03-11", "2026-03-06")).toBe(0.5);
  });
});

describe("todayIso and formatPercent", () => {
  it("formats the local date", () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("formats percents", () => {
    expect(formatPercent(null)).toBe("");
    expect(formatPercent(0.45)).toBe("45%");
    expect(formatPercent(1)).toBe("100%");
  });
});

describe("progress input", () => {
  it("parses percents", () => {
    expect(progressFromInput("45")).toBe(0.45);
    expect(progressFromInput("100")).toBe(1);
    expect(progressFromInput("")).toBeNull();
    expect(progressToInput(0.45)).toBe("45");
    expect(progressToInput(null)).toBe("");
  });
  it("rejects bad values", () => {
    expect(() => progressFromInput("101")).toThrow();
    expect(() => progressFromInput("-1")).toThrow();
    expect(() => progressFromInput("abc")).toThrow();
  });
});

describe("dropdown options", () => {
  const contractors = [
    { id: "c1", name: "Zeta" },
    { id: "c2", name: "alpha" },
    { id: "c3", name: "Empty" },
  ];
  const crews = [
    { id: "k1", name: "B crew", contractor_id: "c1" },
    { id: "k2", name: "A crew", contractor_id: "c1", is_active: false },
    { id: "k3", name: "Other", contractor_id: "c2" },
  ];
  it("offers only contractors with crews, keeping the current one", () => {
    expect(contractorOptions(contractors, crews).map((c) => c.id)).toEqual(["c2", "c1"]);
    expect(contractorOptions(contractors, crews, "c3").map((c) => c.id)).toEqual([
      "c2",
      "c3",
      "c1",
    ]);
  });
  it("offers only the selected contractor's crews", () => {
    expect(crewOptions(crews, "c1").map((c) => c.id)).toEqual(["k2", "k1"]);
    expect(crewOptions(crews, null)).toEqual([]);
  });
});

describe("validateProject", () => {
  it("accepts and cleans a valid project", () => {
    const v = validateProject({ ...base, name: "  Alpha ", city: " ", est_revenue: 10 });
    expect(v.name).toBe("Alpha");
    expect(v.city).toBeNull();
  });
  it("rejects a blank name", () => {
    expect(() => validateProject({ ...base, name: " " })).toThrow();
  });
  it("rejects a bad status", () => {
    expect(() => validateProject({ ...base, status: "Nope" })).toThrow("Invalid status");
  });
  it("rejects end before start", () => {
    expect(() =>
      validateProject({ ...base, est_start: "2026-02-01", est_end: "2026-01-01" }),
    ).toThrow();
  });
  it("rejects a crew without a contractor", () => {
    expect(() => validateProject({ ...base, crew_id: "k1" })).toThrow(
      "Choose a contractor before choosing a crew",
    );
    expect(validateProject({ ...base, crew_id: "k1", contractor_id: "c1" }).crew_id).toBe("k1");
  });
  it("rejects bad progress, dates and revenue", () => {
    expect(() => validateProject({ ...base, progress: 2 })).toThrow();
    expect(() => validateProject({ ...base, deadline: "2026-02-30" })).toThrow();
    expect(() => validateProject({ ...base, est_revenue: 1e12 })).toThrow();
  });
});

describe("filterProjects", () => {
  const rows = [
    row({ name: "Alpha", city: "Dallas", pm_id: "p1", status: "Scheduled" }),
    row({ name: "Beta", notes: "dallas yard", pm_id: "p2" }),
  ];
  const all = { search: "", pmId: "all", contractorId: "all", crewId: "all", status: "all" };
  it("searches case-insensitively across fields", () => {
    expect(filterProjects(rows, { ...all, search: "DALLAS" })).toHaveLength(2);
  });
  it("filters by exact values", () => {
    expect(filterProjects(rows, { ...all, pmId: "p1" }).map((r) => r.name)).toEqual(["Alpha"]);
    expect(filterProjects(rows, { ...all, status: "Scheduled" })).toHaveLength(1);
  });
});

describe("sortProjects", () => {
  it("sorts status in workflow order", () => {
    const rows = [
      row({ name: "A", status: "Completed" }),
      row({ name: "B", status: "Potential" }),
      row({ name: "C", status: "In Progress" }),
    ];
    expect(sortProjects(rows, "status", "asc", "2026-01-01").map((r) => r.name)).toEqual([
      "B",
      "C",
      "A",
    ]);
  });
  it("puts blanks last in both directions and breaks ties by name", () => {
    const rows = [
      row({ name: "B", est_start: null }),
      row({ name: "C", est_start: "2026-02-01" }),
      row({ name: "A", est_start: "2026-02-01" }),
      row({ name: "D", est_start: "2026-01-01" }),
    ];
    expect(sortProjects(rows, "est_start", "asc", "2026-03-01").map((r) => r.name)).toEqual([
      "D",
      "A",
      "C",
      "B",
    ]);
    expect(sortProjects(rows, "est_start", "desc", "2026-03-01").map((r) => r.name)).toEqual([
      "A",
      "C",
      "D",
      "B",
    ]);
  });
});
