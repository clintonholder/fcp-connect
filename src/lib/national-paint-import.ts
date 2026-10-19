import JSZip from "jszip";

/**
 * National Paint Scheduling Tool import. Browser only: the workbook is read here and only the
 * parsed payload is sent to the server (see national-paint.functions.ts). The first part below
 * reads the .xlsm/.xlsx zip with jszip and DOMParser; the second part is pure helpers (no DOM,
 * network or Supabase) that turn the raw tables into an import payload and a problems report.
 */

/* ------------------------------ types ------------------------------ */

export const NP_STATUSES = [
  "Potential",
  "Verbal Award",
  "Upcoming",
  "Scheduled",
  "In Progress",
  "Completed",
] as const;
export type NpStatus = (typeof NP_STATUSES)[number];

export const NP_CREW_TYPES = ["Project Manager", "In-House", "Sub-Contractor"] as const;

/** An Excel table: header names, one record per row, and the sheet row of the first record. */
export type RawTable = {
  headers: string[];
  rows: Record<string, unknown>[];
  firstRow: number;
};

export type WorkbookData = {
  pms: RawTable | null;
  crews: RawTable | null;
  projects: RawTable | null;
  /** Every non-empty cell of Dashboard row 24, left to right. */
  budgetCells: unknown[] | null;
  /** Missing tables or sheets. */
  errors: string[];
};

export type ImportPayload = {
  budget_year: number;
  pms: { name: string }[];
  contractors: { name: string }[];
  crews: {
    name: string;
    contractor: string | null;
    owner_name: string | null;
    crew_type: string | null;
    size: number | null;
  }[];
  projects: {
    cmic_job_number: string | null;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    pm: string | null;
    contractor: string | null;
    crew: string | null;
    status: NpStatus;
    progress: number | null;
    est_start: string | null;
    est_end: string | null;
    deadline: string | null;
    est_revenue: number | null;
    notes: string | null;
    tag: string | null;
    exclude_revenue: boolean;
    bonus_eligible: boolean;
  }[];
  budget: { month: number; amount: number }[];
};

export type ImportProblem = { table: string; row: number | null; message: string };

export type ImportReport = {
  problems: ImportProblem[];
  duplicateCrews: { contractor: string | null; name: string; rows: number[] }[];
  unmappedColumns: { table: string; columns: string[] }[];
  missingFields: { table: string; fields: string[] }[];
  pmsAddedFromProjects: string[];
};

/* ------------------------- browser-only reader ------------------------- */

const BUDGET_SHEET = "Dashboard";
const BUDGET_ROW = 24;

const parseXml = (text: string) => new DOMParser().parseFromString(text, "application/xml");

/** Resolves a relationship target against the part that owns the rels file. */
function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `${baseDir}/${target}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function splitRef(ref: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  if (!m) throw new Error(`Bad cell reference ${ref}`);
  return { col: columnIndex(m[1]), row: Number(m[2]) };
}

/** Text of a shared or inline string item, skipping phonetic runs. */
function itemText(el: Element): string {
  let text = "";
  for (const t of Array.from(el.getElementsByTagName("t"))) {
    if (t.parentElement?.localName === "rPh") continue;
    text += t.textContent ?? "";
  }
  return text;
}

type Cells = Map<number, Map<number, unknown>>;

function readCells(sheetDoc: Document, shared: string[]): Cells {
  const cells: Cells = new Map();
  for (const c of Array.from(sheetDoc.getElementsByTagName("c"))) {
    const ref = c.getAttribute("r");
    if (!ref) continue;
    const type = c.getAttribute("t");
    const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
    let value: unknown = null;
    if (type === "s") value = shared[Number(v)] ?? null;
    else if (type === "inlineStr") {
      const is = c.getElementsByTagName("is")[0];
      value = is ? itemText(is) : null;
    } else if (type === "b") value = v === "1";
    else if (type === "str") value = v;
    else if (type === "e") value = null;
    else if (v !== "") value = Number(v);
    if (value === null || value === "") continue;
    const { col, row } = splitRef(ref);
    if (!cells.has(row)) cells.set(row, new Map());
    cells.get(row)!.set(col, value);
  }
  return cells;
}

/** Reads the three tables and the budget row from a workbook. Missing parts become errors. */
export async function readWorkbook(file: Blob): Promise<WorkbookData> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const text = async (path: string) => {
    const f = zip.file(path);
    return f ? await f.async("string") : null;
  };

  const workbookXml = await text("xl/workbook.xml");
  const workbookRels = await text("xl/_rels/workbook.xml.rels");
  if (!workbookXml || !workbookRels) throw new Error("This is not an Excel workbook.");

  const relTargets = new Map<string, string>();
  for (const r of Array.from(parseXml(workbookRels).getElementsByTagName("Relationship"))) {
    relTargets.set(r.getAttribute("Id") ?? "", resolvePart("xl", r.getAttribute("Target") ?? ""));
  }
  const sheets = new Map<string, string>();
  for (const s of Array.from(parseXml(workbookXml).getElementsByTagName("sheet"))) {
    const id = s.getAttribute("r:id");
    const target = id ? relTargets.get(id) : undefined;
    if (target) sheets.set(s.getAttribute("name") ?? "", target);
  }

  const sharedXml = await text("xl/sharedStrings.xml");
  const shared = sharedXml
    ? Array.from(parseXml(sharedXml).getElementsByTagName("si")).map(itemText)
    : [];

  // Tables by name, with the sheet that links to each one.
  const tableSheet = new Map<string, { sheet: string; doc: Document }>();
  for (const [, sheetPath] of sheets) {
    const dir = sheetPath.slice(0, sheetPath.lastIndexOf("/"));
    const relsXml = await text(
      `${dir}/_rels/${sheetPath.slice(sheetPath.lastIndexOf("/") + 1)}.rels`,
    );
    if (!relsXml) continue;
    for (const r of Array.from(parseXml(relsXml).getElementsByTagName("Relationship"))) {
      if (!(r.getAttribute("Type") ?? "").endsWith("/table")) continue;
      const tablePath = resolvePart(dir, r.getAttribute("Target") ?? "");
      const tableXml = await text(tablePath);
      if (!tableXml) continue;
      const doc = parseXml(tableXml);
      const root = doc.documentElement;
      for (const n of [root.getAttribute("name"), root.getAttribute("displayName")]) {
        if (n) tableSheet.set(n, { sheet: sheetPath, doc });
      }
    }
  }

  const sheetCells = new Map<string, Cells>();
  const cellsOf = async (sheetPath: string) => {
    if (!sheetCells.has(sheetPath)) {
      const xml = await text(sheetPath);
      sheetCells.set(sheetPath, xml ? readCells(parseXml(xml), shared) : new Map());
    }
    return sheetCells.get(sheetPath)!;
  };

  const errors: string[] = [];
  const readTable = async (name: string): Promise<RawTable | null> => {
    const found = tableSheet.get(name);
    if (!found) {
      errors.push(`Table ${name} was not found in the workbook.`);
      return null;
    }
    const root = found.doc.documentElement;
    const ref = root.getAttribute("ref") ?? "";
    const [start, end] = ref.split(":");
    if (!start || !end) {
      errors.push(`Table ${name} has no range.`);
      return null;
    }
    const a = splitRef(start);
    const b = splitRef(end);
    const totals = Number(root.getAttribute("totalsRowCount") ?? 0);
    const cells = await cellsOf(found.sheet);
    const headers = Array.from(found.doc.getElementsByTagName("tableColumn")).map(
      (c) => c.getAttribute("name") ?? "",
    );
    const rows: Record<string, unknown>[] = [];
    for (let r = a.row + 1; r <= b.row - totals; r++) {
      const record: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        record[h] = cells.get(r)?.get(a.col + i) ?? null;
      });
      rows.push(record);
    }
    return { headers, rows, firstRow: a.row + 1 };
  };

  const pms = await readTable("tblPMs");
  const crews = await readTable("tblCrews");
  const projects = await readTable("tblProjects");

  let budgetCells: unknown[] | null = null;
  const budgetSheet = sheets.get(BUDGET_SHEET);
  if (!budgetSheet) errors.push(`Sheet ${BUDGET_SHEET} was not found in the workbook.`);
  else {
    const row = (await cellsOf(budgetSheet)).get(BUDGET_ROW);
    budgetCells = row ? [...row.keys()].sort((x, y) => x - y).map((k) => row.get(k)) : [];
  }

  return { pms, crews, projects, budgetCells, errors };
}

/** Table row number as shown in Excel for the table's nth record. */
export const tableRowNumber = (table: RawTable, index: number) => table.firstRow + index;

/* ------------------------------ pure helpers ------------------------------ */

/** Lowercase letters and digits only, so "CMiC Job #" and "cmic job" compare equal. */
export function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Header aliases per target field, compared with normalizeHeader. Earlier aliases win. A header
 * is used by at most one field.
 */
export const PROJECT_ALIASES = {
  cmic_job_number: ["CMiC Job #", "CMiC Job Number", "CMiC Job No", "Job Number", "Job #"],
  name: ["Project Name", "Project", "Job Name", "Name"],
  address: ["Project Address, City, State", "Project Address", "Address", "Street Address"],
  city: ["City"],
  state: ["State"],
  pm: ["PM", "PM Name", "Project Manager"],
  contractor: ["Contractor"],
  crew: ["Crew", "Crew Name"],
  status: ["Status", "Project Status"],
  progress: ["Progress", "% Complete", "Percent Complete"],
  est_start: ["Est Start", "Estimated Start", "Start Date", "Start"],
  est_end: ["Est End", "Estimated End", "End Date", "End"],
  deadline: ["Deadline", "Due Date"],
  est_revenue: ["Est Revenue", "Estimated Revenue"],
  notes: ["Notes", "Note"],
  tag: ["Tag", "Tags"],
  exclude_revenue: ["Exclude Revenue"],
  bonus_eligible: ["Bonus Eligible"],
} as const;

export const CREW_ALIASES = {
  contractor: ["Contractor"],
  owner_name: ["Crew Owner", "Owner"],
  name: ["Crew Name", "Crew", "Name"],
  crew_type: ["Crew Type", "Type"],
  size: ["Size", "Crew Size"],
} as const;

export const PM_ALIASES = {
  name: ["PM Name", "PM", "Project Manager", "Name"],
} as const;

export type HeaderMapping<F extends string> = {
  /** Field to the table header it was found in. */
  fields: Partial<Record<F, string>>;
  unmappedColumns: string[];
  missingFields: F[];
};

export function mapHeaders<F extends string>(
  headers: string[],
  aliases: Record<F, readonly string[]>,
): HeaderMapping<F> {
  const byNorm = new Map<string, string>();
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (n && !byNorm.has(n)) byNorm.set(n, h);
  }
  const used = new Set<string>();
  const fields: Partial<Record<F, string>> = {};
  const missingFields: F[] = [];
  for (const field of Object.keys(aliases) as F[]) {
    const header = aliases[field]
      .map((a) => byNorm.get(normalizeHeader(a)))
      .find((h): h is string => h !== undefined && !used.has(h));
    if (header === undefined) missingFields.push(field);
    else {
      fields[field] = header;
      used.add(header);
    }
  }
  return {
    fields,
    unmappedColumns: headers.filter((h) => h && !used.has(h)),
    missingFields,
  };
}

/** Removes a trailing Excel duplicate suffix such as ".1" and trims. */
export function stripCrewSuffix(name: string): string {
  return name
    .trim()
    .replace(/\.\d+$/, "")
    .trim();
}

/** Trimmed text of a cell, or null when blank. */
export function cellText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = typeof v === "number" ? String(v) : String(v).trim();
  return s === "" ? null : s;
}

export function normalizeStatus(v: unknown): NpStatus | null {
  const s = cellText(v);
  if (!s) return null;
  const key = s.replace(/\s+/g, " ").toLowerCase();
  return NP_STATUSES.find((x) => x.toLowerCase() === key) ?? null;
}

export type Parsed<T> = { value: T | null; bad: boolean };

function isoDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Excel serial dates (1900 system) and YYYY-MM-DD / M/D/YYYY strings to ISO dates. */
export function parseDate(v: unknown): Parsed<string> {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) {
    return { value: null, bad: false };
  }
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 61 || v > 2958465) return { value: null, bad: true };
    const ms = Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000;
    return { value: new Date(ms).toISOString().slice(0, 10), bad: false };
  }
  if (typeof v === "string") {
    const s = v.trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    let iso = m ? isoDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
    if (!m) {
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
      iso = m ? isoDate(Number(m[3]), Number(m[1]), Number(m[2])) : null;
    }
    if (iso) return { value: iso, bad: false };
  }
  return { value: null, bad: true };
}

/** Numbers, or strings such as "$12,500.00". */
export function parseMoney(v: unknown): Parsed<number> {
  if (v === null || v === undefined) return { value: null, bad: false };
  if (typeof v === "number") {
    return Number.isFinite(v) ? { value: v, bad: false } : { value: null, bad: true };
  }
  if (typeof v !== "string") return { value: null, bad: true };
  let s = v.trim();
  if (s === "") return { value: null, bad: false };
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()$,\s-]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return { value: null, bad: true };
  return { value: negative ? -Number(s) : Number(s), bad: false };
}

/** Progress as a fraction 0..1. Values above 1 and up to 100 are percentages. */
export function parseProgress(v: unknown): Parsed<number> {
  const n = parseMoney(v);
  if (n.value === null) return n;
  const x = n.value > 1 && n.value <= 100 ? n.value / 100 : n.value;
  return x < 0 || x > 1 ? { value: null, bad: true } : { value: x, bad: false };
}

export function parseBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1;
  if (typeof v !== "string") return false;
  return ["true", "yes", "y", "x", "1"].includes(v.trim().toLowerCase());
}

/** First 12 numeric cells, January to December, or null when there are fewer. */
export function extractBudget(cells: unknown[] | null): { month: number; amount: number }[] | null {
  const nums = (cells ?? []).filter(
    (c): c is number => typeof c === "number" && Number.isFinite(c),
  );
  if (nums.length < 12) return null;
  return nums.slice(0, 12).map((amount, i) => ({ month: i + 1, amount }));
}

const lower = (s: string | null | undefined) => (s ?? "").toLowerCase();

export type BuildInput = {
  pms: RawTable | null;
  crews: RawTable | null;
  projects: RawTable | null;
  budgetCells: unknown[] | null;
};

/** Turns the raw tables into an import payload and a report of everything that was changed or skipped. */
export function buildImport(
  input: BuildInput,
  budgetYear: number,
): { payload: ImportPayload; report: ImportReport } {
  const report: ImportReport = {
    problems: [],
    duplicateCrews: [],
    unmappedColumns: [],
    missingFields: [],
    pmsAddedFromProjects: [],
  };
  const problem = (table: string, row: number | null, message: string) =>
    report.problems.push({ table, row, message });

  function mapTable<F extends string>(
    label: string,
    table: RawTable | null,
    aliases: Record<F, readonly string[]>,
  ) {
    if (!table) return null;
    const m = mapHeaders(table.headers, aliases);
    if (m.unmappedColumns.length)
      report.unmappedColumns.push({ table: label, columns: m.unmappedColumns });
    if (m.missingFields.length)
      report.missingFields.push({ table: label, fields: m.missingFields });
    const get = (row: Record<string, unknown>, field: F): unknown => {
      const h = m.fields[field];
      return h === undefined ? null : (row[h] ?? null);
    };
    return { get, table };
  }

  const contractors = new Map<string, string>();
  const addContractor = (name: string | null) => {
    if (name && !contractors.has(lower(name))) contractors.set(lower(name), name);
  };

  // PMs
  const pms = new Map<string, string>();
  const pmTable = mapTable("PMs", input.pms, PM_ALIASES);
  pmTable?.table.rows.forEach((row) => {
    const name = cellText(pmTable.get(row, "name"));
    if (name && !pms.has(lower(name))) pms.set(lower(name), name);
  });

  // Crews
  const crews: ImportPayload["crews"] = [];
  const crewKeys = new Map<string, { index: number; rows: number[] }>();
  const crewTable = mapTable("Crews", input.crews, CREW_ALIASES);
  crewTable?.table.rows.forEach((row, i) => {
    const rowNo = tableRowNumber(crewTable.table, i);
    const raw = cellText(crewTable.get(row, "name"));
    const name = raw ? stripCrewSuffix(raw) : "";
    if (!name) return;
    const contractor = cellText(crewTable.get(row, "contractor"));
    const key = `${lower(contractor)}|${lower(name)}`;
    const seen = crewKeys.get(key);
    if (seen) {
      seen.rows.push(rowNo);
      return;
    }
    crewKeys.set(key, { index: crews.length, rows: [rowNo] });

    const typeText = cellText(crewTable.get(row, "crew_type"));
    const crew_type = NP_CREW_TYPES.find((t) => lower(t) === lower(typeText)) ?? null;
    if (typeText && !crew_type)
      problem("Crews", rowNo, `Unknown crew type "${typeText}"; imported empty.`);
    const sizeRaw = crewTable.get(row, "size");
    const size = parseMoney(sizeRaw);
    const validSize = size.value !== null && size.value >= 0 && Number.isFinite(size.value);
    if (size.bad || (size.value !== null && !validSize)) {
      problem("Crews", rowNo, "Size is not a valid number; imported empty.");
    }
    addContractor(contractor);
    crews.push({
      name,
      contractor,
      owner_name: cellText(crewTable.get(row, "owner_name")),
      crew_type,
      size: validSize ? Math.round(size.value!) : null,
    });
  });
  for (const v of crewKeys.values()) {
    if (v.rows.length < 2) continue;
    const crew = crews[v.index];
    report.duplicateCrews.push({ contractor: crew.contractor, name: crew.name, rows: v.rows });
  }

  // Projects
  const projects: ImportPayload["projects"] = [];
  const projectTable = mapTable("Projects", input.projects, PROJECT_ALIASES);
  projectTable?.table.rows.forEach((row, i) => {
    const g = (f: keyof typeof PROJECT_ALIASES) => projectTable.get(row, f);
    const rowNo = tableRowNumber(projectTable.table, i);
    const name = cellText(g("name"));
    if (!name) return;
    const status = normalizeStatus(g("status"));
    if (!status) {
      const raw = cellText(g("status"));
      problem(
        "Projects",
        rowNo,
        raw ? `Skipped: unknown status "${raw}".` : "Skipped: status is blank.",
      );
      return;
    }

    const dates = (["est_start", "est_end", "deadline"] as const).map((f) => {
      const d = parseDate(g(f));
      if (d.bad) problem("Projects", rowNo, `${f} is not a valid date; imported empty.`);
      return d.value;
    });
    let [est_start, est_end] = dates;
    const deadline = dates[2];
    if (est_start && est_end && est_end < est_start) {
      problem("Projects", rowNo, "est_end is before est_start; both imported empty.");
      est_start = null;
      est_end = null;
    }
    const revenue = parseMoney(g("est_revenue"));
    if (revenue.bad)
      problem("Projects", rowNo, "est_revenue is not a valid number; imported empty.");
    const progress = parseProgress(g("progress"));
    if (progress.bad) problem("Projects", rowNo, "progress is out of range; imported empty.");

    const pm = cellText(g("pm"));
    if (pm && !pms.has(lower(pm))) {
      pms.set(lower(pm), pm);
      report.pmsAddedFromProjects.push(pm);
    }
    const contractor = cellText(g("contractor"));
    addContractor(contractor);
    const crewRaw = cellText(g("crew"));
    const crew = crewRaw ? stripCrewSuffix(crewRaw) || null : null;
    if (crew && !crewKeys.has(`${lower(contractor)}|${lower(crew)}`)) {
      problem(
        "Projects",
        rowNo,
        `Crew "${crew}" is not in the Crews table for this contractor; imported empty.`,
      );
    }

    projects.push({
      cmic_job_number: cellText(g("cmic_job_number")),
      name,
      address: cellText(g("address")),
      city: cellText(g("city")),
      state: cellText(g("state")),
      pm,
      contractor,
      crew,
      status,
      progress: progress.value,
      est_start,
      est_end,
      deadline,
      est_revenue: revenue.value,
      notes: cellText(g("notes")),
      tag: cellText(g("tag")),
      exclude_revenue: parseBool(g("exclude_revenue")),
      bonus_eligible: parseBool(g("bonus_eligible")),
    });
  });

  const budget = extractBudget(input.budgetCells);
  if (!budget) {
    problem(
      "Dashboard",
      BUDGET_ROW,
      "Fewer than 12 numeric budget cells were found; no budget imported.",
    );
  }

  return {
    payload: {
      budget_year: budgetYear,
      pms: [...pms.values()].map((name) => ({ name })),
      contractors: [...contractors.values()].map((name) => ({ name })),
      crews,
      projects,
      budget: budget ?? [],
    },
    report,
  };
}
