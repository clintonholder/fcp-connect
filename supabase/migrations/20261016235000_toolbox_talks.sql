-- Toolbox talks: a library of talk topics and one toolbox_talks row per talk on a project.
--
-- Lifecycle: an incomplete talk is created from a topic for a project and a date (a future date
-- assigns it ahead of time). It is completed exactly once, with the attendees' typed names and
-- drawn signatures; completing stamps the leader (led_by) and time. After that it is never
-- changed or deleted (no DELETE policy). Title and talking points are a snapshot of the topic,
-- so editing or deleting a topic does not alter talks (topic_id deliberately has no foreign key).
--
-- Who reads and writes talks: the project owner (jobs.owner_id), project collaborators and users
-- with manage_safety (admins always), via the existing private.can_access_jha. Nothing can change
-- on an archived project. Topics (toolbox_talk_topics) are readable by every signed-in user and
-- written only by manage_safety.
--
-- Manual checks. A human runs these in the Supabase SQL editor; each is always rolled back.
-- Replace <collab-uuid> with a collaborator (not owner, no manage_safety) of <job-uuid>,
-- <other-job-uuid> with a project they do not collaborate on, <director-uuid> with a user who can
-- see <job-uuid> but is neither owner nor collaborator and lacks manage_safety, <topic-uuid> with
-- a topic id, <completed-id> with a completed talk's id, <open-id> with an incomplete talk's id,
-- <nomanage-uuid> with a user without manage_safety, and <admin-uuid> with an admin who has an
-- active proxy_sessions row.
--
-- (a) A collaborator sees talks only for their projects.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<collab-uuid>","role":"authenticated"}', true);
--   SELECT DISTINCT job_id FROM public.toolbox_talks;
--   -- Expected: only projects the user owns or collaborates on; never <other-job-uuid>.
--   ROLLBACK;
--
-- (b) A user who is not owner or collaborator and lacks manage_safety sees none.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<director-uuid>","role":"authenticated"}', true);
--   SELECT count(*) FROM public.toolbox_talks WHERE job_id = '<job-uuid>';
--   -- Expected: 0.
--   ROLLBACK;
--
-- (c) Inserting a talk with an unknown topic_id fails.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<collab-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.toolbox_talks (job_id, topic_id) VALUES
--     ('<job-uuid>', '00000000-0000-0000-0000-000000000000');
--   -- Expected: ERROR: Choose a toolbox talk topic.
--   ROLLBACK;
--
-- (d) Updating a completed talk fails.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<collab-uuid>","role":"authenticated"}', true);
--   UPDATE public.toolbox_talks SET notes = 'x' WHERE id = '<completed-id>';
--   -- Expected: ERROR: A completed toolbox talk cannot be changed.
--   ROLLBACK;
--
-- (e) Completing with an attendee missing a signature fails.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<collab-uuid>","role":"authenticated"}', true);
--   UPDATE public.toolbox_talks SET attendees = '[{"name":"Sam"}]' WHERE id = '<open-id>';
--   -- Expected: ERROR: Every attendee needs a name and signature.
--   ROLLBACK;
--
-- (f) A non-manager cannot insert into toolbox_talk_topics.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<nomanage-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.toolbox_talk_topics (title) VALUES ('x');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--
-- (g) An admin with an active proxy session cannot insert into either table.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.toolbox_talk_topics (title) VALUES ('x');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.toolbox_talks (job_id, topic_id) VALUES ('<job-uuid>', '<topic-uuid>');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;

CREATE TABLE IF NOT EXISTS public.toolbox_talk_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 200),
  body text CHECK (body IS NULL OR length(body) <= 10000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS toolbox_talk_topics_set_updated_at ON public.toolbox_talk_topics;
CREATE TRIGGER toolbox_talk_topics_set_updated_at BEFORE UPDATE ON public.toolbox_talk_topics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.toolbox_talk_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "toolbox_talk_topics_select" ON public.toolbox_talk_topics;
CREATE POLICY "toolbox_talk_topics_select" ON public.toolbox_talk_topics FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "toolbox_talk_topics_insert" ON public.toolbox_talk_topics;
CREATE POLICY "toolbox_talk_topics_insert" ON public.toolbox_talk_topics FOR INSERT TO authenticated
  WITH CHECK (private.has_perm(auth.uid(), 'manage_safety'));

DROP POLICY IF EXISTS "toolbox_talk_topics_update" ON public.toolbox_talk_topics;
CREATE POLICY "toolbox_talk_topics_update" ON public.toolbox_talk_topics FOR UPDATE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_safety'))
  WITH CHECK (private.has_perm(auth.uid(), 'manage_safety'));

DROP POLICY IF EXISTS "toolbox_talk_topics_delete" ON public.toolbox_talk_topics;
CREATE POLICY "toolbox_talk_topics_delete" ON public.toolbox_talk_topics FOR DELETE TO authenticated
  USING (private.has_perm(auth.uid(), 'manage_safety'));

-- View As is read-only: same restrictive policies as 20261016140000_view_as_proxy_sessions.sql.
DROP POLICY IF EXISTS "view_as_block_insert" ON public.toolbox_talk_topics;
DROP POLICY IF EXISTS "view_as_block_update" ON public.toolbox_talk_topics;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.toolbox_talk_topics;
CREATE POLICY "view_as_block_insert" ON public.toolbox_talk_topics AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.toolbox_talk_topics AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.toolbox_talk_topics AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));

CREATE TABLE IF NOT EXISTS public.toolbox_talks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  -- No foreign key: a SET NULL cascade would fire the update guard on completed talks and block
  -- deleting a topic. topic_title/topic_body below are the record.
  topic_id uuid,
  topic_title text NOT NULL,
  topic_body text,
  talk_date date NOT NULL DEFAULT current_date,
  created_by uuid,
  led_by uuid,
  completed_at timestamptz,
  attendees jsonb,
  notes text CHECK (notes IS NULL OR length(notes) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT toolbox_talks_completed_pair CHECK ((completed_at IS NULL) = (led_by IS NULL)),
  CONSTRAINT toolbox_talks_completed_content CHECK (
    completed_at IS NULL
    OR (
      attendees IS NOT NULL
      AND jsonb_typeof(attendees) = 'array'
      AND jsonb_array_length(attendees) BETWEEN 1 AND 60
    )
  )
);

CREATE INDEX IF NOT EXISTS toolbox_talks_job_date_idx
  ON public.toolbox_talks (job_id, talk_date);

CREATE OR REPLACE FUNCTION private.toolbox_talk_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _uid uuid := auth.uid(); _archived timestamptz; _found boolean;
  _topic_title text; _topic_body text; _a jsonb; _name text; _sig text;
BEGIN
  SELECT true, j.archived_at INTO _found, _archived
    FROM public.jobs j WHERE j.id = NEW.job_id;
  IF _found IS NOT TRUE OR _archived IS NOT NULL THEN
    RAISE EXCEPTION 'Toolbox talks cannot be changed on an archived project';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT t.title, t.body INTO _topic_title, _topic_body
      FROM public.toolbox_talk_topics t WHERE t.id = NEW.topic_id;
    IF _topic_title IS NULL THEN
      RAISE EXCEPTION 'Choose a toolbox talk topic';
    END IF;
    NEW.topic_title := _topic_title; NEW.topic_body := _topic_body;
    NEW.created_by := _uid;
    NEW.led_by := NULL; NEW.completed_at := NULL; NEW.attendees := NULL; NEW.notes := NULL;
  ELSE
    IF OLD.completed_at IS NOT NULL OR NEW.attendees IS NULL THEN
      RAISE EXCEPTION 'A completed toolbox talk cannot be changed';
    END IF;
    IF jsonb_typeof(NEW.attendees) <> 'array'
       OR jsonb_array_length(NEW.attendees) NOT BETWEEN 1 AND 60 THEN
      RAISE EXCEPTION 'Every attendee needs a name and signature';
    END IF;
    FOR _a IN SELECT * FROM jsonb_array_elements(NEW.attendees) LOOP
      IF jsonb_typeof(_a) <> 'object'
         OR jsonb_typeof(_a -> 'name') IS DISTINCT FROM 'string'
         OR jsonb_typeof(_a -> 'signature') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION 'Every attendee needs a name and signature';
      END IF;
      _name := _a ->> 'name'; _sig := _a ->> 'signature';
      IF btrim(_name) = '' OR length(_name) > 200
         OR _sig NOT LIKE 'data:image/png;base64,%' OR length(_sig) > 100000 THEN
        RAISE EXCEPTION 'Every attendee needs a name and signature';
      END IF;
    END LOOP;
    NEW.job_id := OLD.job_id; NEW.topic_id := OLD.topic_id;
    NEW.topic_title := OLD.topic_title; NEW.topic_body := OLD.topic_body;
    NEW.talk_date := OLD.talk_date; NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.led_by := _uid; NEW.completed_at := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS toolbox_talks_guard ON public.toolbox_talks;
CREATE TRIGGER toolbox_talks_guard BEFORE INSERT OR UPDATE ON public.toolbox_talks
  FOR EACH ROW EXECUTE FUNCTION private.toolbox_talk_guard();

ALTER TABLE public.toolbox_talks ENABLE ROW LEVEL SECURITY;

-- private.can_access_jha (20261016230000_jha.sql) is reused for the project team: it is true for
-- manage_safety, the project owner and project collaborators.
DROP POLICY IF EXISTS "toolbox_talks_select" ON public.toolbox_talks;
CREATE POLICY "toolbox_talks_select" ON public.toolbox_talks FOR SELECT TO authenticated
  USING (private.can_access_jha(job_id, auth.uid()));

DROP POLICY IF EXISTS "toolbox_talks_insert" ON public.toolbox_talks;
CREATE POLICY "toolbox_talks_insert" ON public.toolbox_talks FOR INSERT TO authenticated
  WITH CHECK (private.can_access_jha(job_id, auth.uid()));

DROP POLICY IF EXISTS "toolbox_talks_update" ON public.toolbox_talks;
CREATE POLICY "toolbox_talks_update" ON public.toolbox_talks FOR UPDATE TO authenticated
  USING (private.can_access_jha(job_id, auth.uid()))
  WITH CHECK (private.can_access_jha(job_id, auth.uid()));

-- View As is read-only: same restrictive policies as 20261016140000_view_as_proxy_sessions.sql.
DROP POLICY IF EXISTS "view_as_block_insert" ON public.toolbox_talks;
DROP POLICY IF EXISTS "view_as_block_update" ON public.toolbox_talks;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.toolbox_talks;
CREATE POLICY "view_as_block_insert" ON public.toolbox_talks AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.toolbox_talks AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.toolbox_talks AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));
