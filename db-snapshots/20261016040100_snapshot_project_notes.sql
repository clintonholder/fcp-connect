-- Snapshot of public.project_notes as it exists in production on 2026-10-16.
-- Safe to re-run. Depends on: public.jobs, public.set_updated_at(),
-- private.can_see_job, private.is_admin.

CREATE TABLE IF NOT EXISTS public.project_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT project_notes_pkey PRIMARY KEY (id),
  CONSTRAINT project_notes_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT project_notes_body_check CHECK ((length(TRIM(BOTH FROM body)) > 0))
);

CREATE INDEX IF NOT EXISTS project_notes_job_idx ON public.project_notes USING btree (job_id, created_at DESC);

-- Production ACL: ALL to anon, authenticated and service_role (policies are TO authenticated).
GRANT ALL ON public.project_notes TO anon, authenticated, service_role;

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "view project notes" ON public.project_notes;
DROP POLICY IF EXISTS "add project notes" ON public.project_notes;
DROP POLICY IF EXISTS "edit own project notes" ON public.project_notes;
DROP POLICY IF EXISTS "delete own project notes" ON public.project_notes;

CREATE POLICY "view project notes" ON public.project_notes AS PERMISSIVE FOR SELECT TO authenticated
  USING (private.can_see_job(job_id, auth.uid()));

CREATE POLICY "add project notes" ON public.project_notes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = auth.uid()) AND private.can_see_job(job_id, auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.jobs j
  WHERE ((j.id = project_notes.job_id) AND (j.archived_at IS NULL))))));

CREATE POLICY "edit own project notes" ON public.project_notes AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((private.can_see_job(job_id, auth.uid()) AND ((user_id = auth.uid()) OR private.is_admin(auth.uid()))))
  WITH CHECK ((private.can_see_job(job_id, auth.uid()) AND ((user_id = auth.uid()) OR private.is_admin(auth.uid()))));

CREATE POLICY "delete own project notes" ON public.project_notes AS PERMISSIVE FOR DELETE TO authenticated
  USING ((private.can_see_job(job_id, auth.uid()) AND ((user_id = auth.uid()) OR private.is_admin(auth.uid()))));

DROP TRIGGER IF EXISTS project_notes_set_updated_at ON public.project_notes;
CREATE TRIGGER project_notes_set_updated_at BEFORE UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
