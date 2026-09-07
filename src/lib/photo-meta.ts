export const PHOTO_PHASES = [
  "Inspection",
  "Pre-Construction",
  "Progress",
  "Completion",
  "Punch List",
  "Warranty",
] as const;

export type PhotoPhase = (typeof PHOTO_PHASES)[number];

export const UNPHASED = "Unassigned";

const ALIASES: Record<string, PhotoPhase> = {
  inspection: "Inspection",
  "pre-construction": "Pre-Construction",
  preconstruction: "Pre-Construction",
  "pre construction": "Pre-Construction",
  mobilization: "Pre-Construction",
  progress: "Progress",
  demolition: "Progress",
  "rough-in": "Progress",
  "rough in": "Progress",
  finishes: "Progress",
  "in progress": "Progress",
  completion: "Completion",
  complete: "Completion",
  closeout: "Completion",
  "close-out": "Completion",
  "punch list": "Punch List",
  punchlist: "Punch List",
  punch: "Punch List",
  warranty: "Warranty",
};

/** Maps any stored phase value onto the canonical display labels. */
export function normalizePhase(value: string | null | undefined): PhotoPhase | null {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return ALIASES[key] ?? null;
}

export function phaseLabel(value: string | null | undefined): string {
  return normalizePhase(value) ?? UNPHASED;
}

export function formatTakenAt(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Date unavailable";
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
