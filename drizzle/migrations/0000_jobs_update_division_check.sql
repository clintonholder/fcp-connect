DROP POLICY IF EXISTS "company update jobs" ON public.jobs;
CREATE POLICY "company update jobs" ON public.jobs FOR UPDATE TO authenticated
USING (private.is_company_member(company_id, auth.uid()) AND private.can_see_job(id, auth.uid()) AND private.has_perm(auth.uid(), 'edit_projects'))
WITH CHECK (private.is_company_member(company_id, auth.uid()) AND private.can_see_job(id, auth.uid()) AND private.has_perm(auth.uid(), 'edit_projects')
  AND (private.is_admin(auth.uid()) OR (COALESCE(array_length(divisions,1),0) > 0 AND divisions <@ private.user_divisions(auth.uid()))));