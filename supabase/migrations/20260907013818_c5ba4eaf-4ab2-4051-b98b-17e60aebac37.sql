REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_shared_job(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_job(text) TO anon, authenticated, service_role;