import type { SafetyCategory } from "@/lib/safety-documents";

export type AckDoc = {
  id: string;
  title: string;
  category: SafetyCategory;
  version: string | null;
  revision: number;
  archived: boolean;
  requires_acknowledgement: boolean;
  shareable_with_subs: boolean;
};

export type Ack = {
  user_id: string;
  document_id: string;
  revision: number;
  acknowledged_at: string;
};

export type Person = {
  id: string;
  name: string;
  isSubcontractor: boolean;
  isDisabled: boolean;
  canViewSafety: boolean;
};

export type AckReportEntry = {
  document: AckDoc;
  acknowledged: { person: Person; acknowledgedAt: string }[];
  pending: Person[];
};

/** Documents that need acknowledgement and that `userId` has not acknowledged at the current revision. */
export function pendingAcknowledgements<T extends AckDoc>(
  docs: T[],
  acks: Pick<Ack, "user_id" | "document_id" | "revision">[],
  userId: string,
): T[] {
  return docs.filter(
    (d) =>
      d.requires_acknowledgement &&
      !d.archived &&
      !acks.some(
        (a) => a.user_id === userId && a.document_id === d.id && a.revision === d.revision,
      ),
  );
}

const byName = (a: Person, b: Person) => a.name.localeCompare(b.name);

/** One entry per flagged, non-archived document: who acknowledged its current revision and who has not. */
export function buildAcknowledgementReport(
  docs: AckDoc[],
  people: Person[],
  acks: Ack[],
): AckReportEntry[] {
  return docs
    .filter((d) => d.requires_acknowledgement && !d.archived)
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((document) => {
      const audience = people.filter(
        (p) =>
          p.canViewSafety && !p.isDisabled && (!p.isSubcontractor || document.shareable_with_subs),
      );
      const acknowledged: AckReportEntry["acknowledged"] = [];
      const pending: Person[] = [];
      for (const person of audience) {
        const ack = acks.find(
          (a) =>
            a.user_id === person.id &&
            a.document_id === document.id &&
            a.revision === document.revision,
        );
        if (ack) acknowledged.push({ person, acknowledgedAt: ack.acknowledged_at });
        else pending.push(person);
      }
      acknowledged.sort((a, b) => byName(a.person, b.person));
      pending.sort(byName);
      return { document, acknowledged, pending };
    });
}

export function acknowledgementPdfFileName(date: Date): string {
  return `Safety_Acknowledgements-${date.toISOString().slice(0, 10)}.pdf`;
}
