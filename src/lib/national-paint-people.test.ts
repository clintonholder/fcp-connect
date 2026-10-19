import { describe, expect, it } from "vitest";
import {
  friendlyDbError,
  inUseMessage,
  isDuplicateName,
  validateCrew,
  validateCrewMember,
  validateName,
} from "@/lib/national-paint-people";

const crew = {
  name: "Crew Alpha",
  contractor_id: null,
  owner_name: null,
  crew_type: null,
  size: null,
  is_active: true,
};

describe("validateName", () => {
  it("trims", () => expect(validateName("  Pat Example  ")).toBe("Pat Example"));
  it("rejects blank and non-string", () => {
    expect(() => validateName("   ")).toThrow("required");
    expect(() => validateName(undefined)).toThrow("required");
  });
  it("rejects over 200 characters and accepts exactly 200", () => {
    expect(() => validateName("a".repeat(201))).toThrow("at most 200");
    expect(validateName("a".repeat(200))).toHaveLength(200);
  });
});

describe("validateCrew", () => {
  it("trims the name and owner, and blank owner becomes null", () => {
    const ok = validateCrew({ ...crew, name: "  Crew Beta ", owner_name: "  Sam Sample " });
    expect(ok.name).toBe("Crew Beta");
    expect(ok.owner_name).toBe("Sam Sample");
    expect(validateCrew({ ...crew, owner_name: "   " }).owner_name).toBeNull();
  });
  it("requires a name", () => {
    expect(() => validateCrew({ ...crew, name: " " })).toThrow("required");
  });
  it("accepts each crew type and null, rejects others", () => {
    for (const t of ["Project Manager", "In-House", "Sub-Contractor"]) {
      expect(validateCrew({ ...crew, crew_type: t }).crew_type).toBe(t);
    }
    expect(validateCrew({ ...crew, crew_type: null }).crew_type).toBeNull();
    expect(() => validateCrew({ ...crew, crew_type: "Other" })).toThrow("crew type");
  });
  it("accepts null and whole sizes, rejects negative and non-integer", () => {
    expect(validateCrew({ ...crew, size: null }).size).toBeNull();
    expect(validateCrew({ ...crew, size: 0 }).size).toBe(0);
    expect(() => validateCrew({ ...crew, size: -1 })).toThrow("whole number");
    expect(() => validateCrew({ ...crew, size: 2.5 })).toThrow("whole number");
    expect(() => validateCrew({ ...crew, size: "3" })).toThrow("whole number");
  });
  it("requires a boolean status and a string or null contractor", () => {
    expect(() => validateCrew({ ...crew, is_active: "yes" })).toThrow("status");
    expect(() => validateCrew({ ...crew, contractor_id: 5 })).toThrow("contractor");
    expect(validateCrew({ ...crew, contractor_id: "abc" }).contractor_id).toBe("abc");
  });
});

describe("validateCrewMember", () => {
  it("accepts foreman and tech and trims the name", () => {
    expect(validateCrewMember({ name: " Lee Sample ", role: "foreman" })).toEqual({
      name: "Lee Sample",
      role: "foreman",
    });
    expect(validateCrewMember({ name: "Kim Sample", role: "tech" }).role).toBe("tech");
  });
  it("rejects an invalid role and a blank name", () => {
    expect(() => validateCrewMember({ name: "Kim Sample", role: "boss" })).toThrow("Role");
    expect(() => validateCrewMember({ name: "", role: "tech" })).toThrow("required");
  });
});

describe("isDuplicateName", () => {
  const rows = [
    { id: "1", name: "Alpha Test" },
    { id: "2", name: "Beta Test" },
  ];
  it("detects case-insensitive duplicates", () => {
    expect(isDuplicateName("  ALPHA test ", rows)).toBe(true);
    expect(isDuplicateName("Gamma Test", rows)).toBe(false);
  });
  it("ignores the record being edited", () => {
    expect(isDuplicateName("alpha test", rows, "1")).toBe(false);
    expect(isDuplicateName("alpha test", rows, "2")).toBe(true);
  });
});

describe("inUseMessage and friendlyDbError", () => {
  it("describes what uses the record", () => {
    expect(inUseMessage(0, 0)).toBeNull();
    expect(inUseMessage(3)).toBe("Used by 3 projects. Reassign them before deleting.");
    expect(inUseMessage(1)).toContain("1 project.");
    expect(inUseMessage(0, 2)).toBe("Has 2 crews. Delete or move them first.");
  });
  it("maps 23505 and 23503", () => {
    expect(friendlyDbError({ code: "23505", message: "raw" }, "dup", "used").message).toBe("dup");
    expect(friendlyDbError({ code: "23503", message: "raw" }, "dup", "used").message).toBe("used");
    expect(friendlyDbError({ code: "x", message: "raw" }, "dup", "used").message).toBe("raw");
  });
});
