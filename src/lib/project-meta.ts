export const PROJECT_STATUSES = ["Active", "On Hold", "Complete", "Archived"] as const;

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
  "General Construction",
  "Interiors",
  "Mechanical",
  "Electrical",
  "Civil",
  "Service",
] as const;

export type ProjectRow = {
  id: string;
  name: string;
  address: string | null;
  customer: string | null;
  client: string | null;
  division: string | null;
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
