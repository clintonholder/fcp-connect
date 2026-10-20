import { describe, expect, it } from "vitest";
import {
  cleanName,
  cmicMatchStatus,
  rankCmicMatches,
  workbookCandidates,
  workbookMatch,
  type CmicMatchJob,
} from "@/lib/national-paint-cmic-match";

const job = (
  job_code: string,
  job_name: string | null,
  customer_name: string | null = null,
  source = "cost_summaries",
  extra: Partial<CmicMatchJob> = {},
): CmicMatchJob => ({ job_code, job_name, customer_name, source, ...extra });

const p = (name: string, extra: { city?: string; est_start?: string } = {}) => ({ name, ...extra });

describe("cleanName", () => {
  it("replaces punctuation with spaces, drops apostrophes and collapses spaces", () => {
    expect(cleanName("Lowe's #1234 - Main St, (Repaint)/Ext")).toBe(
      "LOWES 1234 MAIN ST REPAINT EXT",
    );
  });

  it("fixes GEESNER", () => {
    expect(cleanName("Geesner Rd")).toBe("GESSNER RD");
  });
});

describe("site", () => {
  it("uses the Target store code as the site", () => {
    const jobs = [job("1", "T-1234 Springfield"), job("2", "T-9999 Elsewhere")];
    expect(workbookCandidates(p("T1234 Springfield Repaint"), jobs)).toEqual(["1"]);
  });

  it("uses the first numeric word as the site", () => {
    const jobs = [job("1", "Store 456 Main"), job("2", "Store 457 Main")];
    expect(workbookCandidates(p("Acme 456 Main"), jobs)).toEqual(["1"]);
  });

  it("matches the site as a whole word only", () => {
    expect(workbookCandidates(p("Acme 45"), [job("1", "Store 456")])).toEqual([]);
  });
});

describe("brand", () => {
  it("applies Walmart to the name, the W# marker and the customer", () => {
    const jobs = [
      job("1", "Walmart 100 Dallas"),
      job("2", "W#100 Dallas"),
      job("3", "Dallas 100", "Walmart Stores"),
      job("4", "Dallas 100", "Other Co"),
    ];
    expect(workbookCandidates(p("Walmart 100 Dallas"), jobs)).toEqual(["1", "2", "3"]);
  });

  it("applies Target by name, customer or a leading T", () => {
    const jobs = [
      job("1", "Target 1234 Reno"),
      job("2", "Reno 1234", "Target Corp"),
      job("3", "T 1234 Reno"),
      job("4", "Reno 1234"),
    ];
    expect(workbookCandidates(p("T1234 Reno"), jobs)).toEqual(["1", "2", "3"]);
  });

  it("applies the other brands to the name or the customer", () => {
    const jobs = [
      job("1", "Lowes 22 Tulsa"),
      job("2", "Tulsa 22", "Lowes"),
      job("3", "Tulsa 22 Menards"),
    ];
    expect(workbookCandidates(p("Lowes 22 Tulsa"), jobs)).toEqual(["1", "2"]);
  });

  it("maps SAMS CLUB to the SAMS brand and does not see Sam's Club", () => {
    const jobs = [job("1", "Sams 77 Ogden"), job("2", "Ogden 77")];
    expect(workbookCandidates(p("Sams Club 77 Ogden"), jobs)).toEqual(["1"]);
    // The brand is read from the uncleaned name, so the apostrophe hides it.
    expect(workbookCandidates(p("Sam's Club 77 Ogden"), jobs)).toEqual(["1", "2"]);
  });

  it("excludes the brand from the name words", () => {
    // Only "KIMCO" would be a word hit; with it excluded there are no name words, so no site, no hit.
    expect(workbookCandidates(p("Kimco Plaza"), [job("1", "Kimco Other")])).toEqual([]);
    expect(workbookCandidates(p("Kimco Plaza"), [job("1", "Kimco Plaza")])).toEqual(["1"]);
  });
});

describe("name word thresholds", () => {
  const jobs = [job("1", "Maple Grove Plaza"), job("2", "Maple Court")];

  it("needs two name words when there is no brand", () => {
    expect(workbookCandidates(p("Maple Grove Repaint"), jobs)).toEqual(["1"]);
    expect(workbookCandidates(p("Maple"), jobs)).toEqual([]);
  });

  it("needs one name word when there is a brand", () => {
    const withBrand = [job("1", "Maple Kimco"), job("2", "Maple")];
    expect(workbookCandidates(p("Kimco Maple"), withBrand)).toEqual(["1"]);
  });

  it("ignores short words and REPAINT, REFRESH, EXT, INT and FS", () => {
    expect(workbookCandidates(p("Maple Repaint Ext FS"), jobs)).toEqual([]);
  });

  it("counts a repeated word each time", () => {
    expect(workbookCandidates(p("Maple Maple"), [job("1", "Maple Hall")])).toEqual(["1"]);
  });
});

describe("phase filter", () => {
  const jobs = [
    job("1", "Maple Grove Interior"),
    job("2", "Maple Grove Exterior"),
    job("3", "Maple Grove"),
  ];

  it("keeps interior jobs when the project is INT and one exists", () => {
    expect(workbookCandidates(p("Maple Grove INT"), jobs)).toEqual(["1"]);
  });

  it("keeps jobs that are not exterior when no interior job exists", () => {
    expect(workbookCandidates(p("Maple Grove INT"), jobs.slice(1))).toEqual(["3"]);
  });

  it("keeps exterior jobs when the project is EXT and one exists", () => {
    expect(workbookCandidates(p("Maple Grove EXT"), jobs)).toEqual(["2"]);
  });

  it("keeps jobs that are not interior when no exterior job exists", () => {
    expect(workbookCandidates(p("Maple Grove EXT"), [jobs[0], jobs[2]])).toEqual(["3"]);
  });

  it("keeps everything without a phase", () => {
    expect(workbookCandidates(p("Maple Grove"), jobs)).toEqual(["1", "2", "3"]);
  });
});

describe("workbookMatch", () => {
  it("returns the code for exactly one candidate", () => {
    expect(workbookMatch(p("Maple Grove"), [job("1", "Maple Grove")])).toBe("1");
  });

  it("returns null for none or several", () => {
    expect(workbookMatch(p("Maple Grove"), [job("1", "Other Place")])).toBeNull();
    expect(
      workbookMatch(p("Maple Grove"), [job("1", "Maple Grove"), job("2", "Grove Maple")]),
    ).toBeNull();
  });

  it("counts a job in both reports once", () => {
    const jobs = [
      job("1", "Maple Grove", "Acme", "budget_cost"),
      job("1", "Maple Grove Plaza", null, "cost_summaries"),
    ];
    expect(workbookCandidates(p("Maple Grove"), jobs)).toEqual(["1"]);
    expect(workbookMatch(p("Maple Grove"), jobs)).toBe("1");
  });
});

describe("cmicMatchStatus", () => {
  const jobs = [
    job("10.1", "Reno T1234 Main", null, "budget_cost"),
    job("10.1", "Other", null, "cost_summaries"),
    job("20.2", "Plain Store"),
    job("30.3", "Reno 1234"),
  ];

  it("is 'Found - Job # + Code' when the job and the store code both match", () => {
    expect(cmicMatchStatus("T1234 Reno", " 10.1 ", jobs)).toBe("Found - Job # + Code");
  });

  it("uses the Budget & Cost row first for a job in both reports", () => {
    const reversed = [...jobs].reverse();
    expect(cmicMatchStatus("T1234 Reno", "10.1", reversed)).toBe("Found - Job # + Code");
  });

  it("is 'Found - Job #' when only the job number matches", () => {
    expect(cmicMatchStatus("T1234 Reno", "20.2", jobs)).toBe("Found - Job #");
    expect(cmicMatchStatus("Plain", "20.2", jobs)).toBe("Found - Job #");
  });

  it("is 'Found - Code' when the job number is wrong but the store code is in a name", () => {
    expect(cmicMatchStatus("T1234 Reno", "99.9", jobs)).toBe("Found - Code");
    expect(cmicMatchStatus("T1234 Reno", null, jobs)).toBe("Found - Code");
  });

  it("is 'Missing' otherwise", () => {
    expect(cmicMatchStatus("T7777 Reno", "99.9", jobs)).toBe("Missing");
    expect(cmicMatchStatus("Plain", "", jobs)).toBe("Missing");
  });
});

describe("rankCmicMatches", () => {
  it("ranks the workbook candidate first as a high confidence match", () => {
    const jobs = [job("1", "Maple Grove Plaza"), job("2", "Maple Oak")];
    const [top, second] = rankCmicMatches(p("Maple Grove Plaza"), jobs);
    expect(top).toMatchObject({
      job_code: "1",
      confidence: "high",
      note: "Only CMiC job that fits the workbook rule",
    });
    expect(top.reasons).toContain("3 name words");
    expect(second).toMatchObject({ job_code: "2", confidence: "low", note: "Partial match" });
  });

  it("marks several candidates as medium with the count", () => {
    const jobs = [job("1", "Maple Grove"), job("2", "Grove Maple")];
    const list = rankCmicMatches(p("Maple Grove"), jobs);
    expect(list.map((s) => s.confidence)).toEqual(["medium", "medium"]);
    expect(list[0].note).toBe("Fits the workbook rule (2 jobs fit)");
  });

  it("scores the candidate, site, brand and name words", () => {
    const jobs = [job("1", "Kimco 55 Maple")];
    const [s] = rankCmicMatches(p("Kimco 55 Maple"), jobs);
    expect(s.score).toBe(100 + 30 + 10 + 5);
    expect(s.reasons).toEqual(["Store 55", "Brand", "1 name word"]);
  });

  it("lists a site hit that is not a workbook candidate as low", () => {
    const jobs = [job("1", "Walmart 55"), job("2", "Other 55")];
    const list = rankCmicMatches(p("Walmart 55"), jobs);
    expect(list.find((s) => s.job_code === "2")).toMatchObject({ confidence: "low", score: 30 });
  });

  it("re-ranks by city", () => {
    const jobs = [job("1", "Maple Grove Dallas"), job("2", "Maple Grove Austin")];
    const list = rankCmicMatches(p("Maple Grove", { city: "Austin" }), jobs);
    expect(list.map((s) => s.job_code)).toEqual(["2", "1"]);
    expect(list[0].reasons).toContain("City");
  });

  it("re-ranks by start date within 30 and 90 days", () => {
    const jobs = [
      job("1", "Maple Grove", null, "budget_cost", { est_start: "2026-06-01" }),
      job("2", "Maple Grove", null, "budget_cost", { actual_start: "2026-03-20" }),
      job("3", "Maple Grove", null, "cost_summaries", { job_start: "2025-06-01" }),
    ];
    const list = rankCmicMatches(p("Maple Grove", { est_start: "2026-03-10" }), jobs);
    expect(list.map((s) => s.job_code)).toEqual(["2", "1", "3"]);
    expect(list[0].reasons).toContain("Start within 30 days");
    expect(list[1].reasons).toContain("Start within 90 days");
    expect(list[2].reasons).not.toContain("Start within 90 days");
  });

  it("sorts ties by job code and caps the list at 8", () => {
    const jobs = Array.from({ length: 12 }, (_, i) =>
      job(`J${String(11 - i).padStart(2, "0")}`, "Maple Grove"),
    );
    const list = rankCmicMatches(p("Maple Grove"), jobs);
    expect(list).toHaveLength(8);
    expect(list.map((s) => s.job_code)).toEqual([
      "J00",
      "J01",
      "J02",
      "J03",
      "J04",
      "J05",
      "J06",
      "J07",
    ]);
  });

  it("returns nothing when no job fits", () => {
    expect(rankCmicMatches(p("Maple Grove"), [job("1", "Elsewhere")])).toEqual([]);
  });
});
