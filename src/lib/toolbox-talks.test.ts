import { describe, expect, it } from "vitest";
import {
  groupTalks,
  localDateString,
  talkDueState,
  toolboxPdfFileName,
  TOOLBOX_MAX_ATTENDEES,
  TOOLBOX_SIGNATURE_MAX,
  validateAttendees,
  validateTopic,
} from "./toolbox-talks";

const sig = "data:image/png;base64,AAAA";

describe("localDateString", () => {
  it("formats the local date with zero padding", () => {
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
});

describe("talkDueState", () => {
  it("is due on or before today and scheduled after", () => {
    expect(talkDueState("2026-05-03", "2026-05-04")).toBe("due");
    expect(talkDueState("2026-05-04", "2026-05-04")).toBe("due");
    expect(talkDueState("2026-05-05", "2026-05-04")).toBe("scheduled");
  });
});

describe("groupTalks", () => {
  const t = (
    id: string,
    job_id: string,
    talk_date: string,
    completed_at: string | null,
    created_at: string,
  ) => ({ id, job_id, talk_date, completed_at, created_at });

  it("filters by project and sorts both lists", () => {
    const talks = [
      t("i2", "a", "2026-05-02", null, "2026-04-01T00:00:00Z"),
      t("i1b", "a", "2026-05-01", null, "2026-04-02T00:00:00Z"),
      t("i1a", "a", "2026-05-01", null, "2026-04-01T00:00:00Z"),
      t("other", "z", "2026-05-01", null, "2026-04-01T00:00:00Z"),
      t("c1", "a", "2026-04-01", "2026-04-01T10:00:00Z", "2026-03-01T00:00:00Z"),
      t("c2", "a", "2026-04-02", "2026-04-02T10:00:00Z", "2026-03-01T00:00:00Z"),
      t("cother", "z", "2026-04-02", "2026-04-02T10:00:00Z", "2026-03-01T00:00:00Z"),
    ];
    const { incomplete, completed } = groupTalks(talks, new Set(["a"]));
    expect(incomplete.map((x) => x.id)).toEqual(["i1a", "i1b", "i2"]);
    expect(completed.map((x) => x.id)).toEqual(["c2", "c1"]);
  });
});

describe("validateTopic", () => {
  it("trims and nulls a blank body", () => {
    expect(validateTopic({ title: "  Ladders ", body: "  Check feet " })).toEqual({
      title: "Ladders",
      body: "Check feet",
    });
    expect(validateTopic({ title: "x", body: "   " })).toEqual({ title: "x", body: null });
  });

  it("rejects a blank or long title and a long body", () => {
    expect(() => validateTopic({ title: "  ", body: null })).toThrow("Enter a topic title");
    expect(() => validateTopic({ title: "a".repeat(201), body: null })).toThrow("200");
    expect(() => validateTopic({ title: "a", body: "b".repeat(10001) })).toThrow("10000");
  });
});

describe("validateAttendees", () => {
  it("trims names", () => {
    expect(validateAttendees([{ name: " Sam ", signature: sig }])).toEqual([
      { name: "Sam", signature: sig },
    ]);
  });

  it("requires at least one attendee", () => {
    expect(() => validateAttendees([])).toThrow("Add at least one attendee");
    expect(() => validateAttendees(undefined)).toThrow("Add at least one attendee");
  });

  it("rejects too many attendees", () => {
    const many = Array.from({ length: TOOLBOX_MAX_ATTENDEES + 1 }, () => ({
      name: "a",
      signature: sig,
    }));
    expect(() => validateAttendees(many)).toThrow("Too many attendees");
  });

  it("rejects missing names or bad signatures", () => {
    const msg = "Every attendee needs a name and signature";
    expect(() => validateAttendees([{ name: " ", signature: sig }])).toThrow(msg);
    expect(() => validateAttendees([{ name: "a" }])).toThrow(msg);
    expect(() => validateAttendees([{ name: "a", signature: "http://x" }])).toThrow(msg);
    expect(() =>
      validateAttendees([{ name: "a", signature: sig + "A".repeat(TOOLBOX_SIGNATURE_MAX) }]),
    ).toThrow(msg);
    expect(() => validateAttendees([{ name: "a".repeat(201), signature: sig }])).toThrow(msg);
  });
});

describe("toolboxPdfFileName", () => {
  it("replaces non-alphanumerics", () => {
    expect(toolboxPdfFileName("Main St. #2", "2026-05-04")).toBe(
      "Main_St_2-Toolbox_Talk-2026-05-04.pdf",
    );
  });
});
