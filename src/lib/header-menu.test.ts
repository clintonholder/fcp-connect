import { describe, expect, it } from "vitest";
import { initialsFor, menuGroups, nationalPaintPageLabel } from "./header-menu";

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

  const npChildren = (isAdmin: boolean) =>
    menuGroups({ isAdmin, canManageNationalPaint: true }).navigate.find(
      (i) => i.label === "National Paint",
    )?.children;
  const baseLabels = [
    "Projects",
    "People and crews",
    "Project Timeline",
    "Crew Capacity",
    "Revenue",
    "Dashboard",
    "Finance",
    "Project Analysis",
    "CMiC",
  ];

  it("nests the National Paint pages without Import for non-admins", () => {
    expect(labels(npChildren(false) ?? null)).toEqual(baseLabels);
    expect(npChildren(false)?.[0]).toMatchObject({ to: "/national-paint", exact: true });
  });
  it("puts Import last for admins", () => {
    expect(labels(npChildren(true) ?? null)).toEqual([...baseLabels, "Import"]);
  });
  it("has no National Paint item without the permission", () => {
    const g = menuGroups({ isAdmin: true, canManageNationalPaint: false });
    expect(g.navigate.some((i) => i.children)).toBe(false);
  });
});

describe("nationalPaintPageLabel", () => {
  it("names the page for a National Paint path", () => {
    expect(nationalPaintPageLabel("/national-paint")).toBe("Projects");
    expect(nationalPaintPageLabel("/national-paint/")).toBe("Projects");
    expect(nationalPaintPageLabel("/national-paint/analysis")).toBe("Project Analysis");
    expect(nationalPaintPageLabel("/national-paint/import")).toBe("Import");
  });
  it("gives null for other paths", () => {
    expect(nationalPaintPageLabel("/projects")).toBeNull();
    expect(nationalPaintPageLabel("/national-paintx")).toBeNull();
  });
});
