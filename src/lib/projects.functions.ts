import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Throws unless the caller is an active Admin. Enforced on the server, never in the browser. */
async function assertAdmin(context: {
  supabase: { rpc: (fn: "is_admin", args: { _user_id: string }) => PromiseLike<{ data: unknown; error: unknown }> };
  userId: string;
}) {
  const { data, error } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (error || data !== true) throw new Error("Forbidden: administrators only");
}

/** Permanently deletes a project and everything attached to it. Admin only. */
export const adminDeleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { projectId: string }) => {
    if (!d?.projectId) throw new Error("Missing project");
    return d;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

    const { data: job, error: jobErr } = await db
      .from("jobs")
      .select("id, name, company_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (jobErr) throw new Error(jobErr.message);
    if (!job) throw new Error("This project no longer exists");

    // Photo files in storage first, so nothing is orphaned.
    const { data: photos } = await db.from("photos").select("id, storage_path").eq("job_id", job.id);
    const paths = (photos ?? []).map((p) => p.storage_path).filter(Boolean) as string[];
    if (paths.length) await db.storage.from("job-photos").remove(paths);

    await db.from("comments").delete().eq("job_id", job.id);
    await db.from("photos").delete().eq("job_id", job.id);
    await db.from("areas").delete().eq("job_id", job.id);
    await db.from("project_collaborators").delete().eq("job_id", job.id);
    await db.from("share_links").delete().eq("job_id", job.id);
    await db.from("activity_events").delete().eq("job_id", job.id);

    const { error } = await db.from("jobs").delete().eq("id", job.id);
    if (error) throw new Error(error.message);

    await db.from("audit_log").insert({
      actor_id: context.userId,
      action: "project_deleted",
      target_type: "project",
      target_id: job.id,
      details: { name: job.name, photos_deleted: photos?.length ?? 0 } as never,
    });

    return { ok: true, name: job.name };
  });
