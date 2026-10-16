-- Snapshot of the checklist tables as they exist in production on 2026-10-16.
-- Recreates tables, constraints, indexes, grants, RLS policies, helper
-- functions and triggers. Safe to re-run: uses IF NOT EXISTS / OR REPLACE /
-- DROP ... IF EXISTS. Depends on: public.jobs, public.photos,
-- public.project_collaborators, private.can_see_job, private.has_perm,
-- private.is_admin, private.user_divisions.

CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------- tables

CREATE TABLE IF NOT EXISTS public.checklists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  company_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  assignee_id uuid,
  template_id uuid,
  "position" integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT checklists_pkey PRIMARY KEY (id),
  CONSTRAINT checklists_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT checklists_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0))
);

CREATE TABLE IF NOT EXISTS public.checklist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL,
  job_id uuid NOT NULL,
  title text NOT NULL,
  instructions text,
  assignee_id uuid,
  photos_required boolean NOT NULL DEFAULT false,
  "position" integer NOT NULL DEFAULT 0,
  completed_at timestamp with time zone,
  completed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT checklist_items_pkey PRIMARY KEY (id),
  CONSTRAINT checklist_items_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES public.checklists(id) ON DELETE CASCADE,
  CONSTRAINT checklist_items_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT checklist_items_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0))
);

CREATE TABLE IF NOT EXISTS public.checklist_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  job_id uuid NOT NULL,
  prompt text NOT NULL,
  answer text,
  "position" integer NOT NULL DEFAULT 0,
  answered_by uuid,
  answered_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT checklist_questions_pkey PRIMARY KEY (id),
  CONSTRAINT checklist_questions_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  CONSTRAINT checklist_questions_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT checklist_questions_prompt_check CHECK ((length(TRIM(BOTH FROM prompt)) > 0)),
  CONSTRAINT checklist_questions_answer_check CHECK ((answer = ANY (ARRAY['yes'::text, 'no'::text, 'na'::text])))
);

CREATE TABLE IF NOT EXISTS public.checklist_item_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  photo_id uuid NOT NULL,
  job_id uuid NOT NULL,
  attached_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT checklist_item_photos_pkey PRIMARY KEY (id),
  CONSTRAINT checklist_item_photos_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.checklist_items(id) ON DELETE CASCADE,
  CONSTRAINT checklist_item_photos_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT checklist_item_photos_photo_id_fkey FOREIGN KEY (photo_id) REFERENCES public.photos(id) ON DELETE CASCADE,
  CONSTRAINT checklist_item_photos_item_id_photo_id_key UNIQUE (item_id, photo_id)
);

-- ---------------------------------------------------------------- indexes

CREATE INDEX IF NOT EXISTS checklists_job_idx ON public.checklists USING btree (job_id);
CREATE INDEX IF NOT EXISTS checklist_items_checklist_idx ON public.checklist_items USING btree (checklist_id, "position");
CREATE INDEX IF NOT EXISTS checklist_items_job_idx ON public.checklist_items USING btree (job_id);
CREATE INDEX IF NOT EXISTS checklist_questions_item_idx ON public.checklist_questions USING btree (item_id, "position");
CREATE INDEX IF NOT EXISTS checklist_item_photos_photo_idx ON public.checklist_item_photos USING btree (photo_id);

-- ---------------------------------------------------------------- grants + RLS
-- Production ACL: ALL to anon, authenticated and service_role. Every policy is
-- TO authenticated, so anon gets no rows.

GRANT ALL ON public.checklists TO anon, authenticated, service_role;
GRANT ALL ON public.checklist_items TO anon, authenticated, service_role;
GRANT ALL ON public.checklist_questions TO anon, authenticated, service_role;
GRANT ALL ON public.checklist_item_photos TO anon, authenticated, service_role;

ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_item_photos ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------- helper functions

CREATE OR REPLACE FUNCTION private.can_work_checklists(_job_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND private.can_see_job(_job_id, _user_id)
    AND EXISTS (SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND j.archived_at IS NULL);
$function$;

CREATE OR REPLACE FUNCTION private.can_edit_checklists(_job_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT private.can_work_checklists(_job_id, _user_id)
    AND private.has_perm(_user_id, 'edit_projects')
    AND EXISTS (
      SELECT 1 FROM public.jobs j WHERE j.id = _job_id AND (
        private.is_admin(_user_id) OR j.user_id = _user_id OR j.owner_id = _user_id
        OR EXISTS (SELECT 1 FROM public.project_collaborators pc WHERE pc.job_id = j.id AND pc.user_id = _user_id)
        OR (cardinality(COALESCE(j.divisions,'{}')) > 0 AND j.divisions <@ private.user_divisions(_user_id))
      ));
$function$;

-- Production ACL on these two: EXECUTE for postgres and authenticated only.
REVOKE ALL ON FUNCTION private.can_work_checklists(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_edit_checklists(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_work_checklists(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_edit_checklists(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------- trigger functions
-- Production ACL on these: default (no explicit grants).

CREATE OR REPLACE FUNCTION private.checklist_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.job_id <> OLD.job_id THEN RAISE EXCEPTION 'Cannot move a checklist between projects'; END IF;
  SELECT company_id INTO NEW.company_id FROM public.jobs WHERE id = NEW.job_id;
  IF NEW.assignee_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id)
     AND NOT private.can_see_job(NEW.job_id, NEW.assignee_id) THEN
    RAISE EXCEPTION 'The assignee must already be on this project';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION private.checklist_item_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _job uuid; _req boolean;
BEGIN
  SELECT job_id INTO _job FROM public.checklists WHERE id = NEW.checklist_id;
  IF _job IS NULL OR _job <> NEW.job_id THEN RAISE EXCEPTION 'Item must belong to the checklist''s project'; END IF;
  IF NEW.assignee_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id)
     AND NOT private.can_see_job(NEW.job_id, NEW.assignee_id) THEN
    RAISE EXCEPTION 'The assignee must already be on this project';
  END IF;
  IF TG_OP = 'UPDATE' AND _uid IS NOT NULL AND NOT private.can_edit_checklists(NEW.job_id, _uid) THEN
    IF NEW.title IS DISTINCT FROM OLD.title OR NEW.instructions IS DISTINCT FROM OLD.instructions
       OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR NEW.photos_required IS DISTINCT FROM OLD.photos_required
       OR NEW.position IS DISTINCT FROM OLD.position OR NEW.checklist_id IS DISTINCT FROM OLD.checklist_id
       OR NEW.job_id IS DISTINCT FROM OLD.job_id THEN
      RAISE EXCEPTION 'You do not have permission to change checklist structure';
    END IF;
  END IF;
  IF NEW.completed_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.completed_at IS NULL) THEN
    IF EXISTS (SELECT 1 FROM public.checklist_questions q WHERE q.item_id = NEW.id AND q.answer IS NULL) THEN
      RAISE EXCEPTION 'Answer all questions before completing this item';
    END IF;
    IF NEW.photos_required AND NOT EXISTS (SELECT 1 FROM public.checklist_item_photos p WHERE p.item_id = NEW.id) THEN
      RAISE EXCEPTION 'Attach at least one photo before completing this item';
    END IF;
    NEW.completed_at := now(); NEW.completed_by := _uid;
  ELSIF NEW.completed_at IS NULL THEN
    NEW.completed_by := NULL;
  ELSE
    NEW.completed_at := OLD.completed_at; NEW.completed_by := OLD.completed_by;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION private.checklist_question_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _job uuid;
BEGIN
  SELECT job_id INTO _job FROM public.checklist_items WHERE id = NEW.item_id;
  IF _job IS NULL OR _job <> NEW.job_id THEN RAISE EXCEPTION 'Question must belong to the item''s project'; END IF;
  IF TG_OP = 'UPDATE' AND _uid IS NOT NULL AND NOT private.can_edit_checklists(NEW.job_id, _uid)
     AND (NEW.prompt IS DISTINCT FROM OLD.prompt OR NEW.position IS DISTINCT FROM OLD.position
          OR NEW.item_id IS DISTINCT FROM OLD.item_id OR NEW.job_id IS DISTINCT FROM OLD.job_id) THEN
    RAISE EXCEPTION 'You do not have permission to change checklist structure';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.answer IS DISTINCT FROM OLD.answer THEN
    IF NEW.answer IS NULL THEN NEW.answered_by := NULL; NEW.answered_at := NULL;
    ELSE NEW.answered_by := _uid; NEW.answered_at := now(); END IF;
  ELSE
    NEW.answered_by := OLD.answered_by; NEW.answered_at := OLD.answered_at;
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION private.checklist_photo_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.checklist_items i WHERE i.id = NEW.item_id AND i.job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'Item must belong to this project';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.photos p WHERE p.id = NEW.photo_id AND p.job_id = NEW.job_id) THEN
    RAISE EXCEPTION 'Only this project''s media can be attached';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION private.checklist_touch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _item uuid; _cl uuid;
BEGIN
  IF TG_TABLE_NAME = 'checklist_items' THEN _cl := COALESCE(NEW.checklist_id, OLD.checklist_id);
  ELSE
    _item := COALESCE(NEW.item_id, OLD.item_id);
    SELECT checklist_id INTO _cl FROM public.checklist_items WHERE id = _item;
    UPDATE public.checklist_items i SET completed_at = NULL, completed_by = NULL
     WHERE i.id = _item AND i.completed_at IS NOT NULL AND (
       EXISTS (SELECT 1 FROM public.checklist_questions q WHERE q.item_id = i.id AND q.answer IS NULL)
       OR (i.photos_required AND NOT EXISTS (SELECT 1 FROM public.checklist_item_photos p WHERE p.item_id = i.id)));
  END IF;
  IF _cl IS NOT NULL THEN UPDATE public.checklists SET updated_at = now() WHERE id = _cl; END IF;
  RETURN NULL;
END; $function$;

-- ---------------------------------------------------------------- policies

DROP POLICY IF EXISTS "view checklists" ON public.checklists;
DROP POLICY IF EXISTS "edit insert checklists" ON public.checklists;
DROP POLICY IF EXISTS "edit update checklists" ON public.checklists;
DROP POLICY IF EXISTS "edit delete checklists" ON public.checklists;

CREATE POLICY "view checklists" ON public.checklists AS PERMISSIVE FOR SELECT TO authenticated
  USING (private.can_see_job(job_id, auth.uid()));
CREATE POLICY "edit insert checklists" ON public.checklists AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((private.can_edit_checklists(job_id, auth.uid()) AND (created_by = auth.uid())));
CREATE POLICY "edit update checklists" ON public.checklists AS PERMISSIVE FOR UPDATE TO authenticated
  USING (private.can_edit_checklists(job_id, auth.uid()))
  WITH CHECK (private.can_edit_checklists(job_id, auth.uid()));
CREATE POLICY "edit delete checklists" ON public.checklists AS PERMISSIVE FOR DELETE TO authenticated
  USING (private.can_edit_checklists(job_id, auth.uid()));

DROP POLICY IF EXISTS "view checklist items" ON public.checklist_items;
DROP POLICY IF EXISTS "edit insert checklist items" ON public.checklist_items;
DROP POLICY IF EXISTS "work update checklist items" ON public.checklist_items;
DROP POLICY IF EXISTS "edit delete checklist items" ON public.checklist_items;

CREATE POLICY "view checklist items" ON public.checklist_items AS PERMISSIVE FOR SELECT TO authenticated
  USING (private.can_see_job(job_id, auth.uid()));
CREATE POLICY "edit insert checklist items" ON public.checklist_items AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (private.can_edit_checklists(job_id, auth.uid()));
CREATE POLICY "work update checklist items" ON public.checklist_items AS PERMISSIVE FOR UPDATE TO authenticated
  USING (private.can_work_checklists(job_id, auth.uid()))
  WITH CHECK (private.can_work_checklists(job_id, auth.uid()));
CREATE POLICY "edit delete checklist items" ON public.checklist_items AS PERMISSIVE FOR DELETE TO authenticated
  USING (private.can_edit_checklists(job_id, auth.uid()));

DROP POLICY IF EXISTS "view checklist questions" ON public.checklist_questions;
DROP POLICY IF EXISTS "edit insert checklist questions" ON public.checklist_questions;
DROP POLICY IF EXISTS "work update checklist questions" ON public.checklist_questions;
DROP POLICY IF EXISTS "edit delete checklist questions" ON public.checklist_questions;

CREATE POLICY "view checklist questions" ON public.checklist_questions AS PERMISSIVE FOR SELECT TO authenticated
  USING (private.can_see_job(job_id, auth.uid()));
CREATE POLICY "edit insert checklist questions" ON public.checklist_questions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (private.can_edit_checklists(job_id, auth.uid()));
CREATE POLICY "work update checklist questions" ON public.checklist_questions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (private.can_work_checklists(job_id, auth.uid()))
  WITH CHECK (private.can_work_checklists(job_id, auth.uid()));
CREATE POLICY "edit delete checklist questions" ON public.checklist_questions AS PERMISSIVE FOR DELETE TO authenticated
  USING (private.can_edit_checklists(job_id, auth.uid()));

DROP POLICY IF EXISTS "view checklist photos" ON public.checklist_item_photos;
DROP POLICY IF EXISTS "attach checklist photos" ON public.checklist_item_photos;
DROP POLICY IF EXISTS "detach checklist photos" ON public.checklist_item_photos;

CREATE POLICY "view checklist photos" ON public.checklist_item_photos AS PERMISSIVE FOR SELECT TO authenticated
  USING (private.can_see_job(job_id, auth.uid()));
CREATE POLICY "attach checklist photos" ON public.checklist_item_photos AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((private.can_work_checklists(job_id, auth.uid()) AND private.has_perm(auth.uid(), 'add_photos'::text) AND (attached_by = auth.uid())));
CREATE POLICY "detach checklist photos" ON public.checklist_item_photos AS PERMISSIVE FOR DELETE TO authenticated
  USING ((private.can_work_checklists(job_id, auth.uid()) AND private.has_perm(auth.uid(), 'add_photos'::text)));

-- ---------------------------------------------------------------- triggers

DROP TRIGGER IF EXISTS checklists_guard ON public.checklists;
CREATE TRIGGER checklists_guard BEFORE INSERT OR UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION private.checklist_guard();

DROP TRIGGER IF EXISTS checklist_items_guard ON public.checklist_items;
CREATE TRIGGER checklist_items_guard BEFORE INSERT OR UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION private.checklist_item_guard();

DROP TRIGGER IF EXISTS checklist_items_touch ON public.checklist_items;
CREATE TRIGGER checklist_items_touch AFTER INSERT OR DELETE OR UPDATE ON public.checklist_items
  FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION private.checklist_touch();

DROP TRIGGER IF EXISTS checklist_questions_guard ON public.checklist_questions;
CREATE TRIGGER checklist_questions_guard BEFORE INSERT OR UPDATE ON public.checklist_questions
  FOR EACH ROW EXECUTE FUNCTION private.checklist_question_guard();

DROP TRIGGER IF EXISTS checklist_questions_touch ON public.checklist_questions;
CREATE TRIGGER checklist_questions_touch AFTER INSERT OR DELETE OR UPDATE ON public.checklist_questions
  FOR EACH ROW EXECUTE FUNCTION private.checklist_touch();

DROP TRIGGER IF EXISTS checklist_item_photos_guard ON public.checklist_item_photos;
CREATE TRIGGER checklist_item_photos_guard BEFORE INSERT ON public.checklist_item_photos
  FOR EACH ROW EXECUTE FUNCTION private.checklist_photo_guard();

DROP TRIGGER IF EXISTS checklist_item_photos_touch ON public.checklist_item_photos;
CREATE TRIGGER checklist_item_photos_touch AFTER INSERT OR DELETE ON public.checklist_item_photos
  FOR EACH ROW EXECUTE FUNCTION private.checklist_touch();
