export const JHA_ANSWERS = [
  { v: "yes", l: "Yes" },
  { v: "no", l: "No" },
  { v: "na", l: "N/A" },
] as const;

export type JhaAnswer = (typeof JHA_ANSWERS)[number]["v"];

export const JHA_SIGNATURE_PREFIX = "data:image/png;base64,";
export const JHA_SIGNATURE_MAX = 500000;

export function jhaAnswerLabel(answer: string): string {
  return JHA_ANSWERS.find((a) => a.v === answer)?.l ?? answer;
}

type StatusRecord = { completed_at: string | null; created_at: string };

/** A project needs action when it has no JHA yet or an open request for a new one. */
export function jhaStatus(records: StatusRecord[]): "needs_action" | "completed" {
  if (records.length === 0 || records.some((r) => r.completed_at === null)) return "needs_action";
  return "completed";
}

/** The completed record with the newest completed_at, or null. */
export function latestCompleted<T extends { completed_at: string | null }>(records: T[]): T | null {
  let best: T | null = null;
  for (const r of records) {
    if (r.completed_at === null) continue;
    if (!best || new Date(r.completed_at).getTime() > new Date(best.completed_at!).getTime()) {
      best = r;
    }
  }
  return best;
}

type JobLike = { id: string; owner_id: string | null; archived_at: string | null };

/** Non-archived jobs the user owns (owner_id) or collaborates on. */
export function jhaProjectsForUser<T extends JobLike>(
  jobs: T[],
  collaborators: { job_id: string; user_id: string }[],
  userId: string,
): T[] {
  return jobs.filter(
    (j) =>
      !j.archived_at &&
      (j.owner_id === userId ||
        collaborators.some((c) => c.job_id === j.id && c.user_id === userId)),
  );
}

export function groupProjectsByJha<T extends { id: string; name: string }>(
  jobs: T[],
  records: (StatusRecord & { job_id: string })[],
): { needsAction: T[]; completed: T[] } {
  const needsAction: T[] = [];
  const completed: T[] = [];
  for (const j of jobs) {
    const status = jhaStatus(records.filter((r) => r.job_id === j.id));
    (status === "needs_action" ? needsAction : completed).push(j);
  }
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  return { needsAction: needsAction.sort(byName), completed: completed.sort(byName) };
}

export type JhaTemplate = { id: string; prompt: string; position: number; created_at: string };
export type JhaSnapshotItem = { template_id: string; prompt: string; answer: JhaAnswer };

export function validateJhaSubmission(
  templates: JhaTemplate[],
  answers: { templateId: string; answer: string }[],
  signature: string | null | undefined,
): { answers: JhaSnapshotItem[]; signature: string } {
  if (templates.length === 0) throw new Error("No hazard items are set up yet");
  const valid = new Set<string>(JHA_ANSWERS.map((a) => a.v));
  const byId = new Map<string, JhaAnswer>();
  for (const a of answers ?? []) {
    if (valid.has(a?.answer)) byId.set(a.templateId, a.answer as JhaAnswer);
  }
  const ordered = [...templates].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
  );
  const snapshot: JhaSnapshotItem[] = [];
  for (const t of ordered) {
    const answer = byId.get(t.id);
    if (!answer) throw new Error("Answer every hazard item");
    snapshot.push({ template_id: t.id, prompt: t.prompt, answer });
  }
  if (typeof signature !== "string" || !signature.startsWith(JHA_SIGNATURE_PREFIX)) {
    throw new Error("Sign the JHA");
  }
  if (signature.length > JHA_SIGNATURE_MAX) throw new Error("The signature is too large");
  return { answers: snapshot, signature };
}

export function jhaPdfFileName(projectName: string, completedAt: string): string {
  const name = projectName.replace(/[^a-zA-Z0-9]+/g, "_");
  return `${name}-JHA-${new Date(completedAt).toISOString().slice(0, 10)}.pdf`;
}
