-- 1. has_perm: deny by default when the user has no roles
CREATE OR REPLACE FUNCTION public.has_perm(_user_id uuid, _perm text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _ok boolean;
BEGIN
  IF public.is_admin(_user_id) THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.app_roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND r.is_active
      AND CASE _perm
        WHEN 'add_projects'    THEN r.can_add_projects
        WHEN 'edit_projects'   THEN r.can_edit_projects
        WHEN 'delete_projects' THEN r.can_delete_projects
        WHEN 'add_photos'      THEN r.can_add_photos
        WHEN 'edit_photos'     THEN r.can_edit_photos
        WHEN 'delete_photos'   THEN r.can_delete_photos
        ELSE false END
  ) INTO _ok;

  RETURN COALESCE(_ok, false);
END; $function$;

-- 2. profiles: only self or people sharing a company
DROP POLICY IF EXISTS "any member view profile" ON public.profiles;
CREATE POLICY "self or shared company view profile"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.company_members me
    JOIN public.company_members them ON them.company_id = me.company_id
    WHERE me.user_id = auth.uid() AND them.user_id = profiles.id
  )
);

-- 3. storage: one consistent policy per action, no public read
DROP POLICY IF EXISTS "Public read job photos" ON storage.objects;
DROP POLICY IF EXISTS "job-photos public read" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload job photos" ON storage.objects;
DROP POLICY IF EXISTS "job-photos auth upload" ON storage.objects;
DROP POLICY IF EXISTS "Auth update own job photos" ON storage.objects;
DROP POLICY IF EXISTS "job-photos owner update" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete own job photos" ON storage.objects;
DROP POLICY IF EXISTS "job-photos owner delete" ON storage.objects;

CREATE POLICY "job photos company read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'job-photos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.photos p
      WHERE p.storage_path = storage.objects.name
        AND public.is_company_member(p.company_id, auth.uid())
    )
  )
);

CREATE POLICY "job photos own folder upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-photos'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

CREATE POLICY "job photos owner or company admin update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'job-photos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.photos p
      WHERE p.storage_path = storage.objects.name
        AND public.company_role_of(p.company_id, auth.uid()) IN ('owner','admin')
    )
  )
);

CREATE POLICY "job photos owner or company admin delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'job-photos'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR EXISTS (
      SELECT 1 FROM public.photos p
      WHERE p.storage_path = storage.objects.name
        AND public.company_role_of(p.company_id, auth.uid()) IN ('owner','admin')
    )
  )
);

-- 4. security definer functions: not callable by signed-out visitors,
--    trigger-only functions not callable by anyone through the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_perm(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_company_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.company_role_of(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_shared_job(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_perm(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_company_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.company_role_of(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_job(text) TO service_role;