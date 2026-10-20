import {
  cellText,
  mapHeaders,
  normalizeHeader,
  parseDate,
  parseMoney,
  type Parsed,
} from "@/lib/national-paint-import";

/**
 * National Paint CMiC exports. Pure helpers (no DOM, network or Supabase) that turn the cell grid of
 * a "Table Visual Export" sheet into the np_replace_cmic payload part and a report of what was read.
 * Nothing here ever puts a cell value into a message.
 */

export const CMIC_SHEET = "Table Visual Export";
export const CMIC_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const CMIC_MAX_BUDGET_JOBS = 2000;
export const CMIC_MAX_SUMMARY_JOBS = 3000;
export const CMIC_MAX_COST_LINES = 30000;
export const CMIC_MAX_PAYLOAD_BYTES = 6 * 1024 * 1024;
const HEADER_SEARCH_ROWS = 30;

export type CmicReportKey = "budget_cost" | "cost_summaries";
type Kind = "text" | "money" | "date";
type Cells = Map<number, Map<number, unknown>>;

type FieldDef = { field: string; kind: Kind; aliases: readonly string[] };

type ReportDef = {
  key: CmicReportKey;
  label: string;
  /** Headers that identify the report, compared with normalizeHeader. */
  identifying: readonly string[];
  /** The column holding the job code (budget_cost: "<code> - <name>"). */
  jobField: string;
  fields: readonly FieldDef[];
};

const f = (field: string, kind: Kind, ...aliases: string[]): FieldDef => ({
  field,
  kind,
  aliases,
});

export const CMIC_REPORTS: Record<CmicReportKey, ReportDef> = {
  budget_cost: {
    key: "budget_cost",
    label: "Project Budget & Cost",
    identifying: ["Job", "Customer Name", "Job Status (System)"],
    jobField: "job",
    fields: [
      f("job", "text", "Job"),
      f("customer_name", "text", "Customer Name", "Customer"),
      f("contact_code", "text", "Contact Code"),
      f("status", "text", "Job Status (System)", "Job Status"),
      f("est_start", "date", "Estimated Start Date", "Estimated Start", "Est Start Date"),
      f(
        "est_end",
        "date",
        "Estimated Completion Date",
        "Estimated End Date",
        "Est Completion Date",
      ),
      f("actual_start", "date", "Actual Start Date", "Actual Start"),
      f("actual_end", "date", "Actual Completion Date", "Actual End Date"),
      f("awarded_contract_value", "money", "Awarded Contract Value"),
      f(
        "current_budgeted_revenue",
        "money",
        "Current Budgeted Revenue Amount",
        "Current Budgeted Revenue",
      ),
      f("billed_to_date", "money", "Billed to Date"),
      f("original_budget", "money", "Original Budget Amount", "Original Budget"),
      f("current_budget", "money", "Current Budget Amount", "Current Budget"),
      f("projected_total_costs", "money", "Projected Total Costs", "Projected Total Cost"),
      f("spent_to_date", "money", "Spent to Date"),
      f("estimated_profit", "money", "Estimated Profit"),
      f("profit_pct", "money", "Profit %", "Profit Percent"),
      f("pct_complete", "money", "% Complete", "Percent Complete"),
      f("bill_pct", "money", "Bill %", "Bill Percent"),
      f("billing_remaining", "money", "Billing Remaining"),
      f("cost_remaining", "money", "Cost Remaining"),
      f("earned_revenue", "money", "Earned Revenue"),
      f("backlog", "money", "Backlog"),
    ],
  },
  cost_summaries: {
    key: "cost_summaries",
    label: "JC Cost Summaries",
    identifying: ["Job Code", "Cost Code", "Category Code"],
    jobField: "job_code",
    fields: [
      f("company_code", "text", "Company Code"),
      f("company_name", "text", "Company Name"),
      f("job_code", "text", "Job Code"),
      f("job_name", "text", "Job Name"),
      f("job_start", "date", "Job Start Date", "Job Start"),
      f("status", "text", "Job Status"),
      f("division_code", "text", "Division Code"),
      f("division_name", "text", "Division Name"),
      f("cost_code", "text", "Cost Code"),
      f("cost_code_name", "text", "Cost Code Name"),
      f("category_code", "text", "Category Code"),
      f("category_name", "text", "Category Name"),
      f("original_budgeted_cost", "money", "Original Budgeted Cost"),
      f("change_order_amount", "money", "Change Order Amount"),
      f("current_budgeted_cost", "money", "Current Budgeted Cost"),
      f("projected_cost", "money", "Projected Cost"),
      f("budgeted_revenue", "money", "Budgeted Revenue"),
      f("budget_variance", "money", "Budget Variance"),
      f("committed_to_date", "money", "Committed to Date"),
      f("committed_remaining", "money", "Committed Remaining"),
      f("yet_to_buy", "money", "Yet to Buy"),
      f("spent_to_date", "money", "Spent to Date"),
      f("billed_to_date", "money", "Billed to Date"),
      f(
        "spent_against_commitments",
        "money",
        "Spent Against Commitments",
        "Spent Against Commitment",
        "Spent Against Committed",
      ),
      f(
        "spent_outside_commitments",
        "money",
        "Spent Outside of Commitments",
        "Spent Outside of Commitment",
        "Spent Outside Commitments",
        "Spent Outside Commitment",
      ),
    ],
  },
};

/** Order of the positional array that each Cost Summaries line is sent as. */
export const CMIC_LINE_FIELDS = [
  "division_code",
  "division_name",
  "cost_code",
  "cost_code_name",
  "category_code",
  "category_name",
  "original_budgeted_cost",
  "change_order_amount",
  "current_budgeted_cost",
  "projected_cost",
  "budgeted_revenue",
  "budget_variance",
  "committed_to_date",
  "committed_remaining",
  "yet_to_buy",
  "spent_to_date",
  "billed_to_date",
  "spent_against_commitments",
  "spent_outside_commitments",
] as const;

export type CmicLine = (string | number | null)[];
type Json = string | number | null;

export type CmicBudgetJob = Record<string, Json>;
export type CmicSummaryJob = {
  job_code: string;
  job_name: string | null;
  status: string | null;
  job_start: string | null;
  company_code: string | null;
  company_name: string | null;
  lines: CmicLine[];
};
export type CmicProblem = { row: number; column: string; message: string };

export type CmicParseResult = {
  report: CmicReportKey;
  headerRow: number;
  /** The payload part: `{ jobs }` under the report's key. */
  part: { jobs: CmicBudgetJob[] | CmicSummaryJob[] };
  rowsRead: number;
  jobs: number;
  costLines: number;
  rowsSkipped: number;
  unmappedColumns: string[];
  missingColumns: string[];
  duplicates: { job_code: string; rows: number[] }[];
  problems: CmicProblem[];
  /** First job codes and names for the preview. */
  sample: { job_code: string; job_name: string | null }[];
};

const fmt = new Intl.NumberFormat("en-US");

/** Rejects a file before it is read. */
export function checkCmicFile(file: { name: string; size: number }) {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error("Choose the .xlsx file exported from CMiC (Table Visual Export).");
  }
  if (file.size > CMIC_MAX_FILE_BYTES) throw new Error("This file is larger than 20 MB.");
}

/** The first row in rows 1-30 whose cells include every identifying header of the report. */
export function findHeaderRow(cells: Cells, report: CmicReportKey): number | null {
  const want = CMIC_REPORTS[report].identifying.map(normalizeHeader);
  for (let row = 1; row <= HEADER_SEARCH_ROWS; row++) {
    const r = cells.get(row);
    if (!r) continue;
    const have = new Set([...r.values()].map((v) => normalizeHeader(String(v ?? ""))));
    if (want.every((w) => have.has(w))) return row;
  }
  return null;
}

export function payloadSize(payload: unknown): number {
  return JSON.stringify(payload).length;
}

/** Throws when a serialized payload is over the size cap. */
export function checkPayloadSize(payload: unknown) {
  if (payloadSize(payload) > CMIC_MAX_PAYLOAD_BYTES) {
    throw new Error("This upload is larger than 6 MB.");
  }
}

function checkCaps(report: CmicReportKey, jobs: number, lines: number) {
  const max = report === "budget_cost" ? CMIC_MAX_BUDGET_JOBS : CMIC_MAX_SUMMARY_JOBS;
  if (jobs > max) throw new Error(`This export has more than ${fmt.format(max)} jobs.`);
  if (lines > CMIC_MAX_COST_LINES) {
    throw new Error(`This export has more than ${fmt.format(CMIC_MAX_COST_LINES)} cost lines.`);
  }
}

/** Reads every row under the header. Throws a readable error when the export cannot be used. */
export function parseCmicExport(cells: Cells, report: CmicReportKey): CmicParseResult {
  const def = CMIC_REPORTS[report];
  const headerRow = findHeaderRow(cells, report);
  if (headerRow === null) {
    const otherKey: CmicReportKey = report === "budget_cost" ? "cost_summaries" : "budget_cost";
    const other = CMIC_REPORTS[otherKey];
    if (findHeaderRow(cells, otherKey) !== null) {
      throw new Error(`This is the ${other.label} export. Choose it under ${other.label}.`);
    }
    throw new Error(
      `No header row with ${def.identifying.join(", ")} was found in the first ${HEADER_SEARCH_ROWS} rows.`,
    );
  }

  const headerCells = cells.get(headerRow)!;
  const headers: string[] = [];
  const colOf = new Map<string, number>();
  for (const [col, v] of [...headerCells.entries()].sort((a, b) => a[0] - b[0])) {
    const h = String(v ?? "").trim();
    headers.push(h);
    if (h && !colOf.has(h)) colOf.set(h, col);
  }
  const aliases: Record<string, readonly string[]> = {};
  for (const d of def.fields) aliases[d.field] = d.aliases;
  const mapping = mapHeaders(headers, aliases);
  const missingColumns = mapping.missingFields.map(
    (field) => def.fields.find((d) => d.field === field)!.aliases[0],
  );
  const colFor = (field: string) => {
    const h = mapping.fields[field];
    return h === undefined ? undefined : colOf.get(h);
  };
  const columns = new Map<string, { col: number | undefined; def: FieldDef }>();
  for (const d of def.fields) columns.set(d.field, { col: colFor(d.field), def: d });

  const problems: CmicProblem[] = [];
  const read = (row: number, field: string): Json => {
    const c = columns.get(field)!;
    if (c.col === undefined) return null;
    const raw = cells.get(row)?.get(c.col);
    if (c.def.kind === "text") return cellText(raw);
    const parsed: Parsed<number | string> =
      c.def.kind === "date" ? parseDate(raw) : parseMoney(raw);
    if (parsed.bad) {
      const column = mapping.fields[field] ?? c.def.aliases[0];
      problems.push({
        row,
        column,
        message: `${column} on row ${row} is not a valid ${c.def.kind === "date" ? "date" : "number"}; imported empty.`,
      });
    }
    return parsed.value;
  };

  let rowsRead = 0;
  let rowsSkipped = 0;
  const duplicates = new Map<string, number[]>();
  const rowFirst = new Map<string, number>();
  const budgetJobs = new Map<string, CmicBudgetJob>();
  const summaryJobs = new Map<string, CmicSummaryJob>();
  let costLines = 0;

  const rows = [...cells.keys()].filter((r) => r > headerRow).sort((a, b) => a - b);
  for (const row of rows) {
    rowsRead++;
    const jobValue = read(row, def.jobField) as string | null;
    if (!jobValue) {
      rowsSkipped++;
      continue;
    }

    if (report === "budget_cost") {
      const at = jobValue.indexOf(" - ");
      const code = (at < 0 ? jobValue : jobValue.slice(0, at)).trim();
      const name = at < 0 ? null : jobValue.slice(at + 3).trim() || null;
      if (!code) {
        rowsSkipped++;
        continue;
      }
      if (budgetJobs.has(code)) {
        const seen = duplicates.get(code);
        if (seen) seen.push(row);
        else duplicates.set(code, [rowFirst.get(code)!, row]);
        continue;
      }
      rowFirst.set(code, row);
      const job: CmicBudgetJob = { job_code: code, job_name: name };
      for (const d of def.fields) if (d.field !== "job") job[d.field] = read(row, d.field);
      budgetJobs.set(code, job);
    } else {
      let job = summaryJobs.get(jobValue);
      if (!job) {
        job = {
          job_code: jobValue,
          job_name: read(row, "job_name") as string | null,
          status: read(row, "status") as string | null,
          job_start: read(row, "job_start") as string | null,
          company_code: read(row, "company_code") as string | null,
          company_name: read(row, "company_name") as string | null,
          lines: [],
        };
        summaryJobs.set(jobValue, job);
      }
      job.lines.push(CMIC_LINE_FIELDS.map((field) => read(row, field)));
      costLines++;
    }
  }

  const jobs: (CmicBudgetJob | CmicSummaryJob)[] =
    report === "budget_cost" ? [...budgetJobs.values()] : [...summaryJobs.values()];
  if (jobs.length === 0) throw new Error("The export has no job rows.");
  checkCaps(report, jobs.length, costLines);

  return {
    report,
    headerRow,
    part: { jobs } as CmicParseResult["part"],
    rowsRead,
    jobs: jobs.length,
    costLines,
    rowsSkipped,
    unmappedColumns: mapping.unmappedColumns,
    missingColumns,
    duplicates: [...duplicates.entries()].map(([job_code, r]) => ({ job_code, rows: r })),
    problems,
    sample: jobs.slice(0, 5).map((j) => ({
      job_code: String(j.job_code),
      job_name: (j.job_name as string | null) ?? null,
    })),
  };
}
