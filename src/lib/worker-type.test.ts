import { describe, expect, it } from "vitest";
import { normalizeWorkerType, workerTypeLabel } from "./worker-type";

describe("normalizeWorkerType", () => {
  it("returns a null name for an employee with no name", () => {
    expect(normalizeWorkerType({ workerType: "employee", subcontractorName: null })).toEqual({
      workerType: "employee",
      subcontractorName: null,
    });
  });

  it("drops the name for an employee", () => {
    expect(normalizeWorkerType({ workerType: "employee", subcontractorName: "Acme" })).toEqual({
      workerType: "employee",
      subcontractorName: null,
    });
  });

  it("throws for a subcontractor with a blank name", () => {
    const msg = "A Sub Contractor name is required";
    expect(() =>
      normalizeWorkerType({ workerType: "subcontractor", subcontractorName: "" }),
    ).toThrow(msg);
    expect(() =>
      normalizeWorkerType({ workerType: "subcontractor", subcontractorName: "   " }),
    ).toThrow(msg);
    expect(() =>
      normalizeWorkerType({ workerType: "subcontractor", subcontractorName: null }),
    ).toThrow(msg);
  });

  it("trims a subcontractor name", () => {
    expect(
      normalizeWorkerType({ workerType: "subcontractor", subcontractorName: "  Acme  " }),
    ).toEqual({ workerType: "subcontractor", subcontractorName: "Acme" });
  });

  it("throws for an invalid type", () => {
    expect(() => normalizeWorkerType({ workerType: "visitor", subcontractorName: null })).toThrow();
  });
});

describe("workerTypeLabel", () => {
  it("labels employees and subcontractors", () => {
    expect(workerTypeLabel({ workerType: "employee", subcontractorName: null })).toBe(
      "FCP Employee",
    );
    expect(workerTypeLabel({ workerType: "subcontractor", subcontractorName: "Acme" })).toBe(
      "Sub Contractor: Acme",
    );
  });
});
