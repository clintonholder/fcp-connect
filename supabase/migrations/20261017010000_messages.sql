-- Messages: in-app company messages from a sender to a resolved list of recipients.
--
-- A user with the send_messages permission (admins always pass) creates a messages row and one
-- message_recipients row per recipient, optionally linked to a project or a safety document (at
-- most one). Recipients are resolved server-side by resolveAudience in src/lib/messages.ts.
-- A recipient reads the message and their own recipient row; the sender reads the message and all
-- of its recipient rows. private.is_message_sender lets the message_recipients policies check the
-- sender without the two tables' policies calling each other in a loop. There are no UPDATE or
-- DELETE policies, so messages are permanent. The restrictive view_as_block_* policies stop an
-- admin with an active proxy session (View As) from writing.
--
-- Manual checks. A human runs these in the Supabase SQL editor; each is always rolled back.
-- Replace <sender-uuid> with a user with send_messages, <nosend-uuid> with a user without it,
-- <rcpt-uuid> with a recipient, <other-uuid> with a user who is not a recipient, <msg-uuid> with
-- a message sent by <sender-uuid>, and <admin-uuid> with an admin who has an active
-- proxy_sessions row.
--
-- (a) A sender with send_messages can insert a message and recipients, and a user without it cannot.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<sender-uuid>","role":"authenticated"}', true);
--   WITH m AS (
--     INSERT INTO public.messages (subject, body) VALUES ('Test', 'Hello') RETURNING id
--   )
--   INSERT INTO public.message_recipients (message_id, user_id) SELECT id, '<rcpt-uuid>' FROM m;
--   -- Expected: succeeds.
--   SELECT set_config('request.jwt.claims', '{"sub":"<nosend-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.messages (subject, body) VALUES ('Test', 'Hello');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;
--
-- (b) A recipient sees only their own recipient row and the message; a non-recipient sees
-- neither; the sender sees the message and all its recipient rows.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<rcpt-uuid>","role":"authenticated"}', true);
--   SELECT id FROM public.messages WHERE id = '<msg-uuid>';
--   -- Expected: 1 row.
--   SELECT user_id FROM public.message_recipients WHERE message_id = '<msg-uuid>';
--   -- Expected: only the row where user_id = <rcpt-uuid>.
--   SELECT set_config('request.jwt.claims', '{"sub":"<other-uuid>","role":"authenticated"}', true);
--   SELECT id FROM public.messages WHERE id = '<msg-uuid>';
--   SELECT id FROM public.message_recipients WHERE message_id = '<msg-uuid>';
--   -- Expected: 0 rows each.
--   SELECT set_config('request.jwt.claims', '{"sub":"<sender-uuid>","role":"authenticated"}', true);
--   SELECT id FROM public.messages WHERE id = '<msg-uuid>';
--   SELECT user_id FROM public.message_recipients WHERE message_id = '<msg-uuid>';
--   -- Expected: the message and every recipient row.
--   ROLLBACK;
--
-- (c) An admin with an active proxy session cannot insert.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   INSERT INTO public.messages (subject, body) VALUES ('Test', 'Hello');
--   -- Expected: ERROR: new row violates row-level security policy.
--   ROLLBACK;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  subject text NOT NULL CHECK (btrim(subject) <> ''),
  body text NOT NULL CHECK (btrim(body) <> ''),
  project_id uuid NULL REFERENCES public.jobs(id) ON DELETE SET NULL,
  safety_document_id uuid NULL REFERENCES public.safety_documents(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CHECK (project_id IS NULL OR safety_document_id IS NULL)
);

CREATE TABLE IF NOT EXISTS public.message_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NULL,
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS message_recipients_user_id_idx ON public.message_recipients (user_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_recipients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.is_message_sender(_message_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.messages m WHERE m.id = _message_id AND m.sender_id = _user_id
  );
$$;

REVOKE ALL ON FUNCTION private.is_message_sender(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_message_sender(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "messages_select" ON public.messages;
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.message_recipients r
      WHERE r.message_id = messages.id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND private.has_perm(auth.uid(), 'send_messages'));

DROP POLICY IF EXISTS "message_recipients_select" ON public.message_recipients;
CREATE POLICY "message_recipients_select" ON public.message_recipients FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_message_sender(message_id, auth.uid()));

DROP POLICY IF EXISTS "message_recipients_insert" ON public.message_recipients;
CREATE POLICY "message_recipients_insert" ON public.message_recipients FOR INSERT TO authenticated
  WITH CHECK (
    private.is_message_sender(message_id, auth.uid())
    AND private.has_perm(auth.uid(), 'send_messages')
  );

-- View As is read-only: same restrictive policies as 20261016140000_view_as_proxy_sessions.sql.
DROP POLICY IF EXISTS "view_as_block_insert" ON public.messages;
DROP POLICY IF EXISTS "view_as_block_update" ON public.messages;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.messages;
CREATE POLICY "view_as_block_insert" ON public.messages AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.messages AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.messages AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));

DROP POLICY IF EXISTS "view_as_block_insert" ON public.message_recipients;
DROP POLICY IF EXISTS "view_as_block_update" ON public.message_recipients;
DROP POLICY IF EXISTS "view_as_block_delete" ON public.message_recipients;
CREATE POLICY "view_as_block_insert" ON public.message_recipients AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_update" ON public.message_recipients AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()))
  WITH CHECK (NOT private.has_active_proxy(auth.uid()));
CREATE POLICY "view_as_block_delete" ON public.message_recipients AS RESTRICTIVE FOR DELETE TO authenticated
  USING (NOT private.has_active_proxy(auth.uid()));
