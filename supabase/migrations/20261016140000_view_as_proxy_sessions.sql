-- Enforce read-only "View As" in the database. While an admin has an active
-- proxy session, restrictive policies refuse every write made on their own
-- (authenticated) session. Service-role server functions are not affected.

CREATE TABLE IF NOT EXISTS public.proxy_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_user_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours',
  ended_at timestamptz
);
CREATE INDEX IF NOT EXISTS proxy_sessions_admin_id_idx ON public.proxy_sessions (admin_id);

-- RLS on with no policies: only the service role reads or writes this table.
ALTER TABLE public.proxy_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.has_active_proxy(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proxy_sessions ps
    WHERE ps.admin_id = _user_id AND ps.ended_at IS NULL AND ps.expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION private.has_active_proxy(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_active_proxy(uuid) TO authenticated, service_role;

-- Restrictive write policies on every public table with RLS.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'activity_events', 'app_roles', 'areas', 'audit_log', 'checklist_item_photos',
    'checklist_items', 'checklist_questions', 'checklists', 'comments', 'companies',
    'company_members', 'invitations', 'jobs', 'photos', 'profiles', 'project_collaborators',
    'project_notes', 'share_links', 'user_divisions', 'user_roles'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "view_as_block_insert" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "view_as_block_update" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "view_as_block_delete" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "view_as_block_insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT private.has_active_proxy(auth.uid()))', t);
    EXECUTE format(
      'CREATE POLICY "view_as_block_update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT private.has_active_proxy(auth.uid())) WITH CHECK (NOT private.has_active_proxy(auth.uid()))', t);
    EXECUTE format(
      'CREATE POLICY "view_as_block_delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT private.has_active_proxy(auth.uid()))', t);
  END LOOP;
END $$;

-- Storage: all buckets (covers job-photos).
DROP POLICY IF EXISTS "view_as_block_insert" ON storage.objects;
DROP POLICY IF EXISTS "view_as_block_update" ON storage.objects;
DROP POLICY IF EXISTS "view_as_block_delete" ON storage.objects;
CREATE POLICY "view_as_block_insert" ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));
