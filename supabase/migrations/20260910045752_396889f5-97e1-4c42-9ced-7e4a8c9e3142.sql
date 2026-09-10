ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS is_director boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.user_divisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  division text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, division)
);
CREATE INDEX IF NOT EXISTS user_divisions_user_idx ON public.user_divisions(user_id);
GRANT SELECT ON public.user_divisions TO authenticated;
GRANT ALL ON public.user_divisions TO service_role;
ALTER TABLE public.user_divisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read own or co-member divisions" ON public.user_divisions;
CREATE POLICY "read own or co-member divisions" ON public.user_divisions
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR private.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.company_members me
    JOIN public.company_members them ON them.company_id = me.company_id
    WHERE me.user_id = auth.uid() AND them.user_id = user_divisions.user_id
  )
);

CREATE INDEX IF NOT EXISTS project_collaborators_user_job_idx ON public.project_collaborators(user_id, job_id);

CREATE OR REPLACE FUNCTION private.user_divisions(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(division), '{}'::text[]) FROM public.user_divisions WHERE user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION private.is_director(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.app_roles r ON r.id = ur.role_id
    WHERE ur.user_id = _user_id AND r.is_active AND r.is_director
  );
$$;

CREATE OR REPLACE FUNCTION private.can_see_job(_job_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = _job_id AND (
      private.is_admin(_user_id)
      OR j.owner_id = _user_id
      OR EXISTS (SELECT 1 FROM public.project_collaborators pc WHERE pc.job_id = j.id AND pc.user_id = _user_id)
      OR (
        private.is_director(_user_id) AND (
          COALESCE(j.divisions, '{}'::text[]) && private.user_divisions(_user_id)
          OR (j.division IS NOT NULL AND j.division = ANY (private.user_divisions(_user_id)))
        )
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION private.user_divisions(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_director(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_see_job(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.user_divisions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_director(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_see_job(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_see_job(_job_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT private.can_see_job(_job_id, _user_id);
$$;

CREATE OR REPLACE FUNCTION public.is_director(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT private.is_director(_user_id);
$$;

CREATE OR REPLACE FUNCTION public.my_divisions(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT private.user_divisions(_user_id);
$$;

REVOKE ALL ON FUNCTION public.can_see_job(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_director(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_divisions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_job(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_director(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_divisions(uuid) TO authenticated, service_role;

-- Projects
DROP POLICY IF EXISTS "company view jobs" ON public.jobs;
CREATE POLICY "company view jobs" ON public.jobs
FOR SELECT TO authenticated
USING (private.is_company_member(company_id, auth.uid()) AND private.can_see_job(id, auth.uid()));

DROP POLICY IF EXISTS "company update jobs" ON public.jobs;
CREATE POLICY "company update jobs" ON public.jobs
FOR UPDATE TO authenticated
USING (
  private.is_company_member(company_id, auth.uid())
  AND private.can_see_job(id, auth.uid())
  AND private.has_perm(auth.uid(), 'edit_projects')
);

DROP POLICY IF EXISTS "company delete jobs" ON public.jobs;
CREATE POLICY "company delete jobs" ON public.jobs
FOR DELETE TO authenticated
USING (
  private.company_role_of(company_id, auth.uid()) = ANY (ARRAY['owner'::company_role, 'admin'::company_role])
  AND private.has_perm(auth.uid(), 'delete_projects')
);

DROP POLICY IF EXISTS "company insert jobs" ON public.jobs;
CREATE POLICY "company insert jobs" ON public.jobs
FOR INSERT TO authenticated
WITH CHECK (
  private.is_company_member(company_id, auth.uid())
  AND user_id = auth.uid()
  AND private.has_perm(auth.uid(), 'add_projects')
  AND (
    private.is_admin(auth.uid())
    OR (
      COALESCE(array_length(divisions, 1), 0) > 0
      AND divisions <@ private.user_divisions(auth.uid())
    )
  )
);

-- Photos
DROP POLICY IF EXISTS "company view photos" ON public.photos;
CREATE POLICY "company view photos" ON public.photos
FOR SELECT TO authenticated
USING (private.is_company_member(company_id, auth.uid()) AND private.can_see_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "company insert photos" ON public.photos;
CREATE POLICY "company insert photos" ON public.photos
FOR INSERT TO authenticated
WITH CHECK (
  private.is_company_member(company_id, auth.uid())
  AND user_id = auth.uid()
  AND private.can_see_job(job_id, auth.uid())
  AND private.has_perm(auth.uid(), 'add_photos')
);

DROP POLICY IF EXISTS "company update photos" ON public.photos;
CREATE POLICY "company update photos" ON public.photos
FOR UPDATE TO authenticated
USING (
  private.is_company_member(company_id, auth.uid())
  AND private.can_see_job(job_id, auth.uid())
  AND private.has_perm(auth.uid(), 'edit_photos')
);

DROP POLICY IF EXISTS "company delete photos" ON public.photos;
CREATE POLICY "company delete photos" ON public.photos
FOR DELETE TO authenticated
USING (
  private.is_company_member(company_id, auth.uid())
  AND private.can_see_job(job_id, auth.uid())
  AND (user_id = auth.uid() OR private.company_role_of(company_id, auth.uid()) = ANY (ARRAY['owner'::company_role, 'admin'::company_role]))
  AND private.has_perm(auth.uid(), 'delete_photos')
);

-- Areas
DROP POLICY IF EXISTS "company view areas" ON public.areas;
CREATE POLICY "company view areas" ON public.areas
FOR SELECT TO authenticated
USING (private.is_company_member(company_id, auth.uid()) AND private.can_see_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "company insert areas" ON public.areas;
CREATE POLICY "company insert areas" ON public.areas
FOR INSERT TO authenticated
WITH CHECK (private.is_company_member(company_id, auth.uid()) AND user_id = auth.uid() AND private.can_see_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "company update areas" ON public.areas;
CREATE POLICY "company update areas" ON public.areas
FOR UPDATE TO authenticated
USING (private.is_company_member(company_id, auth.uid()) AND private.can_see_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "company delete areas" ON public.areas;
CREATE POLICY "company delete areas" ON public.areas
FOR DELETE TO authenticated
USING (private.is_company_member(company_id, auth.uid()) AND private.can_see_job(job_id, auth.uid()));

-- Comments
DROP POLICY IF EXISTS "company view comments" ON public.comments;
CREATE POLICY "company view comments" ON public.comments
FOR SELECT TO authenticated
USING (private.is_company_member(company_id, auth.uid()) AND private.can_see_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "company insert comments" ON public.comments;
CREATE POLICY "company insert comments" ON public.comments
FOR INSERT TO authenticated
WITH CHECK (private.is_company_member(company_id, auth.uid()) AND user_id = auth.uid() AND private.can_see_job(job_id, auth.uid()));

-- Activity
DROP POLICY IF EXISTS "company view activity" ON public.activity_events;
CREATE POLICY "company view activity" ON public.activity_events
FOR SELECT TO authenticated
USING (
  private.is_company_member(company_id, auth.uid())
  AND (job_id IS NULL OR private.can_see_job(job_id, auth.uid()))
);

DROP POLICY IF EXISTS "company insert activity" ON public.activity_events;
CREATE POLICY "company insert activity" ON public.activity_events
FOR INSERT TO authenticated
WITH CHECK (
  private.is_company_member(company_id, auth.uid())
  AND (job_id IS NULL OR private.can_see_job(job_id, auth.uid()))
);

-- Share links
DROP POLICY IF EXISTS "company view share" ON public.share_links;
CREATE POLICY "company view share" ON public.share_links
FOR SELECT TO authenticated
USING (private.is_company_member(company_id, auth.uid()) AND private.can_see_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "company create share" ON public.share_links;
CREATE POLICY "company create share" ON public.share_links
FOR INSERT TO authenticated
WITH CHECK (private.is_company_member(company_id, auth.uid()) AND created_by = auth.uid() AND private.can_see_job(job_id, auth.uid()));

DROP POLICY IF EXISTS "company delete share" ON public.share_links;
CREATE POLICY "company delete share" ON public.share_links
FOR DELETE TO authenticated
USING (private.is_company_member(company_id, auth.uid()) AND private.can_see_job(job_id, auth.uid()));

-- Collaborators
DROP POLICY IF EXISTS "company view collaborators" ON public.project_collaborators;
CREATE POLICY "company view collaborators" ON public.project_collaborators
FOR SELECT TO authenticated
USING (
  private.is_company_member(company_id, auth.uid())
  AND (user_id = auth.uid() OR private.can_see_job(job_id, auth.uid()))
);

DROP POLICY IF EXISTS "editors insert collaborators" ON public.project_collaborators;
CREATE POLICY "editors insert collaborators" ON public.project_collaborators
FOR INSERT TO authenticated
WITH CHECK (
  private.is_company_member(company_id, auth.uid())
  AND private.can_see_job(job_id, auth.uid())
  AND private.has_perm(auth.uid(), 'edit_projects')
);

DROP POLICY IF EXISTS "editors update collaborators" ON public.project_collaborators;
CREATE POLICY "editors update collaborators" ON public.project_collaborators
FOR UPDATE TO authenticated
USING (
  private.is_company_member(company_id, auth.uid())
  AND private.can_see_job(job_id, auth.uid())
  AND private.has_perm(auth.uid(), 'edit_projects')
);

DROP POLICY IF EXISTS "editors delete collaborators" ON public.project_collaborators;
CREATE POLICY "editors delete collaborators" ON public.project_collaborators
FOR DELETE TO authenticated
USING (
  private.is_company_member(company_id, auth.uid())
  AND private.can_see_job(job_id, auth.uid())
  AND private.has_perm(auth.uid(), 'edit_projects')
);