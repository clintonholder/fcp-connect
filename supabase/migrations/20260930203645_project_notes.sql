CREATE TABLE public.project_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_notes_job_idx ON public.project_notes(job_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_notes TO authenticated;
GRANT ALL ON public.project_notes TO service_role;

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view project notes" ON public.project_notes
  FOR SELECT TO authenticated
  USING (private.can_see_job(job_id, auth.uid()));

CREATE POLICY "add project notes" ON public.project_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND private.can_see_job(job_id, auth.uid())
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = job_id AND j.archived_at IS NULL)
  );

CREATE POLICY "edit own project notes" ON public.project_notes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND private.can_see_job(job_id, auth.uid()))
  WITH CHECK (user_id = auth.uid() AND private.can_see_job(job_id, auth.uid()));

CREATE POLICY "delete own project notes" ON public.project_notes
  FOR DELETE TO authenticated
  USING (
    private.can_see_job(job_id, auth.uid())
    AND (user_id = auth.uid() OR private.is_admin(auth.uid()))
  );

CREATE TRIGGER project_notes_set_updated_at
  BEFORE UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();