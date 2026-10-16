-- Public share link: return only the fields the share page uses, hide archived
-- photos, and give new links a default 30-day expiry.
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
                 'client', j.client, 'notes', j.notes)
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

ALTER TABLE public.share_links ALTER COLUMN expires_at SET DEFAULT now() + interval '30 days';
