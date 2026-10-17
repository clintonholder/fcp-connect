import type { WorkerType } from "@/lib/worker-type";

export type AudienceSelection = {
  userIds: string[];
  divisions: string[];
  divisionRoles: { division: string; roleId: string }[];
  projectIds: string[];
  workerTypes: WorkerType[];
};

export type AudiencePerson = {
  id: string;
  workerType: WorkerType;
  isDisabled: boolean;
  divisions: string[];
  roleIds: string[];
};

export type AudienceProject = {
  id: string;
  ownerId: string | null;
  collaboratorIds: string[];
};

export type AudienceDirectory = { people: AudiencePerson[]; projects: AudienceProject[] };

export const EMPTY_SELECTION: AudienceSelection = {
  userIds: [],
  divisions: [],
  divisionRoles: [],
  projectIds: [],
  workerTypes: [],
};

/** Expands an audience selection into a sorted, de-duplicated list of recipient user ids.
 *  Disabled people, unknown ids and the sender are left out. */
export function resolveAudience(
  selection: AudienceSelection,
  directory: AudienceDirectory,
  senderId: string,
): string[] {
  const ids = new Set<string>(selection.userIds);
  for (const p of directory.people) {
    if (
      selection.divisions.some((d) => p.divisions.includes(d)) ||
      selection.divisionRoles.some(
        (r) => p.divisions.includes(r.division) && p.roleIds.includes(r.roleId),
      ) ||
      selection.workerTypes.includes(p.workerType)
    ) {
      ids.add(p.id);
    }
  }
  for (const proj of directory.projects) {
    if (!selection.projectIds.includes(proj.id)) continue;
    if (proj.ownerId) ids.add(proj.ownerId);
    for (const c of proj.collaboratorIds) ids.add(c);
  }
  const eligible = new Set(directory.people.filter((p) => !p.isDisabled).map((p) => p.id));
  ids.delete(senderId);
  return [...ids].filter((id) => eligible.has(id)).sort();
}

export type MessageInput = {
  subject: string;
  body: string;
  projectId: string | null;
  safetyDocumentId: string | null;
  selection: AudienceSelection;
};

function stringArray(v: unknown, label: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new Error(`${label} must be a list of text values`);
  }
  return v as string[];
}

function optionalId(v: unknown, label: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new Error(`${label} is invalid`);
  return v;
}

export function validateMessageInput(d: unknown): MessageInput {
  const raw = (d ?? {}) as Record<string, unknown>;
  const subject = typeof raw.subject === "string" ? raw.subject.trim() : "";
  const body = typeof raw.body === "string" ? raw.body.trim() : "";
  if (!subject) throw new Error("A subject is required");
  if (subject.length > 200) throw new Error("The subject must be 200 characters or fewer");
  if (!body) throw new Error("A message body is required");
  if (body.length > 10000) throw new Error("The message must be 10,000 characters or fewer");

  const projectId = optionalId(raw.projectId, "Project");
  const safetyDocumentId = optionalId(raw.safetyDocumentId, "Safety document");
  if (projectId && safetyDocumentId) {
    throw new Error("Link a project or a safety document, not both");
  }

  const sel = (raw.selection ?? {}) as Record<string, unknown>;
  const workerTypes = stringArray(sel.workerTypes, "Worker types");
  if (workerTypes.some((w) => w !== "employee" && w !== "subcontractor")) {
    throw new Error("Choose FCP Employee or Sub Contractor");
  }
  const rawPairs = sel.divisionRoles ?? [];
  if (!Array.isArray(rawPairs)) throw new Error("Roles in divisions are invalid");
  const divisionRoles = rawPairs.map((p) => {
    const pair = (p ?? {}) as Record<string, unknown>;
    if (typeof pair.division !== "string" || typeof pair.roleId !== "string") {
      throw new Error("Roles in divisions are invalid");
    }
    return { division: pair.division, roleId: pair.roleId };
  });

  return {
    subject,
    body,
    projectId,
    safetyDocumentId,
    selection: {
      userIds: stringArray(sel.userIds, "People"),
      divisions: stringArray(sel.divisions, "Divisions"),
      divisionRoles,
      projectIds: stringArray(sel.projectIds, "Projects"),
      workerTypes: workerTypes as WorkerType[],
    },
  };
}
