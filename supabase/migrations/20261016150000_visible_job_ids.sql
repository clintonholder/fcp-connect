-- Ids of every project a user can open, in one statement (used by View As).
CREATE OR REPLACE FUNCTION public.visible_job_ids(_user_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT j.id FROM public.jobs j WHERE private.can_see_job(j.id, _user_id);
$$;

REVOKE ALL ON FUNCTION public.visible_job_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visible_job_ids(uuid) TO service_role;
