import { JHA_SIGNATURE_PREFIX } from "@/lib/jha";

export const TOOLBOX_SIGNATURE_MAX = 100000;
export const TOOLBOX_MAX_ATTENDEES = 60;
const TITLE_MAX = 200;
const BODY_MAX = 10000;
const NAME_MAX = 200;

export type Attendee = { name: string; signature: string };

/** Local calendar date as YYYY-MM-DD. */
export function localDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function talkDueState(talkDate: string, today: string): "due" | "scheduled" {
  return talkDate <= today ? "due" : "scheduled";
}

type TalkLike = {
  id: string;
  job_id: string;
  talk_date: string;
  completed_at: string | null;
  created_at: string;
};

/** The user's talks split into incomplete (oldest date first) and completed (newest first). */
export function groupTalks<T extends TalkLike>(
  talks: T[],
  jobIds: Set<string>,
): { incomplete: T[]; completed: T[] } {
  const mine = talks.filter((t) => jobIds.has(t.job_id));
  const incomplete = mine
    .filter((t) => t.completed_at === null)
    .sort(
      (a, b) =>
        a.talk_date.localeCompare(b.talk_date) ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  const completed = mine
    .filter((t) => t.completed_at !== null)
    .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());
  return { incomplete, completed };
}

export function validateTopic(input: { title: unknown; body: unknown }): {
  title: string;
  body: string | null;
} {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (!title) throw new Error("Enter a topic title");
  if (title.length > TITLE_MAX) throw new Error(`Title must be ${TITLE_MAX} characters or fewer`);
  const body = typeof input.body === "string" ? input.body.trim() : "";
  if (body.length > BODY_MAX) {
    throw new Error(`Talking points must be ${BODY_MAX} characters or fewer`);
  }
  return { title, body: body || null };
}

export function validateAttendees(attendees: unknown): Attendee[] {
  if (!Array.isArray(attendees) || attendees.length === 0) {
    throw new Error("Add at least one attendee");
  }
  if (attendees.length > TOOLBOX_MAX_ATTENDEES) throw new Error("Too many attendees");
  return attendees.map((a) => {
    const name = typeof a?.name === "string" ? a.name.trim() : "";
    const signature = a?.signature;
    if (
      !name ||
      name.length > NAME_MAX ||
      typeof signature !== "string" ||
      !signature.startsWith(JHA_SIGNATURE_PREFIX) ||
      signature.length > TOOLBOX_SIGNATURE_MAX
    ) {
      throw new Error("Every attendee needs a name and signature");
    }
    return { name, signature };
  });
}

export function toolboxPdfFileName(projectName: string, talkDate: string): string {
  const name = projectName.replace(/[^a-zA-Z0-9]+/g, "_");
  return `${name}-Toolbox_Talk-${talkDate}.pdf`;
}
