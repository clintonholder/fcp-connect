import { supabase } from "@/integrations/supabase/client";
import type { FinanceJob, FinanceProject } from "@/lib/national-paint-finance";
import { readAll } from "@/lib/national-paint-read";

export const FINANCE_JOBS_KEY = ["np-finance-jobs"];

const JOB_COLUMNS =
  "job_code, job_name, contact_code, status, est_end, actual_end, awarded_contract_value, current_budgeted_revenue, billed_to_date, original_budget, current_budget, projected_total_costs, spent_to_date, profit_pct, cost_remaining, earned_revenue, backlog";

/** The Project Budget & Cost export, one row per job. */
export const loadFinanceJobs = () =>
  readAll<FinanceJob>(
    (from, to) =>
      supabase
        .from("np_cmic_jobs")
        .select(JOB_COLUMNS)
        .eq("source", "budget_cost")
        .order("id")
        .range(from, to) as never,
  );

export const FINANCE_PROJECTS_KEY = ["np-finance-projects"];
export const FINANCE_PMS_KEY = ["np-finance-pms"];

export const loadProjects = () =>
  readAll<FinanceProject & { id: string; name: string }>(
    (from, to) =>
      supabase
        .from("np_projects")
        .select("id, name, pm_id, cmic_job_number")
        .order("id")
        .range(from, to) as never,
  );

export const loadPms = () =>
  readAll<{ id: string; name: string }>(
    (from, to) => supabase.from("np_pms").select("id, name").order("id").range(from, to) as never,
  );

export function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}
