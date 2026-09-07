ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS jobs_tags_idx ON public.jobs USING gin (tags);