-- Photos are served through signed URLs (src/lib/photo-urls.ts), so the bucket
-- must not be public. The first migration created it public and Lovable later
-- flipped it outside of migrations; this makes that state explicit.
UPDATE storage.buckets SET public = false WHERE id = 'job-photos';
