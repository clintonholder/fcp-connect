import { supabase } from "@/integrations/supabase/client";

export async function logActivity(opts: {
  company_id: string; job_id?: string | null; area_id?: string | null;
  photo_id?: string | null; kind: string; meta?: Record<string, unknown>;
}) {
  const { data: u } = await supabase.auth.getUser();
  await supabase.from("activity_events").insert({
    company_id: opts.company_id,
    job_id: opts.job_id ?? null,
    area_id: opts.area_id ?? null,
    photo_id: opts.photo_id ?? null,
    user_id: u.user?.id ?? null,
    kind: opts.kind,
    meta: (opts.meta ?? {}) as never,
  });
}
