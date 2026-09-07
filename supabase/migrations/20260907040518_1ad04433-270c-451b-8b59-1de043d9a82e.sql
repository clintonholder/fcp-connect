ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS divisions text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.jobs
SET divisions = ARRAY[division]
WHERE division IS NOT NULL AND division <> '' AND cardinality(divisions) = 0;

CREATE INDEX IF NOT EXISTS jobs_divisions_idx ON public.jobs USING gin (divisions);