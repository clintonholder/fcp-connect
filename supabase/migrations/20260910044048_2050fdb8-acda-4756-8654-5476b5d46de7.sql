-- 1. Move privileged helper implementations out of the exposed schema -------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.app_roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND r.is_admin AND r.is_active
  );
$$;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.app_roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND r.name = _role_name AND r.is_active
  );
$$;

CREATE OR REPLACE FUNCTION private.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION private.company_role_of(_company_id uuid, _user_id uuid)
RETURNS public.company_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.is_company_owner(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.companies WHERE id = _company_id AND owner_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION private.has_perm(_user_id uuid, _perm text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _ok boolean;
BEGIN
  IF private.is_admin(_user_id) THEN RETURN true; END IF;

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
END; $$;

REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_company_member(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.company_role_of(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_company_owner(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_perm(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_company_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.company_role_of(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_company_owner(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_perm(uuid, text) TO authenticated, service_role;

-- 2. Public entry points become thin SECURITY INVOKER wrappers -------------
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT private.is_admin(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT private.has_role(_user_id, _role_name);
$$;

CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT private.is_company_member(_company_id, _user_id);
$$;

CREATE OR REPLACE FUNCTION public.company_role_of(_company_id uuid, _user_id uuid)
RETURNS public.company_role LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT private.company_role_of(_company_id, _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_perm(_user_id uuid, _perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT private.has_perm(_user_id, _perm);
$$;

CREATE OR REPLACE FUNCTION public.is_company_owner(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT private.is_company_owner(_company_id, _user_id);
$$;
REVOKE ALL ON FUNCTION public.is_company_owner(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid, uuid) TO authenticated, service_role;

-- 3. Role definitions: no longer world-readable by every signed-in user ----
DROP POLICY IF EXISTS "authenticated read roles" ON public.app_roles;
CREATE POLICY "read own or co-member roles" ON public.app_roles
FOR SELECT TO authenticated
USING (
  private.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.role_id = app_roles.id
      AND (
        ur.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.company_members me
          JOIN public.company_members them ON them.company_id = me.company_id
          WHERE me.user_id = auth.uid() AND them.user_id = ur.user_id
        )
      )
  )
);

-- 4. Role assignments: only your own, your co-workers', or admin view ------
DROP POLICY IF EXISTS "authenticated read user roles" ON public.user_roles;
CREATE POLICY "read own or co-member assignments" ON public.user_roles
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR private.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.company_members me
    JOIN public.company_members them ON them.company_id = me.company_id
    WHERE me.user_id = auth.uid() AND them.user_id = user_roles.user_id
  )
);

-- 5. No self-enrolment into arbitrary companies or privileged roles --------
DROP POLICY IF EXISTS "owner self insert membership" ON public.company_members;
CREATE POLICY "owner or admin adds membership" ON public.company_members
FOR INSERT TO authenticated
WITH CHECK (
  private.is_company_owner(company_id, auth.uid())
  OR private.company_role_of(company_id, auth.uid()) = ANY (ARRAY['owner'::company_role, 'admin'::company_role])
);