export const PROJECT_STATUSES = ["Active", "Archived"] as const;

export const PROJECT_PHASES = [
  "Pre-Construction",
  "Mobilization",
  "Demolition",
  "Rough-In",
  "Finishes",
  "Punch List",
  "Closeout",
] as const;

export const DIVISIONS = [
  "National Paint",
  "Minnesota Paint",
  "National Construction",
  "Facilities Maintenance",
] as const;

export const DIVISION_LOCK_MSG =
  "This project includes divisions you are not assigned to. An administrator must restore your division assignment or update the project's divisions.";

export function projectDivisions(p: { divisions?: string[] | null; division?: string | null }): string[] {
  if (p.divisions && p.divisions.length) return p.divisions;
  return p.division ? [p.division] : [];
}

export type ProjectRow = {
  id: string;
  name: string;
  address: string | null;
  owner: string | null;
  customer: string | null;
  client: string | null;
  division: string | null;
  divisions: string[];
  owner_id: string | null;
  status: string;
  phase: string | null;
  cmic_number: string | null;
  latitude: number | null;
  longitude: number | null;
  geocode_failed: boolean | null;
  archived_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  company_id: string;
  user_id: string;
};
