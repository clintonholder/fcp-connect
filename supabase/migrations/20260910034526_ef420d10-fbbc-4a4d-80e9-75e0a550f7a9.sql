ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS duration_seconds numeric;

UPDATE public.photos SET media_type = 'image' WHERE media_type IS NULL OR media_type NOT IN ('image','video');

ALTER TABLE public.photos
  ADD CONSTRAINT photos_media_type_check CHECK (media_type IN ('image','video'));