-- Safety and Messaging permissions: view_safety (on by default), manage_safety, send_messages.
ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS can_view_safety boolean NOT NULL DEFAULT true;
ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS can_manage_safety boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS can_send_messages boolean NOT NULL DEFAULT false;

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
        WHEN 'view_safety'     THEN r.can_view_safety
        WHEN 'manage_safety'   THEN r.can_manage_safety
        WHEN 'send_messages'   THEN r.can_send_messages
        ELSE false END
  ) INTO _ok;

  RETURN COALESCE(_ok, false);
END; $$;

REVOKE ALL ON FUNCTION private.has_perm(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_perm(uuid, text) TO authenticated, service_role;
