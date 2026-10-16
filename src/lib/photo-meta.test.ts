import { describe, expect, it } from "vitest";
import {
  formatTakenAt,
  normalizePhase,
  PHOTO_PHASES,
  phaseLabel,
  UNPHASED,
} from "@/lib/photo-meta";

describe("normalizePhase", () => {
  it("returns canonical labels unchanged", () => {
    for (const phase of PHOTO_PHASES) {
      expect(normalizePhase(phase)).toBe(phase);
    }
  });

  it("maps aliases onto canonical labels", () => {
    expect(normalizePhase("punchlist")).toBe("Punch List");
    expect(normalizePhase("punch")).toBe("Punch List");
    expect(normalizePhase("closeout")).toBe("Completion");
    expect(normalizePhase("close-out")).toBe("Completion");
    expect(normalizePhase("preconstruction")).toBe("Pre-Construction");
    expect(normalizePhase("mobilization")).toBe("Pre-Construction");
    expect(normalizePhase("rough-in")).toBe("Progress");
    expect(normalizePhase("in progress")).toBe("Progress");
    expect(normalizePhase("checklist")).toBe("Checklists");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(normalizePhase("  PUNCH LIST  ")).toBe("Punch List");
    expect(normalizePhase("\tCloseOut\n")).toBe("Completion");
    expect(normalizePhase("warranty")).toBe("Warranty");
  });

  it("returns null for unknown and empty values", () => {
    expect(normalizePhase("framing")).toBeNull();
    expect(normalizePhase(null)).toBeNull();
    expect(normalizePhase(undefined)).toBeNull();
    expect(normalizePhase("")).toBeNull();
  });
});

describe("phaseLabel", () => {
  it("returns the canonical label for known values", () => {
    expect(phaseLabel("punchlist")).toBe("Punch List");
    expect(phaseLabel("Inspection")).toBe("Inspection");
  });

  it("returns Unassigned for unknown values", () => {
    expect(UNPHASED).toBe("Unassigned");
    expect(phaseLabel("framing")).toBe("Unassigned");
    expect(phaseLabel(null)).toBe("Unassigned");
  });
});

describe("formatTakenAt", () => {
  it("returns Date unavailable for empty or invalid input", () => {
    expect(formatTakenAt(null)).toBe("Date unavailable");
    expect(formatTakenAt(undefined)).toBe("Date unavailable");
    expect(formatTakenAt("")).toBe("Date unavailable");
    expect(formatTakenAt("not a date")).toBe("Date unavailable");
  });

  it("formats valid dates with toLocaleString", () => {
    const iso = "2023-05-01T15:04:00.000Z";
    const expected = new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    expect(formatTakenAt(iso)).toBe(expected);
  });
});
