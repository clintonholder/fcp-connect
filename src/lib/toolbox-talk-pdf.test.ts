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

import { generateToolboxTalkPdf } from "./toolbox-talk-pdf";

describe("generateToolboxTalkPdf", () => {
  beforeEach(() => vi.clearAllMocks());

  it("adds one signature per attendee and saves with the expected name", () => {
    const attendees = Array.from({ length: 20 }, (_, i) => ({
      name: `Person ${i}`,
      signature: `data:image/png;base64,SIG${i}`,
    }));
    generateToolboxTalkPdf({
      job: { name: "Main St", owner: "Owner Co" },
      talk: {
        topic_title: "Ladders",
        talk_date: "2026-05-04",
        completed_at: "2026-05-04T12:00:00Z",
        notes: "All good",
        attendees,
      },
      ledByName: "Pat",
    });
    expect(calls.addImage).toHaveBeenCalledTimes(20);
    attendees.forEach((a, i) => {
      expect(calls.addImage.mock.calls[i][0]).toBe(a.signature);
      expect(calls.addImage.mock.calls[i][1]).toBe("PNG");
    });
    expect(calls.save).toHaveBeenCalledWith("Main_St-Toolbox_Talk-2026-05-04.pdf");
    expect(calls.text).toHaveBeenCalledWith(
      "Toolbox Talk Sign-In Sheet",
      expect.any(Number),
      expect.any(Number),
    );
  });
});
