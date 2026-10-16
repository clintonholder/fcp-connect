import { describe, expect, it } from "vitest";
import { zipFileName } from "@/lib/photo-export";

describe("zipFileName", () => {
  it("puts owner after customer", () => {
    expect(
      zipFileName({ owner: "Target", customer: "Crane Construction", name: "Store 12", cmic_number: "123" }),
    ).toBe("Crane Construction Target Store 12 - 123.zip");
  });

  it("is unchanged when owner is missing or blank", () => {
    const expected = "Crane Construction Store 12.zip";
    expect(zipFileName({ customer: "Crane Construction", name: "Store 12" })).toBe(expected);
    expect(zipFileName({ owner: "  ", customer: "Crane Construction", name: "Store 12" })).toBe(expected);
    expect(zipFileName({ owner: null, customer: "Crane Construction", name: "Store 12" })).toBe(expected);
  });

  it("sanitizes owner like the other parts", () => {
    const name = zipFileName({ owner: "Tar/get:*", customer: "Crane", name: "Store" });
    expect(name).not.toMatch(/[\/:*?"<>|]/);
    expect(name.startsWith("Crane ")).toBe(true);
    expect(name.endsWith(" Store.zip")).toBe(true);
  });
});
