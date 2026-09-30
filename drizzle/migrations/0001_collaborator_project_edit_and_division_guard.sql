-- Allow assigned collaborators (with edit_projects) to update projects outside their divisions,
-- while only admins / project creator / project manager may change the divisions themselves.

DROP POLICY IF EXISTS "company update jobs" ON public.jobs;
CREATE POLICY "company update jobs" ON public.jobs
FOR UPDATE TO authenticated
USING (
  private.is_company_member(company_id, auth.uid())
  AND private.can_see_job(id, auth.uid())
  AND private.has_perm(auth.uid(), 'edit_projects')
)
WITH CHECK (
  private.is_company_member(company_id, auth.uid())
  AND private.has_perm(auth.uid(), 'edit_projects')
  AND (
    private.is_admin(auth.uid())
    OR user_id = auth.uid()
    OR owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.project_collaborators pc
      WHERE pc.job_id = jobs.id AND pc.user_id = auth.uid()
    )
    OR (
      COALESCE(array_length(divisions, 1), 0) > 0
      AND divisions <@ private.user_divisions(auth.uid())
    )
  )
);

CREATE OR REPLACE FUNCTION private.enforce_job_division_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  -- Server-side / service-role work (no end user session) is unaffected.
  IF _uid IS NULL THEN RETURN NEW; END IF;

  IF COALESCE(NEW.divisions, '{}'::text[]) IS DISTINCT FROM COALESCE(OLD.divisions, '{}'::text[])
     OR NEW.division IS DISTINCT FROM OLD.division THEN
    IF NOT (
      private.is_admin(_uid)
      OR OLD.user_id = _uid
      OR OLD.owner_id = _uid
    ) THEN
      RAISE EXCEPTION 'Only the project manager, the project creator or an administrator can change project divisions.';
    END IF;

    -- Non-admin changers stay inside their own assigned divisions.
    IF NOT private.is_admin(_uid) THEN
      IF COALESCE(array_length(NEW.divisions, 1), 0) = 0
         OR NOT (NEW.divisions <@ private.user_divisions(_uid)) THEN
        RAISE EXCEPTION 'You can only set divisions that are assigned to you.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_job_division_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS jobs_division_change_guard ON public.jobs;
CREATE TRIGGER jobs_division_change_guard
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION private.enforce_job_division_change();
