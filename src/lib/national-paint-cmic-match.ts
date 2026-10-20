/**
 * National Paint CMiC matching. Pure helpers (no DOM, network or Supabase) that port the "CMiC Job #"
 * and "JobCost Match" formulas of the National Paint Scheduling Tool workbook, plus a ranking that
 * adds city and start date as re-ranking signals.
 */

export type CmicMatchJob = {
  job_code: string;
  job_name: string | null;
  customer_name: string | null;
  source: string;
  est_start?: string | null;
  actual_start?: string | null;
  job_start?: string | null;
};

export type CmicMatchProject = {
  name: string;
  city?: string | null;
  est_start?: string | null;
};

export type CmicConfidence = "high" | "medium" | "low";

export type CmicSuggestion = {
  job_code: string;
  job_name: string | null;
  score: number;
  confidence: CmicConfidence;
  note: string;
  reasons: string[];
};

export const MAX_SUGGESTIONS = 8;

const BRANDS: [string, string][] = [
  ["WALMART", "WALMART"],
  ["LOWE", "LOWE"],
  ["MENARDS", "MENARDS"],
  ["SAMS CLUB", "SAMS"],
  ["KIMCO", "KIMCO"],
  ["VALVOLINE", "VALVOLINE"],
];
const IGNORED_WORDS = new Set(["REPAINT", "REFRESH", "EXT", "INT", "FS"]);

/** The workbook `clean`: uppercase, GEESNER fixed, ( ) # - , / to spaces, apostrophes removed. */
export function cleanName(x: string): string {
  return x
    .toUpperCase()
    .replace(/GEESNER/g, "GESSNER")
    .replace(/[()#\-,/]/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Row = {
  job: CmicMatchJob;
  code: string;
  rawName: string;
  dn: string;
  words: Set<string>;
  cn: string;
};

const prepared = new WeakMap<readonly CmicMatchJob[], Row[]>();

/** Job-list rows with blank codes dropped, sorted by code with Budget & Cost first. */
function prepare(jobs: readonly CmicMatchJob[]): Row[] {
  const cached = prepared.get(jobs);
  if (cached) return cached;
  const rows: Row[] = [];
  for (const job of jobs) {
    const code = (job.job_code ?? "").trim();
    if (!code) continue;
    const rawName = (job.job_name ?? "").toUpperCase();
    const dn = cleanName(rawName);
    rows.push({
      job,
      code,
      rawName,
      dn,
      words: new Set(dn.split(" ")),
      cn: cleanName(job.customer_name ?? ""),
    });
  }
  rows.sort((a, b) => {
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    if (a.job.source === b.job.source) return 0;
    return a.job.source === "budget_cost" ? -1 : 1;
  });
  prepared.set(jobs, rows);
  return rows;
}

type Subject = {
  P: string;
  site: string;
  brand: string;
  nameWords: string[];
};

function subjectOf(projectName: string): Subject {
  // eslint-disable-next-line no-control-regex
  const P = projectName.toUpperCase().replace(/[\u0000-\u001f\u007f]/g, "");
  const pwords = cleanName(P).split(" ").filter(Boolean);
  const first = pwords[0] ?? "";
  const target = first.length === 5 && /^T\d{4}$/.test(first) ? first.slice(1) : "";
  const site = target || (pwords.find((w) => /^\d+(\.\d+)?$/.test(w)) ?? "");
  const brand = BRANDS.find(([needle]) => P.includes(needle))?.[1] ?? (target ? "TARGET" : "");
  const nameWords = pwords.filter((w) => w.length > 2 && !IGNORED_WORDS.has(w) && w !== brand);
  return { P, site, brand, nameWords };
}

function wordHits(s: Subject, row: Row): number {
  return s.nameWords.reduce((n, w) => n + (row.words.has(w) ? 1 : 0), 0);
}

function nameHit(s: Subject, row: Row): boolean {
  if (s.site) return row.words.has(s.site);
  return wordHits(s, row) >= (s.brand ? 1 : 2);
}

function brandHit(s: Subject, row: Row): boolean {
  if (!s.brand) return true;
  if (s.brand === "WALMART") {
    return row.dn.includes("WALMART") || row.rawName.includes("W#") || row.cn.includes("WALMART");
  }
  if (s.brand === "TARGET") {
    return row.dn.includes("TARGET") || row.cn.includes("TARGET") || row.dn.startsWith("T ");
  }
  return row.dn.includes(s.brand) || row.cn.includes(s.brand);
}

const isInt = (row: Row) => row.words.has("INT") || row.dn.includes("INTERIOR");
const isExt = (row: Row) => row.words.has("EXT") || row.dn.includes("EXTERIOR");

function candidateRows(s: Subject, rows: Row[]): Row[] {
  const base = rows.filter((r) => nameHit(s, r) && brandHit(s, r));
  if (s.P.includes(" INT")) {
    return base.some(isInt) ? base.filter(isInt) : base.filter((r) => !isExt(r));
  }
  if (s.P.includes(" EXT")) {
    return base.some(isExt) ? base.filter(isExt) : base.filter((r) => !isInt(r));
  }
  return base;
}

const distinctCodes = (rows: Row[]) => [...new Set(rows.map((r) => r.code))];

/** Distinct job codes of the workbook "CMiC Job #" candidate set, in code order. */
export function workbookCandidates(
  project: Pick<CmicMatchProject, "name">,
  jobs: readonly CmicMatchJob[],
): string[] {
  return distinctCodes(candidateRows(subjectOf(project.name), prepare(jobs)));
}

/** The single candidate code, or null when there are none or several. */
export function workbookMatch(
  project: Pick<CmicMatchProject, "name">,
  jobs: readonly CmicMatchJob[],
): string | null {
  const c = workbookCandidates(project, jobs);
  return c.length === 1 ? c[0] : null;
}

const strip = (s: string) => s.replace(/[#\- ]/g, "");

export type CmicMatchStatus = "Found - Job # + Code" | "Found - Job #" | "Found - Code" | "Missing";

/** The workbook "JobCost Match" status of a project's current job number. */
export function cmicMatchStatus(
  projectName: string,
  jobNumber: string | null | undefined,
  jobs: readonly CmicMatchJob[],
): CmicMatchStatus {
  const { P } = subjectOf(projectName);
  const firstWord = P.split(" ")[0] ?? "";
  const store = firstWord.length === 5 && firstWord.startsWith("T") ? firstWord.slice(-4) : "";
  const rows = prepare(jobs);
  const wanted = (jobNumber ?? "").trim().toUpperCase();
  const found = wanted ? rows.find((r) => r.code.toUpperCase() === wanted) : undefined;
  if (found) {
    return store && strip(found.rawName).includes(store) ? "Found - Job # + Code" : "Found - Job #";
  }
  if (store && rows.some((r) => strip(r.rawName).includes(store))) return "Found - Code";
  return "Missing";
}

const DAY = 86400000;

function dayNumber(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? null : Math.floor(t / DAY);
}

/** At most 8 suggested job codes for a project, best first. */
export function rankCmicMatches(
  project: CmicMatchProject,
  jobs: readonly CmicMatchJob[],
): CmicSuggestion[] {
  const s = subjectOf(project.name);
  const rows = prepare(jobs);
  const candidates = new Set(distinctCodes(candidateRows(s, rows)));
  const city = cleanName(project.city ?? "");
  const start = dayNumber(project.est_start);

  const byCode = new Map<string, Row[]>();
  for (const r of rows) {
    const list = byCode.get(r.code);
    if (list) list.push(r);
    else byCode.set(r.code, [r]);
  }

  const out: CmicSuggestion[] = [];
  for (const [code, list] of byCode) {
    const isCandidate = candidates.has(code);
    const siteHit = !!s.site && list.some((r) => r.words.has(s.site));
    const best = Math.max(...list.map((r) => wordHits(s, r)));
    if (!isCandidate && !siteHit && best < 1) continue;

    let score = 0;
    const reasons: string[] = [];
    if (isCandidate) score += 100;
    if (siteHit) {
      score += 30;
      reasons.push(`Store ${s.site}`);
    }
    if (s.brand && list.some((r) => brandHit(s, r))) {
      score += 10;
      reasons.push("Brand");
    }
    if (best > 0) {
      score += Math.min(best * 5, 20);
      reasons.push(`${best} name word${best === 1 ? "" : "s"}`);
    }
    if (city && list.some((r) => ` ${r.dn} `.includes(` ${city} `))) {
      score += 10;
      reasons.push("City");
    }
    if (start !== null) {
      const days = list
        .flatMap((r) => [r.job.est_start, r.job.actual_start, r.job.job_start])
        .map(dayNumber)
        .filter((d): d is number => d !== null)
        .map((d) => Math.abs(d - start));
      const nearest = days.length ? Math.min(...days) : null;
      if (nearest !== null && nearest <= 30) {
        score += 10;
        reasons.push("Start within 30 days");
      } else if (nearest !== null && nearest <= 90) {
        score += 5;
        reasons.push("Start within 90 days");
      }
    }

    let confidence: CmicConfidence = "low";
    let note = "Partial match";
    if (isCandidate && candidates.size === 1) {
      confidence = "high";
      note = "Only CMiC job that fits the workbook rule";
    } else if (isCandidate) {
      confidence = "medium";
      note = `Fits the workbook rule (${candidates.size} jobs fit)`;
    }
    const named = list.find((r) => r.job.job_name?.trim());
    out.push({
      job_code: code,
      job_name: named?.job.job_name?.trim() ?? null,
      score,
      confidence,
      note,
      reasons,
    });
  }
  out.sort((a, b) => b.score - a.score || (a.job_code < b.job_code ? -1 : 1));
  return out.slice(0, MAX_SUGGESTIONS);
}
