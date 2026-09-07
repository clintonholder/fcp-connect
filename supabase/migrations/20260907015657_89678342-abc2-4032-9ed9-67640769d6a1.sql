ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS phase text;
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.photos ALTER COLUMN area_id DROP NOT NULL;

-- Preserve existing area names as photo tags
UPDATE public.photos p
SET tags = (
  SELECT ARRAY(SELECT DISTINCT unnest(p.tags || ARRAY[lower(a.name)]))
  FROM public.areas a WHERE a.id = p.area_id
)
WHERE p.area_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.areas a
    WHERE a.id = p.area_id AND NOT (lower(a.name) = ANY(p.tags))
  );

CREATE INDEX IF NOT EXISTS photos_job_phase_idx ON public.photos (job_id, phase);
