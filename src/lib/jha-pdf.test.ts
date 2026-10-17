import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  save: vi.fn(),
  addImage: vi.fn(),
  text: vi.fn(),
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
    addPage() {
      return this;
    }
    addImage = calls.addImage;
    save = calls.save;
  }
  return { jsPDF: FakeDoc };
});

import { generateJhaPdf } from "./jha-pdf";

describe("generateJhaPdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds the signature and saves with the expected name", () => {
    const signature = "data:image/png;base64,AAAA";
    generateJhaPdf({
      job: { name: "Main St", owner: "Owner Co", address: "1 Main St" },
      record: {
        completed_at: "2026-05-04T12:00:00Z",
        answers: [{ template_id: "t1", prompt: "Fall protection in place?", answer: "yes" }],
        signature,
      },
      completedByName: "Pat",
    });
    expect(calls.addImage).toHaveBeenCalledWith(
      signature,
      "PNG",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(calls.save).toHaveBeenCalledWith("Main_St-JHA-2026-05-04.pdf");
    expect(calls.text).toHaveBeenCalledWith(
      "Job Hazard Analysis",
      expect.any(Number),
      expect.any(Number),
    );
  });
});
