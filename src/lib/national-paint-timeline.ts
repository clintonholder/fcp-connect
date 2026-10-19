import { isoToDay } from "@/lib/national-paint-projects";
import type { NpStatus } from "@/lib/national-paint-import";

const DAY_MS = 86_400_000;

/** The workbook grid is exactly 140 days wide (columns G..EP). */
export const TIMELINE_DAYS = 140;

export type TimelineDay = {
  iso: string;
  dayOfMonth: number;
  isMonthStart: boolean;
  isWeekStart: boolean;
};

export type TimelineRow = {
  id: string;
  name: string;
  pm_id: string | null;
  status: NpStatus;
  est_start: string | null;
  est_end: string | null;
};

/** Bar colors from the workbook's conditional formatting; Completed has only an outline. */
export const STATUS_COLORS: Record<NpStatus, { fill: string | null; text: string }> = {
  "In Progress": { fill: "#C6EFCE", text: "#006100" },
  Scheduled: { fill: "#FFEB9C", text: "#9C5700" },
  Upcoming: { fill: "#FFC7CE", text: "#9C0006" },
  "Verbal Award": { fill: "#D9D9D9", text: "#595959" },
  Potential: { fill: "#D9D9D9", text: "#595959" },
  Completed: { fill: null, text: "#000000" },
};

/** ISO date plus n whole days (UTC arithmetic, so DST never shifts it). */
export function addDays(iso: string, n: number): string {
  return new Date((isoToDay(iso) + n) * DAY_MS).toISOString().slice(0, 10);
}

export function timelineDays(reference: string, days = TIMELINE_DAYS): TimelineDay[] {
  return Array.from({ length: days }, (_, i) => {
    const iso = addDays(reference, i);
    const dayOfMonth = Number(iso.slice(8, 10));
    return { iso, dayOfMonth, isMonthStart: dayOfMonth === 1, isWeekStart: i % 7 === 0 };
  });
}

/**
 * The workbook bar rule: Start and End inclusive, a blank End runs to the end of the grid, a blank
 * Start means no bar. Returns 0-based inclusive indexes clipped to the window, or null.
 */
export function barSpan(
  estStart: string | null,
  estEnd: string | null,
  reference: string,
  days = TIMELINE_DAYS,
): { startIndex: number; endIndex: number } | null {
  if (!estStart) return null;
  const ref = isoToDay(reference);
  const start = isoToDay(estStart) - ref;
  const end = estEnd ? isoToDay(estEnd) - ref : days - 1;
  if (end < 0 || start > days - 1) return null;
  return { startIndex: Math.max(0, start), endIndex: Math.min(days - 1, end) };
}

/** Rows the timeline lists: named, completed ones only when asked, one PM or all, sorted. */
export function timelineRows<T extends TimelineRow>(
  rows: T[],
  opts: { showCompleted: boolean; pmId: string },
): T[] {
  return rows
    .filter(
      (r) =>
        r.name.trim() !== "" &&
        (opts.showCompleted || r.status !== "Completed") &&
        (opts.pmId === "all" || r.pm_id === opts.pmId),
    )
    .sort((a, b) => {
      if (a.est_start !== b.est_start) {
        if (!a.est_start) return 1;
        if (!b.est_start) return -1;
        return a.est_start < b.est_start ? -1 : 1;
      }
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
}
