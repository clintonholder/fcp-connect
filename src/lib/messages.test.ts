import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  buildSentReport,
  countUnread,
  shouldMarkRead,
  resolveAudience,
  validateMessageInput,
  type AudienceDirectory,
  type AudiencePerson,
  type AudienceSelection,
} from "./messages";

const person = (id: string, over: Partial<AudiencePerson> = {}): AudiencePerson => ({
  id,
  workerType: "employee",
  isDisabled: false,
  divisions: [],
  roleIds: [],
  ...over,
});

const directory: AudienceDirectory = {
  people: [
    person("a", { divisions: ["National Paint"], roleIds: ["r1"] }),
    person("b", { divisions: ["National Paint"], roleIds: ["r2"] }),
    person("c", { divisions: ["Minnesota Paint"], roleIds: ["r1"] }),
    person("d", { workerType: "subcontractor" }),
    person("e", { divisions: ["National Paint"], isDisabled: true }),
    person("sender", { divisions: ["National Paint"] }),
  ],
  projects: [
    { id: "p1", ownerId: "a", collaboratorIds: ["c", "d"] },
    { id: "p2", ownerId: null, collaboratorIds: ["b"] },
  ],
};

const sel = (over: Partial<AudienceSelection>): AudienceSelection => ({
  ...EMPTY_SELECTION,
  ...over,
});

describe("resolveAudience", () => {
  it("returns [] for an empty selection", () => {
    expect(resolveAudience(EMPTY_SELECTION, directory, "sender")).toEqual([]);
  });

  it("includes selected users", () => {
    expect(resolveAudience(sel({ userIds: ["c", "a"] }), directory, "sender")).toEqual(["a", "c"]);
  });

  it("includes everyone in a division", () => {
    expect(resolveAudience(sel({ divisions: ["National Paint"] }), directory, "sender")).toEqual([
      "a",
      "b",
    ]);
  });

  it("requires both the role and the division", () => {
    const s = sel({ divisionRoles: [{ division: "National Paint", roleId: "r1" }] });
    expect(resolveAudience(s, directory, "sender")).toEqual(["a"]);
  });

  it("includes the owner and collaborators of a project", () => {
    expect(resolveAudience(sel({ projectIds: ["p1"] }), directory, "sender")).toEqual([
      "a",
      "c",
      "d",
    ]);
  });

  it("handles a null project owner and unknown projects", () => {
    expect(resolveAudience(sel({ projectIds: ["p2", "nope"] }), directory, "sender")).toEqual([
      "b",
    ]);
  });

  it("includes everyone of a worker type", () => {
    expect(resolveAudience(sel({ workerTypes: ["subcontractor"] }), directory, "sender")).toEqual([
      "d",
    ]);
  });

  it("de-duplicates overlapping selections", () => {
    const s = sel({
      userIds: ["a", "a"],
      divisions: ["National Paint"],
      projectIds: ["p1"],
      workerTypes: ["subcontractor"],
    });
    expect(resolveAudience(s, directory, "sender")).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves out disabled people, unknown ids and the sender", () => {
    const s = sel({ userIds: ["e", "ghost", "sender", "a"], divisions: ["National Paint"] });
    expect(resolveAudience(s, directory, "sender")).toEqual(["a", "b"]);
  });
});

describe("validateMessageInput", () => {
  const good = { subject: " Hi ", body: " There ", selection: { userIds: ["a"] } };

  it("accepts good input, trims and defaults arrays", () => {
    const r = validateMessageInput(good);
    expect(r.subject).toBe("Hi");
    expect(r.body).toBe("There");
    expect(r.projectId).toBeNull();
    expect(r.selection).toEqual({ ...EMPTY_SELECTION, userIds: ["a"] });
  });

  it("rejects an empty subject", () => {
    expect(() => validateMessageInput({ ...good, subject: "  " })).toThrow(/subject/i);
  });

  it("rejects an empty body", () => {
    expect(() => validateMessageInput({ ...good, body: "" })).toThrow(/body/i);
  });

  it("rejects both links set", () => {
    expect(() => validateMessageInput({ ...good, projectId: "p", safetyDocumentId: "s" })).toThrow(
      /not both/,
    );
  });

  it("rejects an unknown worker type", () => {
    expect(() =>
      validateMessageInput({ ...good, selection: { workerTypes: ["visitor"] } }),
    ).toThrow(/Sub Contractor/);
  });

  it("rejects non-string ids", () => {
    expect(() => validateMessageInput({ ...good, selection: { userIds: [1] } })).toThrow();
  });
});

describe("shouldMarkRead", () => {
  it("marks only an unread message for a recipient who is not read-only", () => {
    expect(shouldMarkRead({ readOnly: false, isRecipient: true, readAt: null })).toBe(true);
    expect(shouldMarkRead({ readOnly: false, isRecipient: true, readAt: "2026-01-01" })).toBe(
      false,
    );
    expect(shouldMarkRead({ readOnly: false, isRecipient: false, readAt: null })).toBe(false);
  });

  it("never marks read when read-only", () => {
    expect(shouldMarkRead({ readOnly: true, isRecipient: true, readAt: null })).toBe(false);
    expect(shouldMarkRead({ readOnly: true, isRecipient: false, readAt: null })).toBe(false);
  });
});

describe("buildSentReport", () => {
  const messages = [
    { id: "m1", subject: "Old", sentAt: "2026-01-01T00:00:00Z" },
    { id: "m2", subject: "New", sentAt: "2026-02-01T00:00:00Z" },
  ];
  const recipients = [
    { messageId: "m2", userId: "u1", readAt: "2026-02-02T00:00:00Z" },
    { messageId: "m2", userId: "u2", readAt: null },
    { messageId: "m2", userId: "u3", readAt: null },
    { messageId: "m2", userId: "u4", readAt: "2026-02-03T00:00:00Z" },
    { messageId: "m1", userId: "u1", readAt: null },
    { messageId: "gone", userId: "u1", readAt: null },
  ];
  const names = { u1: "Zed", u2: "Bea", u4: "Amy" };

  it("returns newest first with counts", () => {
    const report = buildSentReport(messages, recipients, names);
    expect(report.map((r) => r.id)).toEqual(["m2", "m1"]);
    expect(report[0].recipientCount).toBe(4);
    expect(report[0].readCount).toBe(2);
    expect(report[1].recipientCount).toBe(1);
    expect(report[1].readCount).toBe(0);
  });

  it("sorts unread first then by name, with an Unknown fallback", () => {
    const [first] = buildSentReport(messages, recipients, names);
    expect(first.recipients.map((r) => r.name)).toEqual(["Bea", "Unknown", "Amy", "Zed"]);
  });

  it("ignores recipient rows for unknown messages", () => {
    const report = buildSentReport(messages, recipients, names);
    expect(report.flatMap((r) => r.recipients).length).toBe(5);
  });
});

describe("countUnread", () => {
  it("counts rows with no read time", () => {
    expect(countUnread([])).toBe(0);
    expect(countUnread([{ readAt: null }, { readAt: "x" }, { readAt: null }])).toBe(2);
  });
});
