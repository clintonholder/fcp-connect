DROP POLICY IF EXISTS "edit own project notes" ON public.project_notes;
CREATE POLICY "edit own project notes" ON public.project_notes
  FOR UPDATE TO authenticated
  USING (
    private.can_see_job(job_id, auth.uid())
    AND (user_id = auth.uid() OR private.is_admin(auth.uid()))
  )
  WITH CHECK (
    private.can_see_job(job_id, auth.uid())
    AND (user_id = auth.uid() OR private.is_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "self update comments" ON public.comments;
CREATE POLICY "self update comments" ON public.comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR private.is_admin(auth.uid()))
  WITH CHECK (
    private.can_see_job(job_id, auth.uid())
    AND (user_id = auth.uid() OR private.is_admin(auth.uid()))
  );