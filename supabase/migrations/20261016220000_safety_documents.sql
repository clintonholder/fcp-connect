-- Safety documents library (SDS, first aid, emergency) with a private storage bucket.
--
-- Read rule: a user with manage_safety reads every row (including archived). Anyone else needs
-- view_safety and sees only non-archived rows; a subcontractor (profiles.worker_type) sees only
-- rows with shareable_with_subs. Only manage_safety writes. Documents are archived, never deleted
-- (no DELETE policy). Files in the safety-documents bucket follow row access through the storage
-- SELECT policy. The all-bucket restrictive view_as_block_* policies on storage.objects (from
-- 20261016140000_view_as_proxy_sessions.sql) already cover this bucket, so they are not repeated.
--
-- Manual checks. A human runs these in the Supabase SQL editor; each is always rolled back.
-- Replace <sub-uuid> with a subcontractor with view_safety (no manage_safety), <employee-uuid>
-- with an employee with view_safety (no manage_safety), <nomanage-uuid> with a user without
-- manage_safety, and <admin-uuid> with an admin who has an active proxy_sessions row.
--
-- (a) A subcontractor with view_safety sees only shareable, non-archived rows.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<sub-uuid>","role":"authenticated"}', true);
--   SELECT id, shareable_with_subs, archived FROM public.safety_documents;
--   -- Expected: every row has shareable_with_subs = true and archived = false.
--   ROLLBACK;
--
-- (b) An employee with view_safety sees all non-archived rows.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<employee-uuid>","role":"authenticated"}', true);
--   SELECT id, shareable_with_subs, archived FROM public.safety_documents;
--   -- Expected: all rows with archived = false, shareable or not.
--   ROLLBACK;
--
-- (c) A user without manage_safety cannot insert.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<nomanage-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.safety_documents (title, category, file_path) VALUES ('x', 'sds', 'x/x.pdf');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--
-- (d) An admin with an active proxy session cannot insert.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.safety_documents (title, category, file_path) VALUES ('x', 'sds', 'x/x.pdf');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;

CREATE TABLE IF NOT EXISTS public.safety_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (btrim(title) <> ''),
  category text NOT NULL CHECK (category IN ('sds','first_aid','emergency','other')),
  description text,
  version text,
  effective_date date,
  archived boolean NOT NULL DEFAULT false,
  shareable_with_subs boolean NOT NULL DEFAULT false,
  file_path text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS safety_documents_set_updated_at ON public.safety_documents;
CREATE TRIGGER safety_documents_set_updated_at BEFORE UPDATE ON public.safety_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION private.is_subcontractor(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id AND p.worker_type = 'subcontractor'
  );
$$;

REVOKE ALL ON FUNCTION private.is_subcontractor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_subcontractor(uuid) TO authenticated, service_role;

ALTER TABLE public.safety_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "safety_documents_select" ON public.safety_documents;
CREATE POLICY "safety_documents_select" ON public.safety_documents FOR SELECT TO authenticated
  USING (
    private.has_perm(auth.uid(), 'manage_safety')
    OR (
      private.has_perm(auth.uid(), 'view_safety')
      AND NOT archived
      AND (NOT private.is_subcontractor(auth.uid()) OR shareable_with_subs)
    )
  );

DROP POLICY IF EXISTS "safety_documents_insert" ON public.safety_documents;
CREATE POLICY "safety_documents_insert" ON public.safety_documents FOR INSERT TO authenticated
  WITH CHECK (private.has_perm(auth.uid(), 'manage_safety'));

DROP POLICY IF EXISTS "safety_documents_update" ON public.safety_documents;
CREATE POLICY "safety_documents_update" ON public.safety_documents FOR UPDATE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_safety'))
  WITH CHECK (private.has_perm(auth.uid(), 'manage_safety'));

-- View As is read-only: same restrictive policies as 20261016140000_view_as_proxy_sessions.sql.
DROP POLICY IF EXISTS "view_as_block_insert" ON public.safety_documents;
DROP POLICY IF EXISTS "view_as_block_update" ON public.safety_documents;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.safety_documents;
CREATE POLICY "view_as_block_insert" ON public.safety_documents AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.safety_documents AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.safety_documents AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));

-- Private bucket for the files.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('safety-documents', 'safety-documents', false, 26214400,
  ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- File access follows row access: the subquery runs under the caller's table RLS.
DROP POLICY IF EXISTS "safety_documents_files_select" ON storage.objects;
CREATE POLICY "safety_documents_files_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'safety-documents'
    AND EXISTS (SELECT 1 FROM public.safety_documents d WHERE d.file_path = storage.objects.name)
  );

DROP POLICY IF EXISTS "safety_documents_files_insert" ON storage.objects;
CREATE POLICY "safety_documents_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'safety-documents' AND private.has_perm(auth.uid(), 'manage_safety'));

-- Removes a replaced file or a failed upload. There is no UPDATE policy: files are never overwritten.
DROP POLICY IF EXISTS "safety_documents_files_delete" ON storage.objects;
CREATE POLICY "safety_documents_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'safety-documents' AND private.has_perm(auth.uid(), 'manage_safety'));
