import { describe, expect, it } from "vitest";
import {
  STATUS_COLORS,
  TIMELINE_DAYS,
  addDays,
  barSpan,
  timelineDays,
  timelineRows,
  type TimelineRow,
} from "./national-paint-timeline";
import { NP_STATUSES } from "./national-paint-import";

const REF = "2026-03-01";

describe("addDays", () => {
  it("crosses month ends and DST changes", () => {
    expect(addDays("2026-01-30", 2)).toBe("2026-02-01");
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("timelineDays", () => {
  const days = timelineDays("2026-01-28");
  it("lists 140 days from the reference date", () => {
    expect(TIMELINE_DAYS).toBe(140);
    expect(days).toHaveLength(140);
    expect(days[0].iso).toBe("2026-01-28");
    expect(days[139].iso).toBe(addDays("2026-01-28", 139));
  });
  it("flags month starts and every 7th day", () => {
    expect(days[4]).toMatchObject({ iso: "2026-02-01", dayOfMonth: 1, isMonthStart: true });
    expect(days[0].isMonthStart).toBe(false);
    const weekStarts = days.flatMap((d, i) => (d.isWeekStart ? [i] : []));
    expect(weekStarts).toEqual(Array.from({ length: 20 }, (_, i) => i * 7));
  });
});

describe("barSpan", () => {
  it("covers both dates inside the window", () => {
    expect(barSpan("2026-03-03", "2026-03-10", REF)).toEqual({ startIndex: 2, endIndex: 9 });
  });
  it("gives a one-day bar when Start = End", () => {
    expect(barSpan("2026-03-05", "2026-03-05", REF)).toEqual({ startIndex: 4, endIndex: 4 });
  });
  it("clips a Start before the reference date to 0", () => {
    expect(barSpan("2026-02-01", "2026-03-04", REF)).toEqual({ startIndex: 0, endIndex: 3 });
  });
  it("clips an End after the window to 139", () => {
    expect(barSpan("2026-03-03", "2027-12-31", REF)).toEqual({ startIndex: 2, endIndex: 139 });
  });
  it("runs a null End to 139", () => {
    expect(barSpan("2026-03-03", null, REF)).toEqual({ startIndex: 2, endIndex: 139 });
  });
  it("gives null without a Start, even with an End", () => {
    expect(barSpan(null, null, REF)).toBeNull();
    expect(barSpan(null, "2026-03-10", REF)).toBeNull();
  });
  it("gives null for a bar wholly before or after the window", () => {
    expect(barSpan("2026-01-01", "2026-02-28", REF)).toBeNull();
    expect(barSpan(addDays(REF, 140), null, REF)).toBeNull();
  });
  it("gives 0..0 when End is the reference date", () => {
    expect(barSpan("2026-02-01", REF, REF)).toEqual({ startIndex: 0, endIndex: 0 });
  });
});

describe("timelineRows", () => {
  const row = (id: string, name: string, over: Partial<TimelineRow> = {}): TimelineRow => ({
    id,
    name,
    pm_id: "pm1",
    status: "Scheduled",
    est_start: "2026-03-01",
    est_end: null,
    ...over,
  });
  const rows = [
    row("a", "Zeta"),
    row("b", "alpha"),
    row("c", "Done", { status: "Completed" }),
    row("d", "No start", { est_start: null }),
    row("e", "Other PM", { pm_id: "pm2", est_start: "2026-02-01" }),
    row("f", "  "),
  ];
  const ids = (r: TimelineRow[]) => r.map((x) => x.id);

  it("hides Completed and blank names, sorts by start, blanks last, ties by name", () => {
    expect(ids(timelineRows(rows, { showCompleted: false, pmId: "all" }))).toEqual([
      "e",
      "b",
      "a",
      "d",
    ]);
  });
  it("shows Completed when asked", () => {
    expect(ids(timelineRows(rows, { showCompleted: true, pmId: "all" }))).toEqual([
      "e",
      "b",
      "c",
      "a",
      "d",
    ]);
  });
  it("filters by PM", () => {
    expect(ids(timelineRows(rows, { showCompleted: false, pmId: "pm2" }))).toEqual(["e"]);
  });
});

describe("STATUS_COLORS", () => {
  it("has every status, with no fill for Completed", () => {
    expect(Object.keys(STATUS_COLORS).sort()).toEqual([...NP_STATUSES].sort());
    expect(STATUS_COLORS.Completed.fill).toBeNull();
  });
});
