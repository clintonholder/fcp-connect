import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DIVISIONS } from "@/lib/project-meta";
import {
  buildSentReport,
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

type ReaderCtx = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

/**
 * Picks the client and user for a read. Under View As the viewed user's rows are read with the
 * service role, only for an admin with an active proxy session for that user, so every query
 * must filter by the returned userId.
 */
async function resolveReader(
  context: ReaderCtx,
  viewAsUserId?: string | null,
): Promise<{ db: SupabaseClient<Database>; userId: string }> {
  if (!viewAsUserId || viewAsUserId === context.userId) {
    return { db: context.supabase, userId: context.userId };
  }
  const { data, error } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (error || data !== true) throw new Error("Forbidden: administrators only");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // proxy_sessions is not in the generated types, so reach it through a loose table handle.
  const sessions = (
    supabaseAdmin as unknown as {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: (t: string) => any;
    }
  ).from("proxy_sessions");
  const { data: session, error: sessionErr } = await sessions
    .select("id")
    .eq("admin_id", context.userId)
    .eq("viewed_user_id", viewAsUserId)
    .is("ended_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();
  if (sessionErr || !session) {
    throw new Error("Forbidden: no active View As session for that user");
  }
  return { db: supabaseAdmin as unknown as SupabaseClient<Database>, userId: viewAsUserId };
}

const optionalViewAs = (d: unknown) => {
  const v = (d ?? {}) as { viewAsUserId?: unknown };
  if (v.viewAsUserId != null && typeof v.viewAsUserId !== "string") throw new Error("Invalid user");
  return { viewAsUserId: (v.viewAsUserId as string | null | undefined) ?? null };
};

async function loadNames(db: SupabaseClient<Database>, ids: string[]) {
  const names: Record<string, string> = {};
  if (ids.length === 0) return names;
  const { data, error } = await db.from("profiles").select("id, display_name, email").in("id", ids);
  if (error) throw new Error(error.message);
  for (const p of data ?? []) names[p.id] = p.display_name || p.email || "Unknown";
  return names;
}

export const getUnreadMessageCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(optionalViewAs)
  .handler(async ({ data, context }) => {
    const { db, userId } = await resolveReader(context, data.viewAsUserId);
    const { count, error } = await db
      .from("message_recipients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export type InboxRow = {
  id: string;
  subject: string;
  senderName: string;
  sentAt: string;
  readAt: string | null;
};

export const getInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(optionalViewAs)
  .handler(async ({ data, context }): Promise<InboxRow[]> => {
    const { db, userId } = await resolveReader(context, data.viewAsUserId);
    const { data: rows, error } = await db
      .from("message_recipients")
      .select("read_at, messages(id, subject, sent_at, sender_id)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    const items = (rows ?? []).flatMap((r) =>
      r.messages ? [{ readAt: r.read_at, m: r.messages }] : [],
    );
    const names = await loadNames(db, [...new Set(items.map((i) => i.m.sender_id))]);
    return items
      .map(({ readAt, m }) => ({
        id: m.id,
        subject: m.subject,
        senderName: names[m.sender_id] ?? "Unknown",
        sentAt: m.sent_at,
        readAt,
      }))
      .sort((a, b) => (a.sentAt < b.sentAt ? 1 : a.sentAt > b.sentAt ? -1 : 0));
  });

export type MessageLink =
  | { kind: "project"; id: string; name: string }
  | { kind: "safety_document"; id: string; title: string }
  | null;

export type MessageDetail = {
  id: string;
  subject: string;
  body: string;
  sentAt: string;
  senderName: string;
  isSender: boolean;
  isRecipient: boolean;
  readAt: string | null;
  link: MessageLink;
};

export const getMessage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const v = (d ?? {}) as { messageId?: unknown };
    if (typeof v.messageId !== "string" || !v.messageId) throw new Error("Missing message");
    return { messageId: v.messageId, ...optionalViewAs(d) };
  })
  .handler(async ({ data, context }): Promise<MessageDetail> => {
    const { db, userId } = await resolveReader(context, data.viewAsUserId);
    const { data: msg, error } = await db
      .from("messages")
      .select("id, subject, body, sent_at, sender_id, project_id, safety_document_id")
      .eq("id", data.messageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!msg) throw new Error("Message not found");
    const { data: rcpt, error: rcptErr } = await db
      .from("message_recipients")
      .select("read_at")
      .eq("message_id", msg.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (rcptErr) throw new Error(rcptErr.message);
    const isSender = msg.sender_id === userId;
    if (!isSender && !rcpt) throw new Error("Message not found");

    let link: MessageLink = null;
    if (msg.project_id) {
      const { data: job } = await db
        .from("jobs")
        .select("id, name")
        .eq("id", msg.project_id)
        .maybeSingle();
      if (job) link = { kind: "project", id: job.id, name: job.name };
    } else if (msg.safety_document_id) {
      const { data: doc } = await db
        .from("safety_documents")
        .select("id, title")
        .eq("id", msg.safety_document_id)
        .maybeSingle();
      if (doc) link = { kind: "safety_document", id: doc.id, title: doc.title };
    }

    const names = await loadNames(db, [msg.sender_id]);
    return {
      id: msg.id,
      subject: msg.subject,
      body: msg.body,
      sentAt: msg.sent_at,
      senderName: names[msg.sender_id] ?? "Unknown",
      isSender,
      isRecipient: !!rcpt,
      readAt: rcpt?.read_at ?? null,
      link,
    };
  });

export const getSentMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(optionalViewAs)
  .handler(async ({ data, context }) => {
    const { db, userId } = await resolveReader(context, data.viewAsUserId);
    const { data: msgs, error } = await db
      .from("messages")
      .select("id, subject, sent_at")
      .eq("sender_id", userId);
    if (error) throw new Error(error.message);
    const ids = (msgs ?? []).map((m) => m.id);
    const { data: rcpts, error: rcptErr } = ids.length
      ? await db
          .from("message_recipients")
          .select("message_id, user_id, read_at")
          .in("message_id", ids)
      : { data: [], error: null };
    if (rcptErr) throw new Error(rcptErr.message);
    const names = await loadNames(db, [...new Set((rcpts ?? []).map((r) => r.user_id))]);
    return buildSentReport(
      (msgs ?? []).map((m) => ({ id: m.id, subject: m.subject, sentAt: m.sent_at })),
      (rcpts ?? []).map((r) => ({ messageId: r.message_id, userId: r.user_id, readAt: r.read_at })),
      names,
    );
  });

/** Records the caller's own read receipt under their RLS; never takes a View As user. */
export const markMessageRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => {
    const v = (d ?? {}) as { messageId?: unknown };
    if (typeof v.messageId !== "string" || !v.messageId) throw new Error("Missing message");
    return { messageId: v.messageId };
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_recipients")
      .update({ read_at: new Date().toISOString() })
      .eq("message_id", data.messageId)
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
