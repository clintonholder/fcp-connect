import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  save: vi.fn(),
  text: vi.fn(),
  addPage: vi.fn(),
}));

vi.mock("jspdf", () => {
  class FakeDoc {
    internal = { pageSize: { getWidth: () => 612, getHeight: () => 792 } };
    setFontSize() {
      return this;
    }
    setFont() {
      return this;
    }
    text = calls.text;
    splitTextToSize = (t: string) => [t];
    addPage = calls.addPage;
    save = calls.save;
  }
  return { jsPDF: FakeDoc };
});

import { generateSafetyAcknowledgementPdf } from "./safety-acknowledgement-pdf";
import type { AckReportEntry, Person } from "./safety-acknowledgements";

const person = (name: string): Person => ({
  id: name,
  name,
  isSubcontractor: false,
  isDisabled: false,
  canViewSafety: true,
});

const texts = () => calls.text.mock.calls.map((c) => String(c[0]));

describe("generateSafetyAcknowledgementPdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes each person name and saves with the dated file name", () => {
    const report: AckReportEntry[] = [
      {
        document: {
          id: "d1",
          title: "Acetone",
          category: "sds",
          version: null,
          revision: 3,
          archived: false,
          requires_acknowledgement: true,
          shareable_with_subs: false,
        },
        acknowledged: [{ person: person("Ann"), acknowledgedAt: "2026-10-17T12:00:00Z" }],
        pending: Array.from({ length: 60 }, (_, i) => person(`Pending ${i}`)),
      },
    ];
    generateSafetyAcknowledgementPdf(report);
    const all = texts();
    expect(all.some((t) => t.startsWith("Ann"))).toBe(true);
    expect(all).toContain("Pending 59");
    expect(all).toContain("Acknowledged (1)");
    expect(all).toContain("Not acknowledged (60)");
    expect(all.some((t) => t.includes("Revision 3"))).toBe(true);
    expect(calls.addPage).toHaveBeenCalled();
    expect(calls.save).toHaveBeenCalledWith(
      expect.stringMatching(/^Safety_Acknowledgements-\d{4}-\d{2}-\d{2}\.pdf$/),
    );
  });
});
