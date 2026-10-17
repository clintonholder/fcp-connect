-- Job Hazard Analysis (JHA): admin-managed hazard items and one JHA record per project.
--
-- Lifecycle: a JHA is required once per project, not daily. The first completed record satisfies
-- the project. It is redone only when a new one is requested: a request is a pending row
-- (completed_at IS NULL, at most one per project), and completing it stamps the signer and time.
-- Completed records never change and are never deleted (no DELETE policy). Answers are a snapshot
-- of the prompt text, so editing or deleting a hazard item does not alter completed records.
--
-- Who reads records: the project owner (jobs.owner_id), project collaborators and users with
-- manage_safety (admins always). Directors and others who can see the project but are not one of
-- those cannot read its JHA records. Hazard items (jha_templates) are readable by every signed-in
-- user and written only by manage_safety.
--
-- Who may request a new JHA: manage_safety holders and the project owner. Any owner, collaborator
-- or manager may complete the first or a pending JHA. Nothing can change on an archived project.
--
-- Manual checks. A human runs these in the Supabase SQL editor; each is always rolled back.
-- Replace <collab-uuid> with a collaborator (not owner, no manage_safety) of <completed-job-uuid>,
-- <other-job-uuid> with a project they do not collaborate on, <director-uuid> with a director who
-- is neither owner nor collaborator and lacks manage_safety, <completed-job-uuid> with a project
-- that has a completed JHA and no pending one, <completed-id> with that completed record's id,
-- <nomanage-uuid> with a user without manage_safety, and <admin-uuid> with an admin who has an
-- active proxy_sessions row.
--
-- (a) A collaborator sees records only for their projects.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<collab-uuid>","role":"authenticated"}', true);
--   SELECT DISTINCT job_id FROM public.jha_records;
--   -- Expected: only projects the user owns or collaborates on; never <other-job-uuid>.
--   ROLLBACK;
--
-- (b) A director who is not owner or collaborator and lacks manage_safety sees none.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<director-uuid>","role":"authenticated"}', true);
--   SELECT count(*) FROM public.jha_records WHERE job_id = '<completed-job-uuid>';
--   -- Expected: 0.
--   ROLLBACK;
--
-- (c) A second completed INSERT on a completed project fails.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<collab-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.jha_records (job_id, answers, signature) VALUES
--     ('<completed-job-uuid>', '[{"template_id":"00000000-0000-0000-0000-000000000000","prompt":"x","answer":"yes"}]',
--      'data:image/png;base64,AAAA');
--   -- Expected: ERROR: This project's JHA is already complete; request a new one first.
--   ROLLBACK;
--
-- (d) Updating a completed record fails.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<collab-uuid>","role":"authenticated"}', true);
--   UPDATE public.jha_records SET signature = 'data:image/png;base64,BBBB' WHERE id = '<completed-id>';
--   -- Expected: ERROR: A completed JHA cannot be changed.
--   ROLLBACK;
--
-- (e) A collaborator who is not the owner and lacks manage_safety cannot insert a request row.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<collab-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.jha_records (job_id) VALUES ('<completed-job-uuid>');
--   -- Expected: ERROR: Only the project owner or a safety manager can request a new JHA.
--   ROLLBACK;
--
-- (f) A non-manager cannot insert into jha_templates.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<nomanage-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.jha_templates (prompt) VALUES ('x');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--
-- (g) An admin with an active proxy session cannot insert into either table.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.jha_templates (prompt) VALUES ('x');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.jha_records (job_id) VALUES ('<completed-job-uuid>');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;

CREATE TABLE IF NOT EXISTS public.jha_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt text NOT NULL CHECK (btrim(prompt) <> ''),
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS jha_templates_set_updated_at ON public.jha_templates;
CREATE TRIGGER jha_templates_set_updated_at BEFORE UPDATE ON public.jha_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.jha_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jha_templates_select" ON public.jha_templates;
CREATE POLICY "jha_templates_select" ON public.jha_templates FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "jha_templates_insert" ON public.jha_templates;
CREATE POLICY "jha_templates_insert" ON public.jha_templates FOR INSERT TO authenticated
  WITH CHECK (private.has_perm(auth.uid(), 'manage_safety'));

DROP POLICY IF EXISTS "jha_templates_update" ON public.jha_templates;
CREATE POLICY "jha_templates_update" ON public.jha_templates FOR UPDATE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_safety'))
  WITH CHECK (private.has_perm(auth.uid(), 'manage_safety'));

DROP POLICY IF EXISTS "jha_templates_delete" ON public.jha_templates;
CREATE POLICY "jha_templates_delete" ON public.jha_templates FOR DELETE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_safety'));

-- View As is read-only: same restrictive policies as 20261016140000_view_as_proxy_sessions.sql.
DROP POLICY IF EXISTS "view_as_block_insert" ON public.jha_templates;
DROP POLICY IF EXISTS "view_as_block_update" ON public.jha_templates;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.jha_templates;
CREATE POLICY "view_as_block_insert" ON public.jha_templates AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.jha_templates AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.jha_templates AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));

CREATE TABLE IF NOT EXISTS public.jha_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  requested_by uuid,
  requested_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  answers jsonb,
  signature text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT jha_records_completed_pair CHECK ((completed_at IS NULL) = (completed_by IS NULL)),
  CONSTRAINT jha_records_completed_content CHECK (
    completed_at IS NULL
    OR (
      answers IS NOT NULL
      AND jsonb_typeof(answers) = 'array'
      AND jsonb_array_length(answers) > 0
      AND signature IS NOT NULL
      AND signature LIKE 'data:image/png;base64,%'
      AND length(signature) <= 500000
    )
  )
);

-- At most one open request per project.
CREATE UNIQUE INDEX IF NOT EXISTS jha_records_one_pending_per_job
  ON public.jha_records (job_id) WHERE completed_at IS NULL;
CREATE INDEX IF NOT EXISTS jha_records_job_created_idx
  ON public.jha_records (job_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.can_access_jha(_job_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND (
    private.has_perm(_user_id, 'manage_safety')
    OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.owner_id = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.project_collaborators c
      WHERE c.job_id = _job_id AND c.user_id = _user_id
    )
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_jha(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_access_jha(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.jha_record_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _archived timestamptz; _found boolean; _owner uuid;
BEGIN
  SELECT true, j.archived_at, j.owner_id INTO _found, _archived, _owner
    FROM public.jobs j WHERE j.id = NEW.job_id;
  IF _found IS NOT TRUE OR _archived IS NOT NULL THEN
    RAISE EXCEPTION 'JHA cannot be changed on an archived project';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.answers IS NULL THEN
      IF NOT (private.has_perm(_uid, 'manage_safety') OR _owner = _uid) THEN
        RAISE EXCEPTION 'Only the project owner or a safety manager can request a new JHA';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.jha_records r WHERE r.job_id = NEW.job_id AND r.completed_at IS NOT NULL)
         OR EXISTS (SELECT 1 FROM public.jha_records r WHERE r.job_id = NEW.job_id AND r.completed_at IS NULL) THEN
        RAISE EXCEPTION 'A JHA is already required for this project';
      END IF;
      NEW.requested_by := _uid; NEW.requested_at := now();
      NEW.completed_by := NULL; NEW.completed_at := NULL; NEW.signature := NULL;
    ELSE
      IF EXISTS (SELECT 1 FROM public.jha_records r WHERE r.job_id = NEW.job_id) THEN
        RAISE EXCEPTION 'This project''s JHA is already complete; request a new one first';
      END IF;
      NEW.completed_by := _uid; NEW.completed_at := now();
      NEW.requested_by := NULL; NEW.requested_at := NULL;
    END IF;
  ELSE
    IF OLD.completed_at IS NOT NULL OR NEW.answers IS NULL THEN
      RAISE EXCEPTION 'A completed JHA cannot be changed';
    END IF;
    NEW.job_id := OLD.job_id; NEW.requested_by := OLD.requested_by;
    NEW.requested_at := OLD.requested_at; NEW.created_at := OLD.created_at;
    NEW.completed_by := _uid; NEW.completed_at := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS jha_records_guard ON public.jha_records;
CREATE TRIGGER jha_records_guard BEFORE INSERT OR UPDATE ON public.jha_records
  FOR EACH ROW EXECUTE FUNCTION private.jha_record_guard();

ALTER TABLE public.jha_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jha_records_select" ON public.jha_records;
CREATE POLICY "jha_records_select" ON public.jha_records FOR SELECT TO authenticated
  USING (private.can_access_jha(job_id, auth.uid()));

DROP POLICY IF EXISTS "jha_records_insert" ON public.jha_records;
CREATE POLICY "jha_records_insert" ON public.jha_records FOR INSERT TO authenticated
  WITH CHECK (private.can_access_jha(job_id, auth.uid()));

DROP POLICY IF EXISTS "jha_records_update" ON public.jha_records;
CREATE POLICY "jha_records_update" ON public.jha_records FOR UPDATE TO authenticated
  USING (private.can_access_jha(job_id, auth.uid()))
  WITH CHECK (private.can_access_jha(job_id, auth.uid()));

-- View As is read-only: same restrictive policies as 20261016140000_view_as_proxy_sessions.sql.
DROP POLICY IF EXISTS "view_as_block_insert" ON public.jha_records;
DROP POLICY IF EXISTS "view_as_block_update" ON public.jha_records;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.jha_records;
CREATE POLICY "view_as_block_insert" ON public.jha_records AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.jha_records AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.jha_records AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));
