ALTER TABLE public.app_roles
  ADD COLUMN IF NOT EXISTS can_add_projects boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_projects boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_delete_projects boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_add_photos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_photos boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_delete_photos boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.has_perm(_user_id uuid, _perm text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _has_roles boolean; _ok boolean;
BEGIN
  IF public.is_admin(_user_id) THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.app_roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND r.is_active
  ) INTO _has_roles;

  IF NOT _has_roles THEN RETURN true; END IF;

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

  RETURN _ok;
END; $$;

DROP POLICY IF EXISTS "company insert jobs" ON public.jobs;
CREATE POLICY "company insert jobs" ON public.jobs FOR INSERT TO authenticated
  WITH CHECK (is_company_member(company_id, auth.uid()) AND user_id = auth.uid() AND has_perm(auth.uid(), 'add_projects'));

DROP POLICY IF EXISTS "company update jobs" ON public.jobs;
CREATE POLICY "company update jobs" ON public.jobs FOR UPDATE TO authenticated
  USING (is_company_member(company_id, auth.uid()) AND has_perm(auth.uid(), 'edit_projects'));

DROP POLICY IF EXISTS "company delete jobs" ON public.jobs;
CREATE POLICY "company delete jobs" ON public.jobs FOR DELETE TO authenticated
  USING (company_role_of(company_id, auth.uid()) = ANY (ARRAY['owner'::company_role, 'admin'::company_role])
         AND has_perm(auth.uid(), 'delete_projects'));

DROP POLICY IF EXISTS "company insert photos" ON public.photos;
CREATE POLICY "company insert photos" ON public.photos FOR INSERT TO authenticated
  WITH CHECK (is_company_member(company_id, auth.uid()) AND user_id = auth.uid() AND has_perm(auth.uid(), 'add_photos'));

DROP POLICY IF EXISTS "company update photos" ON public.photos;
CREATE POLICY "company update photos" ON public.photos FOR UPDATE TO authenticated
  USING (is_company_member(company_id, auth.uid()) AND has_perm(auth.uid(), 'edit_photos'));

DROP POLICY IF EXISTS "company delete photos" ON public.photos;
CREATE POLICY "company delete photos" ON public.photos FOR DELETE TO authenticated
  USING (is_company_member(company_id, auth.uid())
         AND (user_id = auth.uid() OR company_role_of(company_id, auth.uid()) = ANY (ARRAY['owner'::company_role, 'admin'::company_role]))
         AND has_perm(auth.uid(), 'delete_photos'));