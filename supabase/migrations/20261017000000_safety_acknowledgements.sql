-- Safety document acknowledgements: who acknowledged which version of a safety document.
--
-- A manager can flag a safety document "requires acknowledgement". A document's version number is
-- safety_documents.revision, which the trigger below maintains: it starts at 1 and is bumped
-- whenever file_path changes (Replace version), so earlier acknowledgements no longer match the
-- current revision and the document is pending again. Clients cannot set revision directly.
--
-- safety_acknowledgements rows are inserted only by the user themselves, and only for a document
-- they can see that requires acknowledgement, is not archived and is at the given current
-- revision. They are readable by their owner and by manage_safety. There are no UPDATE or DELETE
-- policies, so acknowledgements are permanent. The restrictive view_as_block_* policies stop an
-- admin with an active proxy session (View As) from writing.
--
-- Manual checks. A human runs these in the Supabase SQL editor; each is always rolled back.
-- Replace <user-uuid> with a user who can see <doc-uuid> (view_safety), <doc-uuid> with a
-- non-archived document with requires_acknowledgement = true, <rev> with its current revision,
-- <other-uuid> with another user, <nomanage-uuid> with a user without manage_safety, and
-- <admin-uuid> with an admin who has an active proxy_sessions row.
--
-- (a) A user can acknowledge the current revision, but not as someone else or a stale revision.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<user-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.safety_acknowledgements (document_id, revision) VALUES ('<doc-uuid>', <rev>);
--   -- Expected: succeeds.
--   INSERT INTO public.safety_acknowledgements (user_id, document_id, revision)
--     VALUES ('<other-uuid>', '<doc-uuid>', <rev>);
--   -- Expected: ERROR: new row violates row-level security policy.
--   INSERT INTO public.safety_acknowledgements (document_id, revision) VALUES ('<doc-uuid>', <rev> + 1);
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--
-- (b) Acknowledgements are permanent, and only the owner or manage_safety reads them.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<user-uuid>","role":"authenticated"}', true);
--   UPDATE public.safety_acknowledgements SET revision = revision;
--   DELETE FROM public.safety_acknowledgements;
--   -- Expected: both affect 0 rows (no UPDATE or DELETE policy).
--   SELECT set_config('request.jwt.claims', '{"sub":"<nomanage-uuid>","role":"authenticated"}', true);
--   SELECT user_id FROM public.safety_acknowledgements;
--   -- Expected: only rows where user_id = <nomanage-uuid>.
--   ROLLBACK;
--
-- (c) The revision trigger: replacing the file bumps revision, other edits and direct sets do not.
--   BEGIN;
--   UPDATE public.safety_documents SET title = title, revision = 99 WHERE id = '<doc-uuid>';
--   SELECT revision FROM public.safety_documents WHERE id = '<doc-uuid>';
--   -- Expected: unchanged (<rev>).
--   UPDATE public.safety_documents SET file_path = file_path || 'x' WHERE id = '<doc-uuid>';
--   SELECT revision FROM public.safety_documents WHERE id = '<doc-uuid>';
--   -- Expected: <rev> + 1.
--   ROLLBACK;
--
-- (d) An admin with an active proxy session cannot acknowledge.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.safety_acknowledgements (document_id, revision) VALUES ('<doc-uuid>', <rev>);
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;

ALTER TABLE public.safety_documents
  ADD COLUMN IF NOT EXISTS requires_acknowledgement boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.safety_documents_set_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
  ELSIF NEW.file_path IS DISTINCT FROM OLD.file_path THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS safety_documents_set_revision ON public.safety_documents;
CREATE TRIGGER safety_documents_set_revision BEFORE INSERT OR UPDATE ON public.safety_documents
  FOR EACH ROW EXECUTE FUNCTION public.safety_documents_set_revision();

CREATE TABLE IF NOT EXISTS public.safety_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  document_id uuid NOT NULL REFERENCES public.safety_documents(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, document_id, revision)
);

ALTER TABLE public.safety_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "safety_acknowledgements_select" ON public.safety_acknowledgements;
CREATE POLICY "safety_acknowledgements_select" ON public.safety_acknowledgements FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_perm(auth.uid(), 'manage_safety'));

-- The subquery runs under the caller's safety_documents RLS, so only visible documents qualify.
DROP POLICY IF EXISTS "safety_acknowledgements_insert" ON public.safety_acknowledgements;
CREATE POLICY "safety_acknowledgements_insert" ON public.safety_acknowledgements FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.safety_documents d
      WHERE d.id = document_id
        AND d.requires_acknowledgement
        AND NOT d.archived
        AND d.revision = safety_acknowledgements.revision
    )
  );

-- View As is read-only: same restrictive policies as 20261016140000_view_as_proxy_sessions.sql.
DROP POLICY IF EXISTS "view_as_block_insert" ON public.safety_acknowledgements;
DROP POLICY IF EXISTS "view_as_block_update" ON public.safety_acknowledgements;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.safety_acknowledgements;
CREATE POLICY "view_as_block_insert" ON public.safety_acknowledgements AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.safety_acknowledgements AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.safety_acknowledgements AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));
