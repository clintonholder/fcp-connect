-- National Paint reported revenue: np_budget_targets.reported_revenue.
--
-- The Dashboard compares each month's budget with scheduled and reported revenue. Reported is a
-- hand-entered monthly figure; NULL means "not reported yet, use scheduled". The column is covered
-- by the existing np_budget_targets permission policies and the restrictive view_as_block_*
-- policies, so this migration adds no table and no policy, inserts no rows and does not change
-- np_import_workbook (a workbook import replaces the year's rows, which resets reported to NULL).
--
-- Manual checks. A human runs these in the Supabase SQL editor; each is always rolled back.
-- Replace <np-uuid> with a user with manage_national_paint, <nonp-uuid> with a user without it
-- (and not an admin), and <admin-uuid> with an admin who has an active proxy_sessions row.
-- <year> and <month> identify an existing np_budget_targets row.
--
-- (a) A user with the permission can update reported_revenue.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<np-uuid>","role":"authenticated"}', true);
--   UPDATE public.np_budget_targets SET reported_revenue = 1000 WHERE year = <year> AND month = <month>;
--   -- Expected: UPDATE 1.
--   ROLLBACK;
--
-- (b) A user without the permission cannot.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<nonp-uuid>","role":"authenticated"}', true);
--   UPDATE public.np_budget_targets SET reported_revenue = 1000 WHERE year = <year> AND month = <month>;
--   -- Expected: UPDATE 0 (the row is not visible to the user).
--   ROLLBACK;
--
-- (c) An admin with an active proxy session cannot.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   UPDATE public.np_budget_targets SET reported_revenue = 1000 WHERE year = <year> AND month = <month>;
--   -- Expected: UPDATE 0 (the restrictive policy refuses the write).
--   ROLLBACK;
--
-- (d) A negative value is rejected.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<np-uuid>","role":"authenticated"}', true);
--   UPDATE public.np_budget_targets SET reported_revenue = -1 WHERE year = <year> AND month = <month>;
--   -- Expected: ERROR: new row for relation "np_budget_targets" violates check constraint
--   -- "np_budget_targets_reported_revenue_check".
--   ROLLBACK;

ALTER TABLE public.np_budget_targets ADD COLUMN IF NOT EXISTS reported_revenue numeric(14,2) NULL;

ALTER TABLE public.np_budget_targets DROP CONSTRAINT IF EXISTS np_budget_targets_reported_revenue_check;
ALTER TABLE public.np_budget_targets ADD CONSTRAINT np_budget_targets_reported_revenue_check
  CHECK (reported_revenue IS NULL OR reported_revenue >= 0);
