-- Messages read receipts: a recipient can mark their own message as read.
--
-- Adds a permissive UPDATE policy on message_recipients limited to the recipient's own row, and a
-- BEFORE UPDATE trigger that makes the update safe: id, message_id and user_id are kept at their
-- old values, and read_at can only go from NULL to the server's now(); once set it never changes
-- and cannot be cleared. The existing restrictive view_as_block_update policy is untouched, so an
-- admin with an active proxy session (View As) still cannot record a receipt. No messages policy
-- is added or changed.
--
-- Manual checks. A human runs these in the Supabase SQL editor; each is always rolled back.
-- Replace <rcpt-uuid> with a recipient of <msg-uuid>, <other-uuid> with a user who is not that
-- recipient, and <admin-uuid> with an admin who has an active proxy_sessions row and is also a
-- recipient of <msg-uuid>.
--
-- (a) A recipient can set read_at on their own row.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<rcpt-uuid>","role":"authenticated"}', true);
--   UPDATE public.message_recipients SET read_at = now()
--     WHERE message_id = '<msg-uuid>' AND user_id = '<rcpt-uuid>' RETURNING read_at;
--   -- Expected: 1 row, read_at set.
--   ROLLBACK;
--
-- (b) Updating another user's recipient row affects 0 rows.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<other-uuid>","role":"authenticated"}', true);
--   UPDATE public.message_recipients SET read_at = now()
--     WHERE message_id = '<msg-uuid>' AND user_id = '<rcpt-uuid>';
--   -- Expected: UPDATE 0.
--   ROLLBACK;
--
-- (c) read_at cannot be cleared or moved once set, and message_id/user_id cannot change.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<rcpt-uuid>","role":"authenticated"}', true);
--   UPDATE public.message_recipients SET read_at = now()
--     WHERE message_id = '<msg-uuid>' AND user_id = '<rcpt-uuid>';
--   UPDATE public.message_recipients SET read_at = NULL, user_id = '<other-uuid>'
--     WHERE message_id = '<msg-uuid>' AND user_id = '<rcpt-uuid>';
--   UPDATE public.message_recipients SET read_at = '2000-01-01'
--     WHERE message_id = '<msg-uuid>' AND user_id = '<rcpt-uuid>';
--   SELECT user_id, read_at FROM public.message_recipients
--     WHERE message_id = '<msg-uuid>' AND user_id = '<rcpt-uuid>';
--   -- Expected: still the recipient's row, with the read_at from the first update.
--   ROLLBACK;
--
-- (d) An admin with an active proxy session updating their own recipient row affects 0 rows.
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims', '{"sub":"<admin-uuid>","role":"authenticated"}', true);
--   UPDATE public.message_recipients SET read_at = now()
--     WHERE message_id = '<msg-uuid>' AND user_id = '<admin-uuid>';
--   -- Expected: UPDATE 0.
--   ROLLBACK;

DROP POLICY IF EXISTS "message_recipients_update_own" ON public.message_recipients;
CREATE POLICY "message_recipients_update_own" ON public.message_recipients FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.message_recipients_guard_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.message_id := OLD.message_id;
  NEW.user_id := OLD.user_id;
  NEW.read_at := COALESCE(OLD.read_at, CASE WHEN NEW.read_at IS NULL THEN NULL ELSE now() END);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS message_recipients_guard_update ON public.message_recipients;
CREATE TRIGGER message_recipients_guard_update BEFORE UPDATE ON public.message_recipients
  FOR EACH ROW EXECUTE FUNCTION public.message_recipients_guard_update();
