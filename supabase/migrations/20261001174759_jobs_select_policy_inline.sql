DROP POLICY IF EXISTS "company view jobs" ON public.jobs;
CREATE POLICY "company view jobs" ON public.jobs FOR SELECT TO authenticated
USING (
  private.is_company_member(company_id, auth.uid())
  AND (
    private.is_admin(auth.uid())
    OR user_id = auth.uid()
    OR owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.project_collaborators pc WHERE pc.job_id = jobs.id AND pc.user_id = auth.uid())
    OR (
      private.is_director(auth.uid()) AND (
        COALESCE(jobs.divisions, '{}'::text[]) && private.user_divisions(auth.uid())
        OR (jobs.division IS NOT NULL AND jobs.division = ANY (private.user_divisions(auth.uid())))
      )
    )
  )
);