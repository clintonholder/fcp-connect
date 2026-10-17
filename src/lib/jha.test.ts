import { describe, expect, it } from "vitest";
import {
  groupProjectsByJha,
  jhaPdfFileName,
  jhaProjectsForUser,
  jhaStatus,
  latestCompleted,
  validateJhaSubmission,
} from "./jha";

const SIG = "data:image/png;base64,AAAA";
const templates = [
  { id: "t2", prompt: "Second", position: 2, created_at: "2026-01-01T00:00:00Z" },
  { id: "t1", prompt: "First", position: 1, created_at: "2026-01-02T00:00:00Z" },
];

describe("jhaStatus", () => {
  it("needs action with no records", () => {
    expect(jhaStatus([])).toBe("needs_action");
  });
  it("needs action with a pending row", () => {
    expect(
      jhaStatus([
        { completed_at: "2026-02-01T00:00:00Z", created_at: "2026-02-01T00:00:00Z" },
        { completed_at: null, created_at: "2026-03-01T00:00:00Z" },
      ]),
    ).toBe("needs_action");
  });
  it("is completed with only completed rows", () => {
    expect(
      jhaStatus([{ completed_at: "2026-02-01T00:00:00Z", created_at: "2026-02-01T00:00:00Z" }]),
    ).toBe("completed");
  });
});

describe("latestCompleted", () => {
  it("returns the newest completed record", () => {
    const rows = [
      { id: "a", completed_at: "2026-01-01T00:00:00Z" },
      { id: "b", completed_at: "2026-03-01T00:00:00Z" },
      { id: "c", completed_at: null },
    ];
    expect(latestCompleted(rows)?.id).toBe("b");
  });
  it("returns null when none are completed", () => {
    expect(latestCompleted([{ completed_at: null }])).toBeNull();
    expect(latestCompleted([])).toBeNull();
  });
});

describe("jhaProjectsForUser", () => {
  const jobs = [
    { id: "1", owner_id: "me", archived_at: null },
    { id: "2", owner_id: "x", archived_at: null },
    { id: "3", owner_id: "x", archived_at: null },
    { id: "4", owner_id: "me", archived_at: "2026-01-01T00:00:00Z" },
  ];
  it("keeps owned and collaborating projects and drops archived", () => {
    const out = jhaProjectsForUser(jobs, [{ job_id: "2", user_id: "me" }], "me");
    expect(out.map((j) => j.id)).toEqual(["1", "2"]);
  });
  it("ignores other users' collaborations", () => {
    const out = jhaProjectsForUser(jobs, [{ job_id: "3", user_id: "y" }], "me");
    expect(out.map((j) => j.id)).toEqual(["1"]);
  });
});

describe("groupProjectsByJha", () => {
  it("groups and sorts by name", () => {
    const jobs = [
      { id: "1", name: "Zeta" },
      { id: "2", name: "alpha" },
      { id: "3", name: "Beta" },
      { id: "4", name: "Gamma" },
    ];
    const records = [
      { job_id: "1", completed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
      { job_id: "3", completed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" },
      { job_id: "3", completed_at: null, created_at: "2026-02-01T00:00:00Z" },
    ];
    const out = groupProjectsByJha(jobs, records);
    expect(out.completed.map((j) => j.name)).toEqual(["Zeta"]);
    expect(out.needsAction.map((j) => j.name)).toEqual(["alpha", "Beta", "Gamma"]);
  });
});

describe("validateJhaSubmission", () => {
  it("returns an ordered snapshot and ignores unknown ids", () => {
    const out = validateJhaSubmission(
      templates,
      [
        { templateId: "t2", answer: "no" },
        { templateId: "t1", answer: "yes" },
        { templateId: "zzz", answer: "na" },
      ],
      SIG,
    );
    expect(out).toEqual({
      answers: [
        { template_id: "t1", prompt: "First", answer: "yes" },
        { template_id: "t2", prompt: "Second", answer: "no" },
      ],
      signature: SIG,
    });
  });
  it("requires templates", () => {
    expect(() => validateJhaSubmission([], [], SIG)).toThrow("No hazard items are set up yet");
  });
  it("requires every item answered with a valid answer", () => {
    expect(() =>
      validateJhaSubmission(templates, [{ templateId: "t1", answer: "yes" }], SIG),
    ).toThrow("Answer every hazard item");
    expect(() =>
      validateJhaSubmission(
        templates,
        [
          { templateId: "t1", answer: "yes" },
          { templateId: "t2", answer: "maybe" },
        ],
        SIG,
      ),
    ).toThrow("Answer every hazard item");
  });
  it("requires a PNG signature within the size cap", () => {
    const a = [
      { templateId: "t1", answer: "yes" },
      { templateId: "t2", answer: "yes" },
    ];
    expect(() => validateJhaSubmission(templates, a, null)).toThrow("Sign the JHA");
    expect(() => validateJhaSubmission(templates, a, "data:image/jpeg;base64,AA")).toThrow(
      "Sign the JHA",
    );
    expect(() =>
      validateJhaSubmission(templates, a, "data:image/png;base64," + "A".repeat(500000)),
    ).toThrow();
  });
});

describe("jhaPdfFileName", () => {
  it("builds the file name", () => {
    expect(jhaPdfFileName("Main St. Tower #2", "2026-05-04T12:00:00Z")).toBe(
      "Main_St_Tower_2-JHA-2026-05-04.pdf",
    );
  });
});
