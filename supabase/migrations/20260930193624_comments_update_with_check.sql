DROP POLICY IF EXISTS "self update comments" ON public.comments;
CREATE POLICY "self update comments" ON public.comments FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid() AND private.can_see_job(job_id, auth.uid()));