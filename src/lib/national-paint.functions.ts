import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STATUSES = ["Potential", "Verbal Award", "Upcoming", "Scheduled", "In Progress", "Completed"];
const MAX_PROJECTS = 5000;

type Str = string | null;
type ImportInput = {
  fileName: string;
  budgetYear: number;
  duplicateCrewCount: number;
  skippedRowCount: number;
  payload: {
    budget_year: number;
    pms: { name: string }[];
    contractors: { name: string }[];
    crews: {
      name: string;
      contractor: Str;
      owner_name: Str;
      crew_type: Str;
      size: number | null;
    }[];
    projects: {
      cmic_job_number: Str;
      name: string;
      address: Str;
      city: Str;
      state: Str;
      pm: Str;
      contractor: Str;
      crew: Str;
      status: string;
      progress: number | null;
      est_start: Str;
      est_end: Str;
      deadline: Str;
      est_revenue: number | null;
      notes: Str;
      tag: Str;
      exclude_revenue: boolean;
      bonus_eligible: boolean;
    }[];
    budget: { month: number; amount: number }[];
  };
};

function validateInput(d: ImportInput): ImportInput {
  const p = d?.payload;
  if (!p || typeof d.fileName !== "string") throw new Error("Missing import data");
  if (!Number.isInteger(d.budgetYear) || p.budget_year !== d.budgetYear) {
    throw new Error("Invalid budget year");
  }
  if (!Array.isArray(p.pms) || !Array.isArray(p.contractors) || !Array.isArray(p.crews)) {
    throw new Error("Invalid import data");
  }
  if (!Array.isArray(p.projects) || !Array.isArray(p.budget))
    throw new Error("Invalid import data");
  if (p.projects.length > MAX_PROJECTS)
    throw new Error(`At most ${MAX_PROJECTS} projects can be imported`);
  if (
    [...p.pms, ...p.contractors, ...p.crews, ...p.projects].some(
      (r) => typeof r?.name !== "string" || !r.name.trim(),
    )
  ) {
    throw new Error("Every row needs a name");
  }
  if (p.projects.some((r) => !STATUSES.includes(r.status)))
    throw new Error("Invalid project status");
  if (
    p.budget.some(
      (b) =>
        !Number.isInteger(b.month) || b.month < 1 || b.month > 12 || !Number.isFinite(b.amount),
    )
  ) {
    throw new Error("Invalid budget month");
  }
  return d;
}

/** Replaces all National Paint data from a workbook parsed in the browser. Admins only. */
export const importNationalPaintWorkbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (adminError || isAdmin !== true) throw new Error("Forbidden: administrators only");

    const { data: counts, error } = await context.supabase.rpc("np_import_workbook", {
      _payload: data.payload as never,
    });
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "national_paint_imported",
      target_type: "national_paint",
      target_id: null,
      details: {
        file_name: data.fileName,
        budget_year: data.budgetYear,
        inserted: counts,
        duplicate_crews: data.duplicateCrewCount,
        skipped_rows: data.skippedRowCount,
      } as never,
    });
    return counts as {
      pms: number;
      contractors: number;
      crews: number;
      projects: number;
      budget_months: number;
    };
  });
