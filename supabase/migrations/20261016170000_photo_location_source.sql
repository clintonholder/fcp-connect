-- Where a photo's coordinates came from: the photo's own EXIF GPS or the device's
-- current location. NULL for rows with no coordinates and for existing rows (origin unknown).
ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS location_source text
  CHECK (location_source IN ('photo', 'device'));
