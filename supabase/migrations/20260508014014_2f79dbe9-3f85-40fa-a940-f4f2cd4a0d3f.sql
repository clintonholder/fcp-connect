
-- =========================
-- ROLES + COMPANIES
-- =========================
CREATE TYPE public.company_role AS ENUM ('owner', 'admin', 'member');

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.company_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, user_id)
);
ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- Profiles (display name for activity/comments UI)
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- HELPER FUNCTIONS (avoid RLS recursion)
-- =========================
CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.company_role_of(_company_id uuid, _user_id uuid)
RETURNS public.company_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id LIMIT 1;
$$;

-- =========================
-- ALTER EXISTING TABLES: add company_id
-- =========================
ALTER TABLE public.jobs   ADD COLUMN company_id uuid;
ALTER TABLE public.areas  ADD COLUMN company_id uuid;
ALTER TABLE public.photos ADD COLUMN company_id uuid;
ALTER TABLE public.photos ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.photos ADD COLUMN annotated_image_url text;

CREATE INDEX idx_jobs_company   ON public.jobs(company_id);
CREATE INDEX idx_areas_company  ON public.areas(company_id);
CREATE INDEX idx_photos_company ON public.photos(company_id);
CREATE INDEX idx_photos_tags    ON public.photos USING GIN(tags);

-- Backfill: create a "Personal" company per existing user, assign their data to it
DO $$
DECLARE r record; new_co uuid;
BEGIN
  FOR r IN SELECT DISTINCT user_id FROM public.jobs LOOP
    INSERT INTO public.companies (name, owner_id) VALUES ('Personal', r.user_id) RETURNING id INTO new_co;
    INSERT INTO public.company_members (company_id, user_id, role) VALUES (new_co, r.user_id, 'owner');
    UPDATE public.jobs   SET company_id = new_co WHERE user_id = r.user_id AND company_id IS NULL;
    UPDATE public.areas  SET company_id = new_co WHERE user_id = r.user_id AND company_id IS NULL;
    UPDATE public.photos SET company_id = new_co WHERE user_id = r.user_id AND company_id IS NULL;
  END LOOP;
END $$;

ALTER TABLE public.jobs   ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.areas  ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.photos ALTER COLUMN company_id SET NOT NULL;

-- =========================
-- COMMENTS
-- =========================
CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_comments_photo ON public.comments(photo_id);

-- =========================
-- ACTIVITY EVENTS
-- =========================
CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  job_id uuid,
  area_id uuid,
  photo_id uuid,
  user_id uuid,
  kind text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_activity_job ON public.activity_events(job_id, created_at DESC);
CREATE INDEX idx_activity_company ON public.activity_events(company_id, created_at DESC);

-- =========================
-- SHARE LINKS
-- =========================
CREATE TABLE public.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(18), 'base64'),
  job_id uuid NOT NULL,
  company_id uuid NOT NULL,
  created_by uuid NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_share_token ON public.share_links(token);

-- =========================
-- DROP OLD POLICIES, CREATE NEW COMPANY-SCOPED ONES
-- =========================
DROP POLICY IF EXISTS "own jobs select"   ON public.jobs;
DROP POLICY IF EXISTS "own jobs insert"   ON public.jobs;
DROP POLICY IF EXISTS "own jobs update"   ON public.jobs;
DROP POLICY IF EXISTS "own jobs delete"   ON public.jobs;
DROP POLICY IF EXISTS "own areas select"  ON public.areas;
DROP POLICY IF EXISTS "own areas insert"  ON public.areas;
DROP POLICY IF EXISTS "own areas update"  ON public.areas;
DROP POLICY IF EXISTS "own areas delete"  ON public.areas;
DROP POLICY IF EXISTS "own photos select" ON public.photos;
DROP POLICY IF EXISTS "own photos insert" ON public.photos;
DROP POLICY IF EXISTS "own photos update" ON public.photos;
DROP POLICY IF EXISTS "own photos delete" ON public.photos;

-- COMPANIES
CREATE POLICY "members view company" ON public.companies FOR SELECT TO authenticated
  USING (public.is_company_member(id, auth.uid()));
CREATE POLICY "anyone create company" ON public.companies FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "owner admin update company" ON public.companies FOR UPDATE TO authenticated
  USING (public.company_role_of(id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "owner delete company" ON public.companies FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- COMPANY MEMBERS
CREATE POLICY "members view roster" ON public.company_members FOR SELECT TO authenticated
  USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "owner self insert membership" ON public.company_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() -- creator inserting themselves as owner during company creation
    OR public.company_role_of(company_id, auth.uid()) IN ('owner','admin')
  );
CREATE POLICY "admin update membership" ON public.company_members FOR UPDATE TO authenticated
  USING (public.company_role_of(company_id, auth.uid()) IN ('owner','admin'));
CREATE POLICY "admin remove membership" ON public.company_members FOR DELETE TO authenticated
  USING (public.company_role_of(company_id, auth.uid()) IN ('owner','admin') OR user_id = auth.uid());

-- PROFILES
CREATE POLICY "any member view profile" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "self update profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "self insert profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- JOBS
CREATE POLICY "company view jobs"   ON public.jobs FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "company insert jobs" ON public.jobs FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "company update jobs" ON public.jobs FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "company delete jobs" ON public.jobs FOR DELETE TO authenticated USING (public.company_role_of(company_id, auth.uid()) IN ('owner','admin'));

-- AREAS
CREATE POLICY "company view areas"   ON public.areas FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "company insert areas" ON public.areas FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "company update areas" ON public.areas FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "company delete areas" ON public.areas FOR DELETE TO authenticated USING (public.is_company_member(company_id, auth.uid()));

-- PHOTOS
CREATE POLICY "company view photos"   ON public.photos FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "company insert photos" ON public.photos FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "company update photos" ON public.photos FOR UPDATE TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "company delete photos" ON public.photos FOR DELETE TO authenticated USING (public.is_company_member(company_id, auth.uid()) AND (user_id = auth.uid() OR public.company_role_of(company_id, auth.uid()) IN ('owner','admin')));

-- COMMENTS
CREATE POLICY "company view comments"   ON public.comments FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "company insert comments" ON public.comments FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()) AND user_id = auth.uid());
CREATE POLICY "self update comments"    ON public.comments FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "self or admin delete comments" ON public.comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.company_role_of(company_id, auth.uid()) IN ('owner','admin'));

-- ACTIVITY
CREATE POLICY "company view activity"   ON public.activity_events FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "company insert activity" ON public.activity_events FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()));

-- SHARE LINKS
CREATE POLICY "company view share"   ON public.share_links FOR SELECT TO authenticated USING (public.is_company_member(company_id, auth.uid()));
CREATE POLICY "company create share" ON public.share_links FOR INSERT TO authenticated WITH CHECK (public.is_company_member(company_id, auth.uid()) AND created_by = auth.uid());
CREATE POLICY "company delete share" ON public.share_links FOR DELETE TO authenticated USING (public.is_company_member(company_id, auth.uid()));

-- =========================
-- PUBLIC SHARE FUNCTIONS (anonymous read via token)
-- =========================
CREATE OR REPLACE FUNCTION public.get_shared_job(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _job_id uuid; _result jsonb;
BEGIN
  SELECT job_id INTO _job_id FROM public.share_links
   WHERE token = _token AND (expires_at IS NULL OR expires_at > now()) LIMIT 1;
  IF _job_id IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'job',    (SELECT to_jsonb(j) FROM public.jobs j WHERE j.id = _job_id),
    'areas',  COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at) FROM public.areas a WHERE a.job_id = _job_id), '[]'::jsonb),
    'photos', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.taken_at DESC) FROM public.photos p WHERE p.job_id = _job_id), '[]'::jsonb)
  ) INTO _result;
  RETURN _result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_shared_job(text) TO anon, authenticated;

-- =========================
-- STORAGE: company-member access
-- =========================
DROP POLICY IF EXISTS "Users can upload to job-photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read job-photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own job-photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own job-photos" ON storage.objects;

CREATE POLICY "job-photos public read"
  ON storage.objects FOR SELECT USING (bucket_id = 'job-photos');
CREATE POLICY "job-photos auth upload"
  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'job-photos');
CREATE POLICY "job-photos owner update"
  ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'job-photos' AND owner = auth.uid());
CREATE POLICY "job-photos owner delete"
  ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'job-photos' AND owner = auth.uid());
