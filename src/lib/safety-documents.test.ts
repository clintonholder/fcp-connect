import { describe, expect, it } from "vitest";
import {
  SAFETY_BUCKET,
  SAFETY_CATEGORY_LABEL,
  filterSafetyDocuments,
  safetyStoragePath,
  validateEffectiveDate,
  validateFilePath,
  validateSafetyInput,
  visibleToViewer,
} from "./safety-documents";

const row = (over: Partial<Parameters<typeof filterSafetyDocuments>[0][number]> = {}) => ({
  title: "Acetone",
  description: null,
  version: null,
  archived: false,
  shareable_with_subs: false,
  ...over,
});

describe("constants", () => {
  it("names the bucket and labels", () => {
    expect(SAFETY_BUCKET).toBe("safety-documents");
    expect(SAFETY_CATEGORY_LABEL.sds).toBe("SDS / MSDS");
    expect(SAFETY_CATEGORY_LABEL.first_aid).toBe("First aid");
  });
});

describe("filterSafetyDocuments", () => {
  const rows = [
    row({ title: "Zinc", description: "Galvanizing fumes" }),
    row({ title: "Acetone", version: "Rev 3" }),
    row({ title: "Bleach" }),
  ];

  it("returns all rows sorted by title for an empty query", () => {
    expect(filterSafetyDocuments(rows, "  ").map((r) => r.title)).toEqual([
      "Acetone",
      "Bleach",
      "Zinc",
    ]);
  });

  it("matches title, description and version case-insensitively after trimming", () => {
    expect(filterSafetyDocuments(rows, " BLEA ").map((r) => r.title)).toEqual(["Bleach"]);
    expect(filterSafetyDocuments(rows, "fumes").map((r) => r.title)).toEqual(["Zinc"]);
    expect(filterSafetyDocuments(rows, "rev 3").map((r) => r.title)).toEqual(["Acetone"]);
    expect(filterSafetyDocuments(rows, "nothing")).toEqual([]);
  });
});

describe("visibleToViewer", () => {
  const rows = [
    row({ title: "shared", shareable_with_subs: true }),
    row({ title: "internal" }),
    row({ title: "old", archived: true, shareable_with_subs: true }),
  ];
  const titles = (v: { canManage: boolean; isSubcontractor: boolean }) =>
    visibleToViewer(rows, v).map((r) => r.title);

  it("shows employees every non-archived row", () => {
    expect(titles({ canManage: false, isSubcontractor: false })).toEqual(["shared", "internal"]);
  });

  it("shows subcontractors only shareable non-archived rows", () => {
    expect(titles({ canManage: false, isSubcontractor: true })).toEqual(["shared"]);
  });

  it("shows managers every non-archived row, even a subcontractor manager", () => {
    expect(titles({ canManage: true, isSubcontractor: true })).toEqual(["shared", "internal"]);
  });
});

describe("safetyStoragePath", () => {
  it("prefixes a uuid and sanitizes the name", () => {
    const p = safetyStoragePath("Acetone SDS (v2).pdf");
    expect(p).toMatch(/^[0-9a-f-]{36}\/Acetone-SDS--v2-.pdf$/);
  });

  it("never yields an empty name and is unique", () => {
    expect(safetyStoragePath("").endsWith("/file")).toBe(true);
    expect(safetyStoragePath("a.pdf")).not.toBe(safetyStoragePath("a.pdf"));
  });
});

describe("validateSafetyInput", () => {
  const base = { title: "  Acetone ", category: "sds", filePath: "abc/a.pdf" };

  it("normalizes values", () => {
    expect(
      validateSafetyInput({
        ...base,
        description: "  ",
        version: " 2 ",
        effectiveDate: "2026-01-31",
      }),
    ).toEqual({
      title: "Acetone",
      category: "sds",
      description: null,
      version: "2",
      effectiveDate: "2026-01-31",
      shareableWithSubs: false,
      requiresAcknowledgement: false,
      filePath: "abc/a.pdf",
    });
  });

  it("defaults requiresAcknowledgement to false and accepts only true", () => {
    expect(validateSafetyInput(base).requiresAcknowledgement).toBe(false);
    const on = validateSafetyInput({ ...base, requiresAcknowledgement: true });
    expect(on.requiresAcknowledgement).toBe(true);
  });

  it("requires a title and a valid category", () => {
    expect(() => validateSafetyInput({ ...base, title: "  " })).toThrow("Title is required");
    expect(() => validateSafetyInput({ ...base, category: "nope" })).toThrow("Invalid category");
  });

  it("rejects bad dates and file paths", () => {
    expect(() => validateSafetyInput({ ...base, effectiveDate: "01/02/2026" })).toThrow(/date/);
    expect(() => validateEffectiveDate("2026-13-45")).toThrow(/date/);
    expect(validateEffectiveDate("")).toBeNull();
    expect(() => validateFilePath("")).toThrow("A file is required");
    expect(() => validateFilePath("/abs/a.pdf")).toThrow("Invalid file path");
    expect(() => validateFilePath("a/../b.pdf")).toThrow("Invalid file path");
  });
});
