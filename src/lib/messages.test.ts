import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
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
