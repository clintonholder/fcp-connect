import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DIVISIONS } from "@/lib/project-meta";
import {
  resolveAudience,
  validateMessageInput,
  type AudiencePerson,
  type AudienceProject,
} from "@/lib/messages";
import type { WorkerType } from "@/lib/worker-type";

type Ctx = {
  supabase: {
    rpc: (
      fn: "has_perm",
      args: { _user_id: string; _perm: string },
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  userId: string;
};

/** Throws unless the caller has send_messages. Reads and writes below run under the caller's RLS. */
export async function assertSendMessages(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_perm", {
    _user_id: context.userId,
    _perm: "send_messages",
  });
  if (error || data !== true) throw new Error("Forbidden: you cannot send messages");
}

export type ComposeData = {
  people: (AudiencePerson & { name: string })[];
  roles: { id: string; name: string }[];
  divisions: readonly string[];
  projects: (AudienceProject & { name: string })[];
  safetyDocuments: { id: string; title: string }[];
};

/** Reads the audience directory under the caller's RLS. */
async function loadComposeData(supabase: SupabaseClient<Database>): Promise<ComposeData> {
  const [profiles, userRoles, userDivisions, roles, jobs, collabs, docs] = await Promise.all([
    supabase.from("profiles").select("id, display_name, email, worker_type, is_disabled"),
    supabase.from("user_roles").select("user_id, role_id"),
    supabase.from("user_divisions").select("user_id, division"),
    supabase.from("app_roles").select("id, name").eq("is_active", true).order("name"),
    supabase.from("jobs").select("id, name, owner_id").is("archived_at", null).order("name"),
    supabase.from("project_collaborators").select("job_id, user_id"),
    supabase.from("safety_documents").select("id, title").eq("archived", false).order("title"),
  ]);
  const err =
    profiles.error ??
    userRoles.error ??
    userDivisions.error ??
    roles.error ??
    jobs.error ??
    collabs.error ??
    docs.error;
  if (err) throw new Error(err.message);

  const rolesByUser = new Map<string, string[]>();
  for (const r of userRoles.data ?? []) {
    rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), r.role_id]);
  }
  const divisionsByUser = new Map<string, string[]>();
  for (const d of userDivisions.data ?? []) {
    divisionsByUser.set(d.user_id, [...(divisionsByUser.get(d.user_id) ?? []), d.division]);
  }
  const collabsByJob = new Map<string, string[]>();
  for (const c of collabs.data ?? []) {
    collabsByJob.set(c.job_id, [...(collabsByJob.get(c.job_id) ?? []), c.user_id]);
  }

  return {
    people: (profiles.data ?? []).map((p) => ({
      id: p.id,
      name: p.display_name || p.email || "Unknown",
      workerType: (p.worker_type === "subcontractor" ? "subcontractor" : "employee") as WorkerType,
      isDisabled: p.is_disabled,
      divisions: divisionsByUser.get(p.id) ?? [],
      roleIds: rolesByUser.get(p.id) ?? [],
    })),
    roles: roles.data ?? [],
    divisions: DIVISIONS,
    projects: (jobs.data ?? []).map((j) => ({
      id: j.id,
      name: j.name,
      ownerId: j.owner_id,
      collaboratorIds: collabsByJob.get(j.id) ?? [],
    })),
    safetyDocuments: docs.data ?? [],
  };
}

export const getMessageComposeData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSendMessages(context);
    return loadComposeData(context.supabase);
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => validateMessageInput(d))
  .handler(async ({ data, context }) => {
    await assertSendMessages(context);
    const supabase = context.supabase;
    const directory = await loadComposeData(supabase);
    const recipients = resolveAudience(data.selection, directory, context.userId);
    if (recipients.length === 0) throw new Error("No recipients match this audience");

    const { data: msg, error } = await supabase
      .from("messages")
      .insert({
        subject: data.subject,
        body: data.body,
        project_id: data.projectId,
        safety_document_id: data.safetyDocumentId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: rcptError } = await supabase
      .from("message_recipients")
      .insert(recipients.map((user_id) => ({ message_id: msg.id, user_id })));
    if (rcptError) {
      await supabaseAdmin.from("messages").delete().eq("id", msg.id);
      throw new Error(rcptError.message);
    }

    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "message_sent",
      target_type: "message",
      target_id: msg.id,
      details: {
        subject: data.subject,
        recipient_count: recipients.length,
        selection: data.selection,
        project_id: data.projectId,
        safety_document_id: data.safetyDocumentId,
      } as never,
    });

    return { id: msg.id, recipientCount: recipients.length };
  });
