CREATE TABLE public.project_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid REFERENCES public.app_roles(id) ON DELETE SET NULL,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_collaborators TO authenticated;
GRANT ALL ON public.project_collaborators TO service_role;

ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company view collaborators" ON public.project_collaborators
  FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));

CREATE POLICY "editors insert collaborators" ON public.project_collaborators
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(company_id, auth.uid()) AND public.has_perm(auth.uid(), 'edit_projects'));

CREATE POLICY "editors update collaborators" ON public.project_collaborators
  FOR UPDATE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()) AND public.has_perm(auth.uid(), 'edit_projects'));

CREATE POLICY "editors delete collaborators" ON public.project_collaborators
  FOR DELETE TO authenticated
  USING (public.is_company_member(company_id, auth.uid()) AND public.has_perm(auth.uid(), 'edit_projects'));

CREATE TRIGGER project_collaborators_set_updated_at
  BEFORE UPDATE ON public.project_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();