import { describe, expect, it } from "vitest";
import {
  acknowledgementPdfFileName,
  buildAcknowledgementReport,
  pendingAcknowledgements,
  type Ack,
  type AckDoc,
  type Person,
} from "./safety-acknowledgements";

const doc = (over: Partial<AckDoc> = {}): AckDoc => ({
  id: "d1",
  title: "Acetone",
  category: "sds",
  version: null,
  revision: 1,
  archived: false,
  requires_acknowledgement: true,
  shareable_with_subs: false,
  ...over,
});

const person = (over: Partial<Person> = {}): Person => ({
  id: "u1",
  name: "Ann",
  isSubcontractor: false,
  isDisabled: false,
  canViewSafety: true,
  ...over,
});

const ack = (over: Partial<Ack> = {}): Ack => ({
  user_id: "u1",
  document_id: "d1",
  revision: 1,
  acknowledged_at: "2026-10-17T12:00:00Z",
  ...over,
});

describe("pendingAcknowledgements", () => {
  it("is pending until acknowledged at the current revision", () => {
    expect(pendingAcknowledgements([doc()], [], "u1")).toHaveLength(1);
    expect(pendingAcknowledgements([doc()], [ack()], "u1")).toHaveLength(0);
  });

  it("an ack at an older revision leaves the document pending", () => {
    const docs = [doc({ revision: 2 })];
    expect(pendingAcknowledgements(docs, [ack({ revision: 1 })], "u1")).toHaveLength(1);
  });

  it("ignores acks by other users", () => {
    expect(pendingAcknowledgements([doc()], [ack({ user_id: "u2" })], "u1")).toHaveLength(1);
  });

  it("never lists non-required or archived documents", () => {
    const docs = [
      doc({ id: "a", requires_acknowledgement: false }),
      doc({ id: "b", archived: true }),
    ];
    expect(pendingAcknowledgements(docs, [], "u1")).toEqual([]);
  });
});

describe("buildAcknowledgementReport", () => {
  it("splits the audience into acknowledged and pending at the current revision", () => {
    const people = [person(), person({ id: "u2", name: "Bob" })];
    const [entry] = buildAcknowledgementReport([doc({ revision: 2 })], people, [
      ack({ revision: 2 }),
      ack({ user_id: "u2", revision: 1 }),
    ]);
    expect(entry.acknowledged.map((a) => a.person.name)).toEqual(["Ann"]);
    expect(entry.acknowledged[0].acknowledgedAt).toBe("2026-10-17T12:00:00Z");
    expect(entry.pending.map((p) => p.name)).toEqual(["Bob"]);
  });

  it("excludes disabled users and users without view, manage or admin", () => {
    const people = [
      person({ id: "a", name: "Disabled", isDisabled: true }),
      person({ id: "b", name: "NoAccess", canViewSafety: false }),
      person({ id: "c", name: "Ok" }),
    ];
    const [entry] = buildAcknowledgementReport([doc()], people, []);
    expect(entry.pending.map((p) => p.name)).toEqual(["Ok"]);
  });

  it("excludes subcontractors from non-shareable documents only", () => {
    const people = [person({ id: "s", name: "Sub", isSubcontractor: true })];
    const [plain] = buildAcknowledgementReport([doc()], people, []);
    expect(plain.pending).toEqual([]);
    const [shared] = buildAcknowledgementReport([doc({ shareable_with_subs: true })], people, []);
    expect(shared.pending.map((p) => p.name)).toEqual(["Sub"]);
  });

  it("skips non-required and archived documents and sorts everything by name", () => {
    const docs = [
      doc({ id: "z", title: "Zinc" }),
      doc({ id: "n", title: "None", requires_acknowledgement: false }),
      doc({ id: "x", title: "Old", archived: true }),
      doc({ id: "a", title: "Acetone" }),
    ];
    const people = [
      person({ id: "u3", name: "Cy" }),
      person({ id: "u1", name: "Ann" }),
      person({ id: "u2", name: "Bob" }),
    ];
    const acks = [
      ack({ user_id: "u3", document_id: "a" }),
      ack({ user_id: "u1", document_id: "a" }),
    ];
    const report = buildAcknowledgementReport(docs, people, acks);
    expect(report.map((r) => r.document.title)).toEqual(["Acetone", "Zinc"]);
    expect(report[0].acknowledged.map((a) => a.person.name)).toEqual(["Ann", "Cy"]);
    expect(report[0].pending.map((p) => p.name)).toEqual(["Bob"]);
    expect(report[1].pending.map((p) => p.name)).toEqual(["Ann", "Bob", "Cy"]);
  });
});

describe("acknowledgementPdfFileName", () => {
  it("uses the date", () => {
    expect(acknowledgementPdfFileName(new Date("2026-10-17T12:00:00Z"))).toBe(
      "Safety_Acknowledgements-2026-10-17.pdf",
    );
  });
});
