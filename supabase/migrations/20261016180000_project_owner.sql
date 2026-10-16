-- Project Owner (the building owner), ranked above Customer. Nullable because
-- existing rows have none; the trigger requires it on new projects and stops a
-- set Owner being cleared.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS owner text;

CREATE OR REPLACE FUNCTION private.enforce_job_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NULLIF(btrim(NEW.owner), '') IS NULL
     AND (TG_OP = 'INSERT' OR NULLIF(btrim(OLD.owner), '') IS NOT NULL) THEN
    RAISE EXCEPTION 'Owner is required.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_job_owner() FROM PUBLIC;

DROP TRIGGER IF EXISTS jobs_owner_required ON public.jobs;
CREATE TRIGGER jobs_owner_required
  BEFORE INSERT OR UPDATE OF owner ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION private.enforce_job_owner();

CREATE OR REPLACE FUNCTION public.get_shared_job(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _job_id uuid; _result jsonb;
BEGIN
  SELECT job_id INTO _job_id FROM public.share_links
   WHERE token = _token AND (expires_at IS NULL OR expires_at > now()) LIMIT 1;
  IF _job_id IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'job',    (SELECT jsonb_build_object(
                 'id', j.id, 'name', j.name, 'address', j.address,
                 'owner', j.owner, 'client', j.client, 'notes', j.notes)
               FROM public.jobs j WHERE j.id = _job_id),
    'areas',  COALESCE((SELECT jsonb_agg(
                 jsonb_build_object('id', a.id, 'name', a.name)
                 ORDER BY a.created_at)
               FROM public.areas a WHERE a.job_id = _job_id), '[]'::jsonb),
    'photos', COALESCE((SELECT jsonb_agg(
                 jsonb_build_object(
                   'id', p.id, 'area_id', p.area_id,
                   'storage_path', p.storage_path, 'image_url', p.image_url,
                   'annotated_image_url', p.annotated_image_url,
                   'annotated_storage_path', p.annotated_storage_path,
                   'caption', p.caption, 'tags', p.tags,
                   'latitude', p.latitude, 'longitude', p.longitude,
                   'taken_at', p.taken_at, 'media_type', p.media_type)
                 ORDER BY p.taken_at DESC)
               FROM public.photos p
               WHERE p.job_id = _job_id AND p.archived_at IS NULL), '[]'::jsonb)
  ) INTO _result;
  RETURN _result;
END; $$;

REVOKE ALL ON FUNCTION public.get_shared_job(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_job(text) TO service_role;
