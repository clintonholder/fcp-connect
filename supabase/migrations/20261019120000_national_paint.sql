-- National Paint foundation: the manage_national_paint permission and the np_* tables.
--
-- manage_national_paint is one level (view, edit and see finance), off by default for every role;
-- admins always pass private.has_perm. np_pms, np_contractors, np_crews, np_crew_members,
-- np_projects and np_budget_targets are readable and writable only with that permission
-- (permissive policies), and the restrictive view_as_block_* policies stop an admin with an active
-- proxy session (View As) from writing. np_import_workbook replaces all of the data from a parsed
-- workbook in one transaction; it is SECURITY INVOKER, so the table policies still apply, and it
-- refuses anyone who is not an admin. This migration inserts no rows.
--
-- Manual checks. A human runs these in the Supabase SQL editor; each is always rolled back.
-- Replace <np-uuid> with a user with manage_national_paint, <nonp-uuid> with a user without it
-- (and not an admin), and <admin-uuid> with an admin who has an active proxy_sessions row.
--
-- (a) A user without the permission sees 0 rows and cannot insert.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<nonp-uuid>","role":"authenticated"}', true);
--   SELECT count(*) FROM public.np_projects;
--   -- Expected: 0.
--   INSERT INTO public.np_pms (name) VALUES ('Test PM');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--
-- (b) A user with the permission can select and insert.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<np-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.np_pms (name) VALUES ('Test PM');
--   SELECT count(*) FROM public.np_pms;
--   -- Expected: the insert succeeds and the count includes the new row.
--   ROLLBACK;
--
-- (c) An admin with an active proxy session cannot insert.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.np_pms (name) VALUES ('Test PM');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--
-- (d) A bad status value is rejected.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<np-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.np_projects (name, status) VALUES ('Test project', 'Bogus');
--   -- Expected: ERROR: new row for relation "np_projects" violates check constraint.
--   ROLLBACK;

ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS can_manage_national_paint boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.has_perm(_user_id uuid, _perm text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _ok boolean;
BEGIN
  IF private.is_admin(_user_id) THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.app_roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND r.is_active
      AND CASE _perm
        WHEN 'add_projects'    THEN r.can_add_projects
        WHEN 'edit_projects'   THEN r.can_edit_projects
        WHEN 'delete_projects' THEN r.can_delete_projects
        WHEN 'add_photos'      THEN r.can_add_photos
        WHEN 'edit_photos'     THEN r.can_edit_photos
        WHEN 'delete_photos'   THEN r.can_delete_photos
        WHEN 'view_safety'     THEN r.can_view_safety
        WHEN 'manage_safety'   THEN r.can_manage_safety
        WHEN 'send_messages'   THEN r.can_send_messages
        WHEN 'manage_national_paint' THEN r.can_manage_national_paint
        ELSE false END
  ) INTO _ok;

  RETURN COALESCE(_ok, false);
END; $$;

REVOKE ALL ON FUNCTION private.has_perm(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_perm(uuid, text) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.np_pms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.np_contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.np_crews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  contractor_id uuid NULL REFERENCES public.np_contractors(id) ON DELETE RESTRICT,
  owner_name text NULL,
  crew_type text NULL CHECK (crew_type IN ('Project Manager','In-House','Sub-Contractor')),
  size integer NULL CHECK (size >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS np_crews_contractor_name_idx ON public.np_crews
  (coalesce(contractor_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

CREATE TABLE IF NOT EXISTS public.np_crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.np_crews(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (btrim(name) <> ''),
  role text NOT NULL CHECK (role IN ('foreman','tech')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS np_crew_members_crew_id_idx ON public.np_crew_members (crew_id);

CREATE TABLE IF NOT EXISTS public.np_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cmic_job_number text NULL,
  name text NOT NULL CHECK (btrim(name) <> ''),
  address text NULL,
  city text NULL,
  state text NULL,
  pm_id uuid NULL REFERENCES public.np_pms(id) ON DELETE RESTRICT,
  contractor_id uuid NULL REFERENCES public.np_contractors(id) ON DELETE RESTRICT,
  crew_id uuid NULL REFERENCES public.np_crews(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'Potential'
    CHECK (status IN ('Potential','Verbal Award','Upcoming','Scheduled','In Progress','Completed')),
  progress numeric NULL CHECK (progress BETWEEN 0 AND 1),
  est_start date NULL,
  est_end date NULL,
  deadline date NULL,
  est_revenue numeric(14,2) NULL,
  notes text NULL,
  tag text NULL,
  exclude_revenue boolean NOT NULL DEFAULT false,
  bonus_eligible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (est_end IS NULL OR est_start IS NULL OR est_end >= est_start)
);

CREATE TABLE IF NOT EXISTS public.np_budget_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (year, month)
);

DROP TRIGGER IF EXISTS np_pms_set_updated_at ON public.np_pms;
CREATE TRIGGER np_pms_set_updated_at BEFORE UPDATE ON public.np_pms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.np_pms ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS np_contractors_set_updated_at ON public.np_contractors;
CREATE TRIGGER np_contractors_set_updated_at BEFORE UPDATE ON public.np_contractors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.np_contractors ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS np_crews_set_updated_at ON public.np_crews;
CREATE TRIGGER np_crews_set_updated_at BEFORE UPDATE ON public.np_crews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.np_crews ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS np_crew_members_set_updated_at ON public.np_crew_members;
CREATE TRIGGER np_crew_members_set_updated_at BEFORE UPDATE ON public.np_crew_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.np_crew_members ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS np_projects_set_updated_at ON public.np_projects;
CREATE TRIGGER np_projects_set_updated_at BEFORE UPDATE ON public.np_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.np_projects ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS np_budget_targets_set_updated_at ON public.np_budget_targets;
CREATE TRIGGER np_budget_targets_set_updated_at BEFORE UPDATE ON public.np_budget_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.np_budget_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "np_pms_select" ON public.np_pms;
DROP POLICY IF EXISTS "np_pms_insert" ON public.np_pms;
DROP POLICY IF EXISTS "np_pms_update" ON public.np_pms;
DROP POLICY IF EXISTS "np_pms_delete" ON public.np_pms;
CREATE POLICY "np_pms_select" ON public.np_pms FOR SELECT TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_pms_insert" ON public.np_pms FOR INSERT TO authenticated
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_pms_update" ON public.np_pms FOR UPDATE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'))
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_pms_delete" ON public.np_pms FOR DELETE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));

DROP POLICY IF EXISTS "np_contractors_select" ON public.np_contractors;
DROP POLICY IF EXISTS "np_contractors_insert" ON public.np_contractors;
DROP POLICY IF EXISTS "np_contractors_update" ON public.np_contractors;
DROP POLICY IF EXISTS "np_contractors_delete" ON public.np_contractors;
CREATE POLICY "np_contractors_select" ON public.np_contractors FOR SELECT TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_contractors_insert" ON public.np_contractors FOR INSERT TO authenticated
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_contractors_update" ON public.np_contractors FOR UPDATE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'))
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_contractors_delete" ON public.np_contractors FOR DELETE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));

DROP POLICY IF EXISTS "np_crews_select" ON public.np_crews;
DROP POLICY IF EXISTS "np_crews_insert" ON public.np_crews;
DROP POLICY IF EXISTS "np_crews_update" ON public.np_crews;
DROP POLICY IF EXISTS "np_crews_delete" ON public.np_crews;
CREATE POLICY "np_crews_select" ON public.np_crews FOR SELECT TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_crews_insert" ON public.np_crews FOR INSERT TO authenticated
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_crews_update" ON public.np_crews FOR UPDATE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'))
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_crews_delete" ON public.np_crews FOR DELETE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));

DROP POLICY IF EXISTS "np_crew_members_select" ON public.np_crew_members;
DROP POLICY IF EXISTS "np_crew_members_insert" ON public.np_crew_members;
DROP POLICY IF EXISTS "np_crew_members_update" ON public.np_crew_members;
DROP POLICY IF EXISTS "np_crew_members_delete" ON public.np_crew_members;
CREATE POLICY "np_crew_members_select" ON public.np_crew_members FOR SELECT TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_crew_members_insert" ON public.np_crew_members FOR INSERT TO authenticated
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_crew_members_update" ON public.np_crew_members FOR UPDATE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'))
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_crew_members_delete" ON public.np_crew_members FOR DELETE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));

DROP POLICY IF EXISTS "np_projects_select" ON public.np_projects;
DROP POLICY IF EXISTS "np_projects_insert" ON public.np_projects;
DROP POLICY IF EXISTS "np_projects_update" ON public.np_projects;
DROP POLICY IF EXISTS "np_projects_delete" ON public.np_projects;
CREATE POLICY "np_projects_select" ON public.np_projects FOR SELECT TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_projects_insert" ON public.np_projects FOR INSERT TO authenticated
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_projects_update" ON public.np_projects FOR UPDATE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'))
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_projects_delete" ON public.np_projects FOR DELETE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));

DROP POLICY IF EXISTS "np_budget_targets_select" ON public.np_budget_targets;
DROP POLICY IF EXISTS "np_budget_targets_insert" ON public.np_budget_targets;
DROP POLICY IF EXISTS "np_budget_targets_update" ON public.np_budget_targets;
DROP POLICY IF EXISTS "np_budget_targets_delete" ON public.np_budget_targets;
CREATE POLICY "np_budget_targets_select" ON public.np_budget_targets FOR SELECT TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_budget_targets_insert" ON public.np_budget_targets FOR INSERT TO authenticated
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_budget_targets_update" ON public.np_budget_targets FOR UPDATE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'))
  WITH CHECK (private.has_perm(auth.uid(), 'manage_national_paint'));
CREATE POLICY "np_budget_targets_delete" ON public.np_budget_targets FOR DELETE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_national_paint'));

-- View As is read-only: same restrictive policies as 20261016140000_view_as_proxy_sessions.sql.

DROP POLICY IF EXISTS "view_as_block_insert" ON public.np_pms;
DROP POLICY IF EXISTS "view_as_block_update" ON public.np_pms;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.np_pms;
CREATE POLICY "view_as_block_insert" ON public.np_pms AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.np_pms AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.np_pms AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));

DROP POLICY IF EXISTS "view_as_block_insert" ON public.np_contractors;
DROP POLICY IF EXISTS "view_as_block_update" ON public.np_contractors;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.np_contractors;
CREATE POLICY "view_as_block_insert" ON public.np_contractors AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.np_contractors AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.np_contractors AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));

DROP POLICY IF EXISTS "view_as_block_insert" ON public.np_crews;
DROP POLICY IF EXISTS "view_as_block_update" ON public.np_crews;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.np_crews;
CREATE POLICY "view_as_block_insert" ON public.np_crews AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.np_crews AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.np_crews AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));

DROP POLICY IF EXISTS "view_as_block_insert" ON public.np_crew_members;
DROP POLICY IF EXISTS "view_as_block_update" ON public.np_crew_members;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.np_crew_members;
CREATE POLICY "view_as_block_insert" ON public.np_crew_members AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.np_crew_members AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.np_crew_members AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));

DROP POLICY IF EXISTS "view_as_block_insert" ON public.np_projects;
DROP POLICY IF EXISTS "view_as_block_update" ON public.np_projects;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.np_projects;
CREATE POLICY "view_as_block_insert" ON public.np_projects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.np_projects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.np_projects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));

DROP POLICY IF EXISTS "view_as_block_insert" ON public.np_budget_targets;
DROP POLICY IF EXISTS "view_as_block_update" ON public.np_budget_targets;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.np_budget_targets;
CREATE POLICY "view_as_block_insert" ON public.np_budget_targets AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.np_budget_targets AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.np_budget_targets AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));

-- Replaces all National Paint data from a parsed workbook in one transaction.
-- _payload: { budget_year, pms: [{name}], contractors: [{name}],
--   crews: [{name, contractor, owner_name, crew_type, size}],
--   projects: [{cmic_job_number, name, address, city, state, pm, contractor, crew, status, progress,
--     est_start, est_end, deadline, est_revenue, notes, tag, exclude_revenue, bonus_eligible}],
--   budget: [{month, amount}] }
-- Names are resolved case-insensitively. Returns the inserted counts.
CREATE OR REPLACE FUNCTION public.np_import_workbook(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  _year integer := (_payload->>'budget_year')::integer;
  _pms integer;
  _contractors integer;
  _crews integer;
  _projects integer;
  _budget integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden: administrators only';
  END IF;
  IF _year IS NULL THEN
    RAISE EXCEPTION 'budget_year is required';
  END IF;

  DELETE FROM public.np_projects WHERE true;
  DELETE FROM public.np_crews WHERE true;
  DELETE FROM public.np_contractors WHERE true;
  DELETE FROM public.np_pms WHERE true;
  DELETE FROM public.np_budget_targets WHERE year = _year;

  INSERT INTO public.np_pms (name)
    SELECT x.name FROM jsonb_to_recordset(coalesce(_payload->'pms', '[]'::jsonb)) AS x(name text);
  GET DIAGNOSTICS _pms = ROW_COUNT;

  INSERT INTO public.np_contractors (name)
    SELECT x.name FROM jsonb_to_recordset(coalesce(_payload->'contractors', '[]'::jsonb)) AS x(name text);
  GET DIAGNOSTICS _contractors = ROW_COUNT;

  INSERT INTO public.np_crews (name, contractor_id, owner_name, crew_type, size)
    SELECT x.name, c.id, x.owner_name, x.crew_type, x.size
    FROM jsonb_to_recordset(coalesce(_payload->'crews', '[]'::jsonb))
      AS x(name text, contractor text, owner_name text, crew_type text, size integer)
    LEFT JOIN public.np_contractors c ON lower(c.name) = lower(x.contractor);
  GET DIAGNOSTICS _crews = ROW_COUNT;

  INSERT INTO public.np_projects (
    cmic_job_number, name, address, city, state, pm_id, contractor_id, crew_id, status, progress,
    est_start, est_end, deadline, est_revenue, notes, tag, exclude_revenue, bonus_eligible
  )
    SELECT x.cmic_job_number, x.name, x.address, x.city, x.state, pm.id, c.id, cr.id, x.status,
      x.progress, x.est_start, x.est_end, x.deadline, x.est_revenue, x.notes, x.tag,
      coalesce(x.exclude_revenue, false), coalesce(x.bonus_eligible, false)
    FROM jsonb_to_recordset(coalesce(_payload->'projects', '[]'::jsonb)) AS x(
      cmic_job_number text, name text, address text, city text, state text, pm text,
      contractor text, crew text, status text, progress numeric, est_start date, est_end date,
      deadline date, est_revenue numeric, notes text, tag text, exclude_revenue boolean,
      bonus_eligible boolean
    )
    LEFT JOIN public.np_pms pm ON lower(pm.name) = lower(x.pm)
    LEFT JOIN public.np_contractors c ON lower(c.name) = lower(x.contractor)
    LEFT JOIN public.np_crews cr
      ON lower(cr.name) = lower(x.crew) AND cr.contractor_id IS NOT DISTINCT FROM c.id;
  GET DIAGNOSTICS _projects = ROW_COUNT;

  INSERT INTO public.np_budget_targets (year, month, amount)
    SELECT _year, x.month, x.amount
    FROM jsonb_to_recordset(coalesce(_payload->'budget', '[]'::jsonb)) AS x(month integer, amount numeric);
  GET DIAGNOSTICS _budget = ROW_COUNT;

  RETURN jsonb_build_object(
    'pms', _pms, 'contractors', _contractors, 'crews', _crews,
    'projects', _projects, 'budget_months', _budget
  );
END; $$;

REVOKE ALL ON FUNCTION public.np_import_workbook(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.np_import_workbook(jsonb) TO authenticated;
