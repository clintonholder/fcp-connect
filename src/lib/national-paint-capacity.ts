import type { NpStatus } from "@/lib/national-paint-import";
import { isoToDay } from "@/lib/national-paint-projects";
import { addDays } from "@/lib/national-paint-timeline";

/** The workbook Crew Timeline grid is exactly 120 days wide. */
export const CAPACITY_DAYS = 120;

/** Statuses that make a crew busy (the request; the workbook counts every non-Completed status). */
export const BUSY_STATUSES: NpStatus[] = ["In Progress", "Scheduled"];

/** Display priority on a day with several projects; Completed is never shown. */
const DISPLAY_ORDER: NpStatus[] = [
  "In Progress",
  "Scheduled",
  "Upcoming",
  "Verbal Award",
  "Potential",
];

const CREW_TYPE_ORDER = ["In-House", "Sub-Contractor", "Project Manager"];

export type CapacityStatus = NpStatus | "Unavailable";

export type CapacityCrew = {
  id: string;
  name: string;
  contractor_id: string | null;
  owner_name: string | null;
  crew_type: string | null;
  size: number | null;
  is_active: boolean;
};

export type CapacityProject = {
  id: string;
  name: string;
  crew_id: string | null;
  status: NpStatus;
  est_start: string | null;
  est_end: string | null;
};

export type CapacityDay = {
  status: CapacityStatus | null;
  busyIds: string[];
  overlap: boolean;
};

export type CapacityRun = {
  startIndex: number;
  endIndex: number;
  status: CapacityStatus;
  overlap: boolean;
};

/** Workbook rule: both dates are needed, and Start and End are inclusive. */
export function coversDay(p: CapacityProject, iso: string): boolean {
  return !!p.est_start && !!p.est_end && p.est_start <= iso && iso <= p.est_end;
}

const isBusy = (p: CapacityProject) => BUSY_STATUSES.includes(p.status);

/** The state of one crew on one day. Projects match the crew by crew_id. */
export function crewDayState(
  crew: CapacityCrew,
  projects: CapacityProject[],
  iso: string,
): CapacityDay {
  if (!crew.is_active) return { status: "Unavailable", busyIds: [], overlap: false };
  const covering = projects.filter((p) => p.crew_id === crew.id && coversDay(p, iso));
  const busyIds = covering.filter(isBusy).map((p) => p.id);
  const status = DISPLAY_ORDER.find((s) => covering.some((p) => p.status === s)) ?? null;
  return { status, busyIds, overlap: busyIds.length >= 2 };
}

/** One state per grid day, starting on the reference date. */
export function crewDayStates(
  crew: CapacityCrew,
  projects: CapacityProject[],
  reference: string,
  days = CAPACITY_DAYS,
): CapacityDay[] {
  const own = projects.filter((p) => p.crew_id === crew.id);
  return Array.from({ length: days }, (_, i) => crewDayState(crew, own, addDays(reference, i)));
}

/** Days from Reference through Through, inclusive; 0 when Through is before Reference. */
function periodLength(reference: string, through: string): number {
  return Math.max(0, isoToDay(through) - isoToDay(reference) + 1);
}

function countDays(
  crew: CapacityCrew,
  projects: CapacityProject[],
  reference: string,
  through: string,
  test: (day: CapacityDay) => boolean,
): number {
  if (!crew.is_active) return 0;
  const own = projects.filter((p) => p.crew_id === crew.id);
  let n = 0;
  for (let i = 0; i < periodLength(reference, through); i++) {
    if (test(crewDayState(crew, own, addDays(reference, i)))) n++;
  }
  return n;
}

/** Share of Reference..Through with at least one busy project; 0 for inactive crews. */
export function percentBusy(
  crew: CapacityCrew,
  projects: CapacityProject[],
  reference: string,
  through: string,
): number {
  const length = periodLength(reference, through);
  if (length === 0) return 0;
  return countDays(crew, projects, reference, through, (d) => d.busyIds.length > 0) / length;
}

/** Days in Reference..Through with two or more busy projects; 0 for inactive crews. */
export function overlapDays(
  crew: CapacityCrew,
  projects: CapacityProject[],
  reference: string,
  through: string,
): number {
  return countDays(crew, projects, reference, through, (d) => d.overlap);
}

/** Crews by type (In-House, Sub-Contractor, Project Manager, none), contractor, then name. */
export function orderCrews<T extends CapacityCrew>(
  crews: T[],
  contractorName: (id: string | null) => string | undefined,
): T[] {
  const typeRank = (c: T) => {
    const i = c.crew_type ? CREW_TYPE_ORDER.indexOf(c.crew_type) : -1;
    return i === -1 ? CREW_TYPE_ORDER.length : i;
  };
  const lower = (s: string | undefined) => (s ?? "").toLowerCase();
  return [...crews].sort((a, b) => {
    if (typeRank(a) !== typeRank(b)) return typeRank(a) - typeRank(b);
    const ca = contractorName(a.contractor_id);
    const cb = contractorName(b.contractor_id);
    if (!ca !== !cb) return ca ? -1 : 1;
    return lower(ca).localeCompare(lower(cb)) || lower(a.name).localeCompare(lower(b.name));
  });
}

/** Consecutive days with the same displayed status as runs; blank days are skipped. */
export function groupRuns(states: CapacityDay[]): CapacityRun[] {
  const runs: CapacityRun[] = [];
  states.forEach((s, i) => {
    if (!s.status) return;
    const last = runs[runs.length - 1];
    if (last && last.status === s.status && last.endIndex === i - 1) {
      last.endIndex = i;
      last.overlap ||= s.overlap;
    } else {
      runs.push({ startIndex: i, endIndex: i, status: s.status, overlap: s.overlap });
    }
  });
  return runs;
}
