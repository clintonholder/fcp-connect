-- National Paint CMiC data: np_cmic_jobs, np_cmic_cost_lines and np_replace_cmic.
--
-- The CMiC page uploads two CMiC exports parsed in the browser. np_cmic_jobs holds one row per job
-- per report (source 'budget_cost' = Project Budget & Cost, 'cost_summaries' = JC Cost Summaries),
-- which mirrors the workbook "CMiC Match Lists" job list; a job that is in both reports has two
-- rows. np_cmic_cost_lines holds the Cost Summaries lines of a job (cascade delete). Both tables
-- are readable and writable only with manage_national_paint (permissive SELECT, INSERT and DELETE
-- policies; there is no UPDATE policy because rows are only replaced), and the restrictive
-- view_as_block_* policies stop an admin with an active proxy session (View As) from writing.
--
-- np_replace_cmic replaces one report's rows (or both) from one jsonb payload in one transaction.
-- It is SECURITY INVOKER, so the table policies still apply. A key that is absent leaves that
-- report untouched. It never touches np_projects, so confirmed matches
-- (np_projects.cmic_job_number) survive every upload. This migration inserts no rows.
--   _payload: {
--     budget_cost?: { jobs: [{job_code, job_name, status, customer_name, contact_code, est_start,
--       est_end, actual_start, actual_end, awarded_contract_value, current_budgeted_revenue,
--       billed_to_date, original_budget, current_budget, projected_total_costs, spent_to_date,
--       estimated_profit, profit_pct, pct_complete, bill_pct, billing_remaining, cost_remaining,
--       earned_revenue, backlog}] },
--     cost_summaries?: { jobs: [{job_code, job_name, status, job_start, company_code, company_name,
--       lines: [[...]]}] } }
-- Each line is a positional array in this fixed order (indexes 0 to 18):
--   division_code, division_name, cost_code, cost_code_name, category_code, category_name,
--   original_budgeted_cost, change_order_amount, current_budgeted_cost, projected_cost,
--   budgeted_revenue, budget_variance, committed_to_date, committed_remaining, yet_to_buy,
--   spent_to_date, billed_to_date, spent_against_commitments, spent_outside_commitments
-- Returns {budget_jobs, cost_summary_jobs, cost_lines}; null for a part that was not replaced.
--
-- Manual checks. A human runs these in the Supabase SQL editor; each is always rolled back.
-- Replace <np-uuid> with a user with manage_national_paint, <nonp-uuid> with a user without it
-- (and not an admin), and <admin-uuid> with an admin who has an active proxy_sessions row.
--
-- (a) A user without the permission sees 0 rows and cannot call the function.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<nonp-uuid>","role":"authenticated"}', true);
--   SELECT (SELECT count(*) FROM public.np_cmic_jobs) AS jobs,
--          (SELECT count(*) FROM public.np_cmic_cost_lines) AS cost_lines;
--   -- Expected: 0 and 0.
--   SELECT public.np_replace_cmic('{"budget_cost":{"jobs":[]}}'::jsonb);
--   -- Expected: ERROR: Forbidden: you cannot manage National Paint.
--   ROLLBACK;
--
-- (b) A user with the permission can call it with a small made-up payload.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<np-uuid>","role":"authenticated"}', true);
--   SELECT public.np_replace_cmic('{"budget_cost":{"jobs":[{"job_code":"99.0001","job_name":"Test"}]},
--     "cost_summaries":{"jobs":[{"job_code":"99.0001","job_name":"Test","lines":
--     [["01","General","01020","Labor","L","Labor",100,0,100,100,0,0,0,0,0,50,0,0,0]]}]}}'::jsonb);
--   -- Expected: {"budget_jobs": 1, "cost_summary_jobs": 1, "cost_lines": 1}.
--   ROLLBACK;
--
-- (c) An admin with an active proxy session is refused.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   SELECT public.np_replace_cmic('{"budget_cost":{"jobs":[]}}'::jsonb);
--   -- Expected: ERROR: View As is read-only.
--   ROLLBACK;
--
-- (d) After a replace, np_projects.cmic_job_number values are unchanged.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<np-uuid>","role":"authenticated"}', true);
--   SELECT md5(string_agg(id::text || coalesce(cmic_job_number, ''), ',' ORDER BY id)) FROM public.np_projects;
--   SELECT public.np_replace_cmic('{"budget_cost":{"jobs":[{"job_code":"99.0001"}]}}'::jsonb);
--   SELECT md5(string_agg(id::text || coalesce(cmic_job_number, ''), ',' ORDER BY id)) FROM public.np_projects;
--   -- Expected: the two hashes are equal.
--   ROLLBACK;

CREATE TABLE IF NOT EXISTS public.np_cmic_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('budget_cost','cost_summaries')),
  job_code text NOT NULL CHECK (btrim(job_code) <> ''),
  job_name text NULL,
  status text NULL,
  customer_name text NULL,
  contact_code text NULL,
  est_start date NULL,
  est_end date NULL,
  actual_start date NULL,
  actual_end date NULL,
  company_code text NULL,
  company_name text NULL,
  job_start date NULL,
  awarded_contract_value numeric(14,2) NULL,
  current_budgeted_revenue numeric(14,2) NULL,
  billed_to_date numeric(14,2) NULL,
  original_budget numeric(14,2) NULL,
  current_budget numeric(14,2) NULL,
  projected_total_costs numeric(14,2) NULL,
  spent_to_date numeric(14,2) NULL,
  estimated_profit numeric(14,2) NULL,
  billing_remaining numeric(14,2) NULL,
  cost_remaining numeric(14,2) NULL,
  earned_revenue numeric(14,2) NULL,
  backlog numeric(14,2) NULL,
  profit_pct numeric NULL,
  pct_complete numeric NULL,
  bill_pct numeric NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, job_code)
);

CREATE TABLE IF NOT EXISTS public.np_cmic_cost_lines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL REFERENCES public.np_cmic_jobs(id) ON DELETE CASCADE,
  division_code text NULL,
  division_name text NULL,
  cost_code text NULL,
  cost_code_name text NULL,
  category_code text NULL,
  category_name text NULL,
  original_budgeted_cost numeric(14,2) NULL,
  change_order_amount numeric(14,2) NULL,
  current_budgeted_cost numeric(14,2) NULL,
  projected_cost numeric(14,2) NULL,
  budgeted_revenue numeric(14,2) NULL,
  budget_variance numeric(14,2) NULL,
  committed_to_date numeric(14,2) NULL,
  committed_remaining numeric(14,2) NULL,
  yet_to_buy numeric(14,2) NULL,
  spent_to_date numeric(14,2) NULL,
  billed_to_date numeric(14,2) NULL,
  spent_against_commitments numeric(14,2) NULL,
  spent_outside_commitments numeric(14,2) NULL
);

CREATE INDEX IF NOT EXISTS np_cmic_cost_lines_job_id_idx ON public.np_cmic_cost_lines (job_id);

ALTER TABLE public.np_cmic_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.np_cmic_cost_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "np_cmic_jobs_select" ON public.np_cmic_jobs;
DROP POLICY IF EXISTS "np_cmic_jobs_insert" ON public.np_cmic_jobs;
DROP POLICY IF EXISTS "np_cmic_jobs_delete" ON public.np_cmic_jobs;
CREATE POLICY "np_cmic_jobs_select" ON public.np_cmic_jobs FOR SELECT TO authenticated
  USING ((SELECT private.has_perm(auth.uid(), 'manage_national_paint')));
CREATE POLICY "np_cmic_jobs_insert" ON public.np_cmic_jobs FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_perm(auth.uid(), 'manage_national_paint')));
CREATE POLICY "np_cmic_jobs_delete" ON public.np_cmic_jobs FOR DELETE TO authenticated
  USING ((SELECT private.has_perm(auth.uid(), 'manage_national_paint')));

DROP POLICY IF EXISTS "np_cmic_cost_lines_select" ON public.np_cmic_cost_lines;
DROP POLICY IF EXISTS "np_cmic_cost_lines_insert" ON public.np_cmic_cost_lines;
DROP POLICY IF EXISTS "np_cmic_cost_lines_delete" ON public.np_cmic_cost_lines;
CREATE POLICY "np_cmic_cost_lines_select" ON public.np_cmic_cost_lines FOR SELECT TO authenticated
  USING ((SELECT private.has_perm(auth.uid(), 'manage_national_paint')));
CREATE POLICY "np_cmic_cost_lines_insert" ON public.np_cmic_cost_lines FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.has_perm(auth.uid(), 'manage_national_paint')));
CREATE POLICY "np_cmic_cost_lines_delete" ON public.np_cmic_cost_lines FOR DELETE TO authenticated
  USING ((SELECT private.has_perm(auth.uid(), 'manage_national_paint')));

-- View As is read-only: same restrictive policies as 20261016140000_view_as_proxy_sessions.sql.

DROP POLICY IF EXISTS "view_as_block_insert" ON public.np_cmic_jobs;
DROP POLICY IF EXISTS "view_as_block_update" ON public.np_cmic_jobs;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.np_cmic_jobs;
CREATE POLICY "view_as_block_insert" ON public.np_cmic_jobs AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT NOT private.has_active_proxy(auth.uid())));
CREATE POLICY "view_as_block_update" ON public.np_cmic_jobs AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT NOT private.has_active_proxy(auth.uid())))
  WITH CHECK ((SELECT NOT private.has_active_proxy(auth.uid())));
CREATE POLICY "view_as_block_delete" ON public.np_cmic_jobs AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT NOT private.has_active_proxy(auth.uid())));

DROP POLICY IF EXISTS "view_as_block_insert" ON public.np_cmic_cost_lines;
DROP POLICY IF EXISTS "view_as_block_update" ON public.np_cmic_cost_lines;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.np_cmic_cost_lines;
CREATE POLICY "view_as_block_insert" ON public.np_cmic_cost_lines AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK ((SELECT NOT private.has_active_proxy(auth.uid())));
CREATE POLICY "view_as_block_update" ON public.np_cmic_cost_lines AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT NOT private.has_active_proxy(auth.uid())))
  WITH CHECK ((SELECT NOT private.has_active_proxy(auth.uid())));
CREATE POLICY "view_as_block_delete" ON public.np_cmic_cost_lines AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT NOT private.has_active_proxy(auth.uid())));

-- Replaces one or both CMiC reports from a parsed payload (format in the header comment above).
CREATE OR REPLACE FUNCTION public.np_replace_cmic(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  _budget integer;
  _summary integer;
  _lines integer;
BEGIN
  IF NOT public.has_perm(auth.uid(), 'manage_national_paint') THEN
    RAISE EXCEPTION 'Forbidden: you cannot manage National Paint';
  END IF;
  IF private.has_active_proxy(auth.uid()) THEN
    RAISE EXCEPTION 'View As is read-only';
  END IF;
  IF NOT (_payload ? 'budget_cost' OR _payload ? 'cost_summaries') THEN
    RAISE EXCEPTION 'Nothing to upload';
  END IF;

  IF _payload ? 'budget_cost' THEN
    DELETE FROM public.np_cmic_jobs WHERE source = 'budget_cost';
    INSERT INTO public.np_cmic_jobs (source, job_code, job_name, status, customer_name, contact_code, est_start, est_end, actual_start, actual_end, awarded_contract_value, current_budgeted_revenue, billed_to_date, original_budget, current_budget, projected_total_costs, spent_to_date, estimated_profit, billing_remaining, cost_remaining, earned_revenue, backlog, profit_pct, pct_complete, bill_pct)
      SELECT 'budget_cost', x.job_code, x.job_name, x.status, x.customer_name, x.contact_code, x.est_start, x.est_end, x.actual_start, x.actual_end, x.awarded_contract_value, x.current_budgeted_revenue, x.billed_to_date, x.original_budget, x.current_budget, x.projected_total_costs, x.spent_to_date, x.estimated_profit, x.billing_remaining, x.cost_remaining, x.earned_revenue, x.backlog, x.profit_pct, x.pct_complete, x.bill_pct
      FROM jsonb_to_recordset(coalesce(_payload->'budget_cost'->'jobs', '[]'::jsonb))
        AS x(job_code text, job_name text, status text, customer_name text, contact_code text, est_start date, est_end date, actual_start date, actual_end date, awarded_contract_value numeric, current_budgeted_revenue numeric, billed_to_date numeric, original_budget numeric, current_budget numeric, projected_total_costs numeric, spent_to_date numeric, estimated_profit numeric, billing_remaining numeric, cost_remaining numeric, earned_revenue numeric, backlog numeric, profit_pct numeric, pct_complete numeric, bill_pct numeric);
    GET DIAGNOSTICS _budget = ROW_COUNT;
  END IF;

  IF _payload ? 'cost_summaries' THEN
    DELETE FROM public.np_cmic_jobs WHERE source = 'cost_summaries';
    INSERT INTO public.np_cmic_jobs (source, job_code, job_name, status, job_start, company_code, company_name)
      SELECT 'cost_summaries', x.job_code, x.job_name, x.status, x.job_start, x.company_code, x.company_name
      FROM jsonb_to_recordset(coalesce(_payload->'cost_summaries'->'jobs', '[]'::jsonb))
        AS x(job_code text, job_name text, status text, job_start date, company_code text, company_name text);
    GET DIAGNOSTICS _summary = ROW_COUNT;

    INSERT INTO public.np_cmic_cost_lines (job_id, division_code, division_name, cost_code, cost_code_name, category_code, category_name, original_budgeted_cost, change_order_amount, current_budgeted_cost, projected_cost, budgeted_revenue, budget_variance, committed_to_date, committed_remaining, yet_to_buy, spent_to_date, billed_to_date, spent_against_commitments, spent_outside_commitments)
      SELECT j.id, l->>0, l->>1, l->>2, l->>3, l->>4, l->>5, (l->>6)::numeric, (l->>7)::numeric, (l->>8)::numeric, (l->>9)::numeric, (l->>10)::numeric, (l->>11)::numeric, (l->>12)::numeric, (l->>13)::numeric, (l->>14)::numeric, (l->>15)::numeric, (l->>16)::numeric, (l->>17)::numeric, (l->>18)::numeric
      FROM jsonb_to_recordset(coalesce(_payload->'cost_summaries'->'jobs', '[]'::jsonb))
        AS x(job_code text, lines jsonb)
      JOIN public.np_cmic_jobs j ON j.source = 'cost_summaries' AND j.job_code = x.job_code
      CROSS JOIN LATERAL jsonb_array_elements(coalesce(x.lines, '[]'::jsonb)) AS l;
    GET DIAGNOSTICS _lines = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('budget_jobs', _budget, 'cost_summary_jobs', _summary, 'cost_lines', _lines);
END; $$;

REVOKE ALL ON FUNCTION public.np_replace_cmic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.np_replace_cmic(jsonb) TO authenticated;
