import { describe, expect, it } from "vitest";
import { initialsFor, menuGroups } from "./header-menu";

describe("initialsFor", () => {
  it("uses first and last words", () => {
    expect(initialsFor("Jane Q Doe")).toBe("JD");
  });
  it("gives one letter for one word", () => {
    expect(initialsFor("jane")).toBe("J");
  });
  it("uses the local part of an email", () => {
    const r = initialsFor("jane.doe@x.com");
    expect(r).toMatch(/^[A-Z]+$/);
    expect(r).toBe("JD");
  });
  it("gives ? for blank", () => {
    expect(initialsFor("  ")).toBe("?");
    expect(initialsFor("")).toBe("?");
  });
});

describe("menuGroups", () => {
  const labels = (g: { label: string }[] | null) => g?.map((i) => i.label);

  it("has the base navigate items and no admin group", () => {
    const g = menuGroups({ isAdmin: false, canManageNationalPaint: false });
    expect(labels(g.navigate)).toEqual(["Home", "Projects", "Map", "Messages", "Safety"]);
    expect(g.admin).toBeNull();
  });
  it("adds National Paint after Safety", () => {
    const g = menuGroups({ isAdmin: false, canManageNationalPaint: true });
    expect(labels(g.navigate)?.at(-1)).toBe("National Paint");
    expect(labels(g.navigate)?.at(-2)).toBe("Safety");
  });
  it("adds the admin group for admins", () => {
    const g = menuGroups({ isAdmin: true, canManageNationalPaint: false });
    expect(g.admin?.map((i) => i.to)).toContain("/admin");
  });
});
