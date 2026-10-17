-- Worker type on accounts: FCP Employee or Sub Contractor. Existing users become
-- employees. A Sub Contractor must have a name.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS worker_type text NOT NULL DEFAULT 'employee';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subcontractor_name text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_worker_type_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_worker_type_check CHECK (worker_type IN ('employee', 'subcontractor'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subcontractor_name_required;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subcontractor_name_required
  CHECK (worker_type <> 'subcontractor' OR NULLIF(btrim(subcontractor_name), '') IS NOT NULL);
