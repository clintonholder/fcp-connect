export const SAFETY_BUCKET = "safety-documents";

export type SafetyCategory = "sds" | "first_aid" | "emergency" | "other";

export const SAFETY_CATEGORY_LABEL: Record<SafetyCategory, string> = {
  sds: "SDS / MSDS",
  first_aid: "First aid",
  emergency: "Emergency",
  other: "Other",
};

export type SafetyDocumentRow = {
  title: string;
  description: string | null;
  version: string | null;
  archived: boolean;
  shareable_with_subs: boolean;
};

/** Case-insensitive substring search on title, description and version, sorted by title. */
export function filterSafetyDocuments<T extends SafetyDocumentRow>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  const matched = q
    ? rows.filter((r) =>
        [r.title, r.description, r.version].some((v) => (v ?? "").toLowerCase().includes(q)),
      )
    : rows;
  return [...matched].sort((a, b) => a.title.localeCompare(b.title));
}

/** Mirrors the RLS read rule so View As shows what the viewed user would see. */
export function visibleToViewer<T extends SafetyDocumentRow>(
  rows: T[],
  viewer: { canManage: boolean; isSubcontractor: boolean },
): T[] {
  return rows.filter((r) => {
    if (r.archived) return false;
    if (viewer.canManage) return true;
    return !viewer.isSubcontractor || r.shareable_with_subs;
  });
}

/** `<random uuid>/<sanitized file name>`; the name keeps only [A-Za-z0-9._-]. */
export function safetyStoragePath(fileName: string): string {
  const cleaned = fileName.replace(/[^A-Za-z0-9._-]/g, "-");
  return `${crypto.randomUUID()}/${cleaned || "file"}`;
}

export type SafetyInput = {
  title: string;
  category: string;
  description?: string | null;
  version?: string | null;
  effectiveDate?: string | null;
  shareableWithSubs?: boolean;
  requiresAcknowledgement?: boolean;
  filePath: string;
};

export type ValidSafetyInput = {
  title: string;
  category: SafetyCategory;
  description: string | null;
  version: string | null;
  effectiveDate: string | null;
  shareableWithSubs: boolean;
  requiresAcknowledgement: boolean;
  filePath: string;
};

const CATEGORIES = Object.keys(SAFETY_CATEGORY_LABEL) as SafetyCategory[];

function trimOrNull(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t ? t : null;
}

export function validateFilePath(filePath: string | null | undefined): string {
  const p = (filePath ?? "").trim();
  if (!p) throw new Error("A file is required");
  if (p.startsWith("/") || p.includes("..")) throw new Error("Invalid file path");
  return p;
}

export function validateEffectiveDate(v: string | null | undefined): string | null {
  const d = trimOrNull(v);
  if (d === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
    throw new Error("Effective date must be a valid date (YYYY-MM-DD)");
  }
  return d;
}

/** Normalizes and validates server-function input. Throws an Error with a readable message. */
export function validateSafetyInput(input: SafetyInput): ValidSafetyInput {
  const title = (input?.title ?? "").trim();
  if (!title) throw new Error("Title is required");
  if (!CATEGORIES.includes(input.category as SafetyCategory)) throw new Error("Invalid category");
  return {
    title,
    category: input.category as SafetyCategory,
    description: trimOrNull(input.description),
    version: trimOrNull(input.version),
    effectiveDate: validateEffectiveDate(input.effectiveDate),
    shareableWithSubs: input.shareableWithSubs === true,
    requiresAcknowledgement: input.requiresAcknowledgement === true,
    filePath: validateFilePath(input.filePath),
  };
}
