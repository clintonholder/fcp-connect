import { NP_STATUSES, type NpStatus } from "@/lib/national-paint-import";
import { validateName } from "@/lib/national-paint-people";

const MAX_SHORT = 200;
const MAX_NOTES = 5000;
const MAX_REVENUE = 1_000_000_000_000;
const DAY_MS = 86_400_000;

export type ProjectInput = {
  name: string;
  cmic_job_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pm_id: string | null;
  contractor_id: string | null;
  crew_id: string | null;
  status: NpStatus;
  progress: number | null;
  est_start: string | null;
  est_end: string | null;
  deadline: string | null;
  est_revenue: number | null;
  notes: string | null;
  tag: string | null;
  exclude_revenue: boolean;
  bonus_eligible: boolean;
};

export type ProjectRow = ProjectInput & { id: string };
export type CrewRef = {
  id: string;
  name: string;
  contractor_id: string | null;
  is_active?: boolean;
};
export type NamedRef = { id: string; name: string };

function isoToDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

/** The workbook Pace formula: share of Est Start..Est End elapsed, null where it shows blank. */
export function computePace(
  estStart: string | null,
  estEnd: string | null,
  today: string,
): number | null {
  if (!estStart || !estEnd) return null;
  const start = isoToDay(estStart);
  const span = Math.max(1, isoToDay(estEnd) - start);
  const pace = Math.max(0, Math.min(1, (isoToDay(today) - start) / span));
  return pace === 0 ? null : pace;
}

/** The local calendar date as YYYY-MM-DD, like Excel's TODAY(). */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function formatPercent(fraction: number | null): string {
  return fraction === null ? "" : `${Math.round(fraction * 100)}%`;
}

/** Percent text (0 to 100) to a fraction; blank gives null, anything else throws. */
export function progressFromInput(text: string): number | null {
  const s = text.trim().replace(/%$/, "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error("Progress must be a number from 0 to 100");
  }
  return n / 100;
}

export function progressToInput(fraction: number | null): string {
  return fraction === null ? "" : String(Math.round(fraction * 10000) / 100);
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

/** Contractors with at least one crew, plus the project's current one when it has none. */
export function contractorOptions<T extends NamedRef>(
  contractors: T[],
  crews: CrewRef[],
  currentContractorId?: string | null,
): T[] {
  const withCrews = new Set(crews.map((c) => c.contractor_id));
  return contractors
    .filter((c) => withCrews.has(c.id) || c.id === currentContractorId)
    .sort(byName);
}

/** Crews of the chosen contractor; none until a contractor is chosen. */
export function crewOptions<T extends CrewRef>(crews: T[], contractorId: string | null): T[] {
  if (!contractorId) return [];
  return crews.filter((c) => c.contractor_id === contractorId).sort(byName);
}

function optText(value: unknown, label: string, max: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Invalid ${label}`);
  const s = value.trim();
  if (!s) return null;
  if (s.length > max) throw new Error(`${label} must be at most ${max} characters`);
  return s;
}

function optId(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${label}`);
  return value;
}

function optDate(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must be a valid date`);
  }
  const day = isoToDay(value);
  if (new Date(day * DAY_MS).toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid date`);
  }
  return value;
}

/** Validates project fields from the browser and returns a clean row for insert or update. */
export function validateProject(d: Partial<Record<keyof ProjectInput, unknown>>): ProjectInput {
  const name = validateName(d?.name, "Project name");
  const status = NP_STATUSES.find((s) => s === d?.status);
  if (!status) throw new Error("Invalid status");

  const progress = d?.progress ?? null;
  if (
    progress !== null &&
    (typeof progress !== "number" || !Number.isFinite(progress) || progress < 0 || progress > 1)
  ) {
    throw new Error("Progress must be between 0% and 100%");
  }

  const est_start = optDate(d?.est_start, "Est start");
  const est_end = optDate(d?.est_end, "Est end");
  const deadline = optDate(d?.deadline, "Deadline");
  if (est_start && est_end && est_end < est_start) {
    throw new Error("Est end cannot be before est start");
  }

  const revenue = d?.est_revenue ?? null;
  if (
    revenue !== null &&
    (typeof revenue !== "number" || !Number.isFinite(revenue) || Math.abs(revenue) >= MAX_REVENUE)
  ) {
    throw new Error("Invalid est revenue");
  }

  if (typeof d?.exclude_revenue !== "boolean" || typeof d?.bonus_eligible !== "boolean") {
    throw new Error("Invalid flags");
  }

  const pm_id = optId(d?.pm_id, "PM");
  const contractor_id = optId(d?.contractor_id, "contractor");
  const crew_id = optId(d?.crew_id, "crew");
  if (crew_id && !contractor_id) throw new Error("Choose a contractor before choosing a crew");

  return {
    name,
    cmic_job_number: optText(d?.cmic_job_number, "CMiC job number", MAX_SHORT),
    address: optText(d?.address, "Address", MAX_SHORT),
    city: optText(d?.city, "City", MAX_SHORT),
    state: optText(d?.state, "State", MAX_SHORT),
    pm_id,
    contractor_id,
    crew_id,
    status,
    progress: progress as number | null,
    est_start,
    est_end,
    deadline,
    est_revenue: revenue as number | null,
    notes: optText(d?.notes, "Notes", MAX_NOTES),
    tag: optText(d?.tag, "Tag", MAX_SHORT),
    exclude_revenue: d.exclude_revenue,
    bonus_eligible: d.bonus_eligible,
  };
}

export type ProjectFilters = {
  search: string;
  pmId: string;
  contractorId: string;
  crewId: string;
  status: string;
};

/** Filters are "all" or an exact id / status; search is a case-insensitive substring match. */
export function filterProjects<T extends ProjectInput>(rows: T[], f: ProjectFilters): T[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.pmId !== "all" && r.pm_id !== f.pmId) return false;
    if (f.contractorId !== "all" && r.contractor_id !== f.contractorId) return false;
    if (f.crewId !== "all" && r.crew_id !== f.crewId) return false;
    if (f.status !== "all" && r.status !== f.status) return false;
    if (!q) return true;
    return [r.name, r.cmic_job_number, r.address, r.city, r.state, r.tag, r.notes].some((v) =>
      v?.toLowerCase().includes(q),
    );
  });
}

export const SORT_KEYS = [
  "name",
  "cmic",
  "pm",
  "contractor",
  "crew",
  "status",
  "progress",
  "pace",
  "est_start",
  "est_end",
  "deadline",
  "est_revenue",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

/** Display names used to sort the PM, contractor and crew columns. */
export type SortNames = {
  pm: (id: string | null) => string | null;
  contractor: (id: string | null) => string | null;
  crew: (id: string | null) => string | null;
};

/** Sorts by a column; blanks go last in both directions and ties fall back to name. */
export function sortProjects<T extends ProjectInput>(
  rows: T[],
  key: SortKey,
  direction: SortDirection,
  today: string,
  names: SortNames = { pm: () => null, contractor: () => null, crew: () => null },
): T[] {
  const value = (r: T): string | number | null => {
    switch (key) {
      case "name":
        return r.name.toLowerCase();
      case "cmic":
        return r.cmic_job_number?.toLowerCase() || null;
      case "pm":
        return names.pm(r.pm_id)?.toLowerCase() ?? null;
      case "contractor":
        return names.contractor(r.contractor_id)?.toLowerCase() ?? null;
      case "crew":
        return names.crew(r.crew_id)?.toLowerCase() ?? null;
      case "status":
        return NP_STATUSES.indexOf(r.status);
      case "progress":
        return r.progress;
      case "pace":
        return computePace(r.est_start, r.est_end, today);
      case "est_start":
        return r.est_start;
      case "est_end":
        return r.est_end;
      case "deadline":
        return r.deadline;
      case "est_revenue":
        return r.est_revenue;
    }
  };
  const sign = direction === "asc" ? 1 : -1;
  const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb !== null) return 1;
    if (vb === null && va !== null) return -1;
    const primary = va === null || vb === null ? 0 : sign * cmp(va, vb);
    return primary || byName(a, b);
  });
}
