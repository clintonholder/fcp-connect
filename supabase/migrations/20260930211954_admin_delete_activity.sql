GRANT DELETE ON public.activity_events TO authenticated;
CREATE POLICY "admin delete activity" ON public.activity_events FOR DELETE TO authenticated USING (private.is_admin(auth.uid()));