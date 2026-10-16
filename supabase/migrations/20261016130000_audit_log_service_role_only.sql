-- Audit rows are written only by server functions using the service role
-- (supabaseAdmin), which bypasses RLS. The client-side insert policy let any
-- signed-in user forge audit rows from the browser, so drop it.
DROP POLICY IF EXISTS "authenticated write audit" ON public.audit_log;
