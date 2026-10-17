-- Admin-only profile fields.
--
-- worker_type, subcontractor_name and is_disabled on public.profiles can be changed only by an
-- administrator (private.is_admin) or by server-side work with no end-user JWT (the service role
-- used by src/lib/admin.functions.ts, and handle_new_user), where auth.uid() is NULL. The
-- "self update profile" / "self insert profile" policies are unchanged, so a non-admin can still
-- edit display_name, email and other own-profile columns.
--
-- Manual checks. A human runs these in the Supabase SQL editor; each is always rolled back.
-- Replace <subcontractor-uuid> with a non-admin subcontractor's profile id and <admin-uuid> with
-- an admin's id.
--
-- (a) Non-admin changing worker_type fails.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<subcontractor-uuid>","role":"authenticated"}', true);
--   UPDATE public.profiles SET worker_type = 'employee' WHERE id = '<subcontractor-uuid>';
--   -- Expected: ERROR: Only an administrator can change worker type, subcontractor name or account status.
--   ROLLBACK;
--
-- (b) Non-admin changing subcontractor_name fails.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<subcontractor-uuid>","role":"authenticated"}', true);
--   UPDATE public.profiles SET subcontractor_name = 'Other Co' WHERE id = '<subcontractor-uuid>';
--   -- Expected: the same ERROR as (a).
--   ROLLBACK;
--
-- (c) Non-admin changing is_disabled fails (try true, and false on a disabled account).
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<subcontractor-uuid>","role":"authenticated"}', true);
--   UPDATE public.profiles SET is_disabled = true WHERE id = '<subcontractor-uuid>';
--   -- Expected: the same ERROR as (a).
--   ROLLBACK;
--
-- (d) Non-admin editing their own display_name succeeds.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<subcontractor-uuid>","role":"authenticated"}', true);
--   UPDATE public.profiles SET display_name = 'x' WHERE id = '<subcontractor-uuid>';
--   -- Expected: UPDATE 1 (no error).
--   ROLLBACK;
--
-- (e) The same worker_type update as an admin succeeds.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   UPDATE public.profiles SET worker_type = 'employee' WHERE id = '<subcontractor-uuid>';
--   -- Expected: UPDATE 1 (no error).
--   ROLLBACK;
--
-- (f) The same update as the service role (no sub claim) succeeds.
--   BEGIN;
--   SET LOCAL ROLE service_role;
--   SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
--   UPDATE public.profiles SET worker_type = 'employee' WHERE id = '<subcontractor-uuid>';
--   -- Expected: UPDATE 1 (no error).
--   ROLLBACK;

CREATE OR REPLACE FUNCTION private.enforce_profile_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role, handle_new_user and other server-side work have no end-user JWT.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.worker_type IS DISTINCT FROM OLD.worker_type
       OR NEW.subcontractor_name IS DISTINCT FROM OLD.subcontractor_name
       OR NEW.is_disabled IS DISTINCT FROM OLD.is_disabled THEN
      RAISE EXCEPTION 'Only an administrator can change worker type, subcontractor name or account status.';
    END IF;
  ELSE
    IF NEW.worker_type <> 'employee'
       OR NEW.subcontractor_name IS NOT NULL
       OR NEW.is_disabled IS TRUE THEN
      RAISE EXCEPTION 'Only an administrator can change worker type, subcontractor name or account status.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_profile_admin_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_admin_fields_guard ON public.profiles;
CREATE TRIGGER profiles_admin_fields_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.enforce_profile_admin_fields();
