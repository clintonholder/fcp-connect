import { NP_CREW_TYPES } from "@/lib/national-paint-import";

export const MAX_NAME_LENGTH = 200;
export const MEMBER_ROLES = ["foreman", "tech"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];
export type CrewType = (typeof NP_CREW_TYPES)[number];

export type CrewInput = {
  name: string;
  contractor_id: string | null;
  owner_name: string | null;
  crew_type: CrewType | null;
  size: number | null;
  is_active: boolean;
};

export type CrewMemberInput = { name: string; role: MemberRole };

/** Trims a name; throws when it is blank or longer than 200 characters. */
export function validateName(value: unknown, label = "Name"): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new Error(`${label} is required`);
  if (name.length > MAX_NAME_LENGTH) {
    throw new Error(`${label} must be at most ${MAX_NAME_LENGTH} characters`);
  }
  return name;
}

export function validateCrew(d: Partial<Record<keyof CrewInput, unknown>>): CrewInput {
  const name = validateName(d?.name, "Crew name");

  const contractor = d?.contractor_id ?? null;
  if (contractor !== null && (typeof contractor !== "string" || !contractor)) {
    throw new Error("Invalid contractor");
  }

  let owner_name: string | null = null;
  if (d?.owner_name !== null && d?.owner_name !== undefined) {
    if (typeof d.owner_name !== "string") throw new Error("Invalid owner");
    owner_name = d.owner_name.trim() || null;
    if (owner_name && owner_name.length > MAX_NAME_LENGTH) {
      throw new Error(`Owner must be at most ${MAX_NAME_LENGTH} characters`);
    }
  }

  const type = d?.crew_type ?? null;
  if (type !== null && !NP_CREW_TYPES.some((t) => t === type)) {
    throw new Error("Invalid crew type");
  }

  const size = d?.size ?? null;
  if (size !== null && (typeof size !== "number" || !Number.isInteger(size) || size < 0)) {
    throw new Error("Size must be a whole number of 0 or more");
  }

  if (typeof d?.is_active !== "boolean") throw new Error("Invalid status");

  return {
    name,
    contractor_id: contractor as string | null,
    owner_name,
    crew_type: type as CrewType | null,
    size: size as number | null,
    is_active: d.is_active,
  };
}

export function validateCrewMember(d: Partial<Record<keyof CrewMemberInput, unknown>>) {
  const name = validateName(d?.name, "Member name");
  const role = MEMBER_ROLES.find((r) => r === d?.role);
  if (!role) throw new Error("Role must be foreman or tech");
  return { name, role } satisfies CrewMemberInput;
}

export function requireId(id: unknown, label: string): string {
  if (typeof id !== "string" || !id) throw new Error(`Missing ${label}`);
  return id;
}

/** True when another record (not `ignoreId`) already uses the name, ignoring case. */
export function isDuplicateName(
  name: string,
  existing: { id: string; name: string }[],
  ignoreId?: string | null,
): boolean {
  const key = name.trim().toLowerCase();
  return existing.some((r) => r.id !== ignoreId && r.name.trim().toLowerCase() === key);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Why a PM, crew or contractor cannot be deleted yet, or null when nothing uses it. */
export function inUseMessage(projects: number, crews = 0): string | null {
  if (crews > 0) return `Has ${plural(crews, "crew", "crews")}. Delete or move them first.`;
  if (projects > 0) {
    return `Used by ${plural(projects, "project", "projects")}. Reassign them before deleting.`;
  }
  return null;
}

/** Maps Postgres unique and foreign-key violations to friendly messages. */
export function friendlyDbError(
  error: { code?: string; message: string },
  duplicate: string,
  inUse: string,
): Error {
  if (error.code === "23505") return new Error(duplicate);
  if (error.code === "23503") return new Error(inUse);
  return new Error(error.message);
}
