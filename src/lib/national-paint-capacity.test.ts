import { describe, expect, it } from "vitest";
import {
  CAPACITY_DAYS,
  coversDay,
  crewDayState,
  crewDayStates,
  groupRuns,
  orderCrews,
  overlapDays,
  percentBusy,
  type CapacityCrew,
  type CapacityDay,
  type CapacityProject,
} from "@/lib/national-paint-capacity";
import { timelineDays } from "@/lib/national-paint-timeline";

const crew = (over: Partial<CapacityCrew> = {}): CapacityCrew => ({
  id: "c1",
  name: "Crew A",
  contractor_id: null,
  owner_name: null,
  crew_type: "In-House",
  size: 3,
  is_active: true,
  ...over,
});

const proj = (over: Partial<CapacityProject> = {}): CapacityProject => ({
  id: "p1",
  name: "Job 1",
  crew_id: "c1",
  status: "Scheduled",
  est_start: "2030-01-01",
  est_end: "2030-01-10",
  ...over,
});

describe("grid", () => {
  it("is 120 days starting on the reference date", () => {
    expect(CAPACITY_DAYS).toBe(120);
    const days = timelineDays("2030-01-05", CAPACITY_DAYS);
    expect(days).toHaveLength(120);
    expect(days[0].iso).toBe("2030-01-05");
  });
});

describe("coversDay", () => {
  it("includes the Start and End days", () => {
    const p = proj();
    expect(coversDay(p, "2029-12-31")).toBe(false);
    expect(coversDay(p, "2030-01-01")).toBe(true);
    expect(coversDay(p, "2030-01-10")).toBe(true);
    expect(coversDay(p, "2030-01-11")).toBe(false);
  });

  it("covers nothing with a blank Start or End", () => {
    expect(coversDay(proj({ est_start: null }), "2030-01-05")).toBe(false);
    expect(coversDay(proj({ est_end: null }), "2030-01-05")).toBe(false);
  });
});

describe("crewDayState", () => {
  it("shows In Progress and flags an overlap with a Scheduled project", () => {
    const projects = [proj({ id: "a", status: "In Progress" }), proj({ id: "b" })];
    const s = crewDayState(crew(), projects, "2030-01-05");
    expect(s.status).toBe("In Progress");
    expect(s.busyIds).toEqual(["a", "b"]);
    expect(s.overlap).toBe(true);
  });

  it("shows Upcoming without making the crew busy", () => {
    const s = crewDayState(crew(), [proj({ status: "Upcoming" })], "2030-01-05");
    expect(s.status).toBe("Upcoming");
    expect(s.busyIds).toEqual([]);
    expect(s.overlap).toBe(false);
  });

  it("never shows or counts Completed", () => {
    const s = crewDayState(crew(), [proj({ status: "Completed" })], "2030-01-05");
    expect(s).toEqual({ status: null, busyIds: [], overlap: false });
  });

  it("is Unavailable for an inactive crew on every day, with 0% and no overlaps", () => {
    const c = crew({ is_active: false });
    const projects = [proj({ id: "a", status: "In Progress" }), proj({ id: "b" })];
    const states = crewDayStates(c, projects, "2030-01-01");
    expect(states).toHaveLength(120);
    expect(states.every((s) => s.status === "Unavailable" && !s.overlap)).toBe(true);
    expect(percentBusy(c, projects, "2030-01-01", "2030-01-10")).toBe(0);
    expect(overlapDays(c, projects, "2030-01-01", "2030-01-10")).toBe(0);
  });

  it("matches projects by crew_id, not name", () => {
    const a = crew({ id: "c1", contractor_id: "k1" });
    const b = crew({ id: "c2", contractor_id: "k2" });
    const projects = [proj({ crew_id: "c1" }), proj({ id: "p2", crew_id: null })];
    expect(crewDayState(a, projects, "2030-01-05").busyIds).toEqual(["p1"]);
    expect(crewDayState(b, projects, "2030-01-05").status).toBeNull();
  });
});

describe("percentBusy", () => {
  it("is 0.3 for 3 busy days in a 10-day period", () => {
    const projects = [proj({ est_start: "2030-01-03", est_end: "2030-01-05" })];
    expect(percentBusy(crew(), projects, "2030-01-01", "2030-01-10")).toBeCloseTo(0.3);
  });

  it("is 0 when Through is before Reference", () => {
    expect(percentBusy(crew(), [proj()], "2030-01-10", "2030-01-01")).toBe(0);
  });

  it("counts only In Progress and Scheduled days", () => {
    const projects = [
      proj({ id: "a", status: "Upcoming" }),
      proj({ id: "b", status: "Potential" }),
      proj({ id: "c", status: "Completed" }),
    ];
    expect(percentBusy(crew(), projects, "2030-01-01", "2030-01-10")).toBe(0);
  });
});

describe("overlapDays", () => {
  it("counts only days in the period with two or more busy projects", () => {
    const projects = [
      proj({ id: "a", est_start: "2030-01-01", est_end: "2030-01-10" }),
      proj({ id: "b", status: "In Progress", est_start: "2030-01-08", est_end: "2030-01-20" }),
      proj({ id: "c", status: "Upcoming", est_start: "2030-01-01", est_end: "2030-01-10" }),
    ];
    expect(overlapDays(crew(), projects, "2030-01-01", "2030-01-30")).toBe(3);
    expect(overlapDays(crew(), projects, "2030-01-01", "2030-01-08")).toBe(1);
    expect(overlapDays(crew(), projects, "2030-01-10", "2030-01-01")).toBe(0);
  });
});

describe("orderCrews", () => {
  it("orders by type, then contractor (none last), then name", () => {
    const names: Record<string, string> = { k1: "Alpha", k2: "beta" };
    const crews = [
      crew({ id: "1", name: "n", crew_type: null }),
      crew({ id: "2", name: "pm", crew_type: "Project Manager" }),
      crew({ id: "3", name: "sub", crew_type: "Sub-Contractor", contractor_id: "k1" }),
      crew({ id: "4", name: "z", crew_type: "In-House" }),
      crew({ id: "5", name: "y", crew_type: "In-House", contractor_id: "k2" }),
      crew({ id: "6", name: "b", crew_type: "In-House", contractor_id: "k1" }),
      crew({ id: "7", name: "A", crew_type: "In-House", contractor_id: "k1" }),
    ];
    const ordered = orderCrews(crews, (id) => (id ? names[id] : undefined));
    expect(ordered.map((c) => c.id)).toEqual(["7", "6", "5", "4", "3", "2", "1"]);
  });
});

describe("groupRuns", () => {
  const day = (status: CapacityDay["status"], overlap = false): CapacityDay => ({
    status,
    busyIds: [],
    overlap,
  });

  it("merges equal statuses, splits on change and marks overlaps", () => {
    const runs = groupRuns([
      day("Scheduled"),
      day("Scheduled", true),
      day("In Progress"),
      day(null),
      day("In Progress"),
    ]);
    expect(runs).toEqual([
      { startIndex: 0, endIndex: 1, status: "Scheduled", overlap: true },
      { startIndex: 2, endIndex: 2, status: "In Progress", overlap: false },
      { startIndex: 4, endIndex: 4, status: "In Progress", overlap: false },
    ]);
  });
});
