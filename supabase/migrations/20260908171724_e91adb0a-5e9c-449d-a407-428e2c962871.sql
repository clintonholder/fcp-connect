-- Backfill: attach any profile with no company to the (single) existing company
INSERT INTO public.company_members (company_id, user_id, role)
SELECT (SELECT id FROM public.companies ORDER BY created_at LIMIT 1), p.id, 'member'::company_role
FROM public.profiles p
WHERE (SELECT id FROM public.companies ORDER BY created_at LIMIT 1) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.user_id = p.id);

-- Keep it that way for new accounts
CREATE OR REPLACE FUNCTION public.add_new_user_to_default_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _company uuid;
BEGIN
  SELECT id INTO _company FROM public.companies ORDER BY created_at LIMIT 1;
  IF _company IS NOT NULL THEN
    INSERT INTO public.company_members (company_id, user_id, role)
    VALUES (_company, NEW.id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_default_company ON public.profiles;
CREATE TRIGGER profiles_default_company
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.add_new_user_to_default_company();

REVOKE EXECUTE ON FUNCTION public.add_new_user_to_default_company() FROM PUBLIC, anon, authenticated;