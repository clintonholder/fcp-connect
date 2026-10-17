import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SAFETY_BUCKET,
  validateEffectiveDate,
  validateFilePath,
  validateSafetyInput,
  type SafetyInput,
} from "@/lib/safety-documents";
import {
  buildAcknowledgementReport,
  type AckDoc,
  type Person,
} from "@/lib/safety-acknowledgements";

type Ctx = {
  supabase: {
    rpc: (
      fn: "has_perm",
      args: { _user_id: string; _perm: string },
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
  userId: string;
};

/** Throws unless the caller has manage_safety. Writes below also run under the caller's RLS. */
export async function assertManageSafety(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_perm", {
    _user_id: context.userId,
    _perm: "manage_safety",
  });
  if (error || data !== true) throw new Error("Forbidden: you cannot manage safety documents");
}

async function audit(
  actorId: string,
  action: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_type: "safety_document",
    target_id: targetId,
    details: details as never,
  });
}

function requireId(id: unknown): string {
  if (typeof id !== "string" || !id) throw new Error("Missing document");
  return id;
}

export const createSafetyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SafetyInput) => validateSafetyInput(d))
  .handler(async ({ data, context }) => {
    await assertManageSafety(context);
    const { data: row, error } = await context.supabase
      .from("safety_documents")
      .insert({
        title: data.title,
        category: data.category,
        description: data.description,
        version: data.version,
        effective_date: data.effectiveDate,
        shareable_with_subs: data.shareableWithSubs,
        requires_acknowledgement: data.requiresAcknowledgement,
        file_path: data.filePath,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await audit(context.userId, "safety_document_uploaded", row.id, {
      title: data.title,
      category: data.category,
      version: data.version,
      shareable_with_subs: data.shareableWithSubs,
      requires_acknowledgement: data.requiresAcknowledgement,
    });
    return { id: row.id };
  });

export const replaceSafetyDocumentVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id: string;
      filePath: string;
      version?: string | null;
      effectiveDate?: string | null;
    }) => ({
      id: requireId(d?.id),
      filePath: validateFilePath(d?.filePath),
      version: (d?.version ?? "").trim() || null,
      effectiveDate: validateEffectiveDate(d?.effectiveDate),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertManageSafety(context);
    const { data: old, error: oldErr } = await context.supabase
      .from("safety_documents")
      .select("title, category, version, file_path")
      .eq("id", data.id)
      .eq("archived", false)
      .maybeSingle();
    if (oldErr) throw new Error(oldErr.message);
    if (!old) throw new Error("This document no longer exists or is archived");

    const { data: updated, error } = await context.supabase
      .from("safety_documents")
      .update({
        file_path: data.filePath,
        version: data.version,
        effective_date: data.effectiveDate,
      })
      .eq("id", data.id)
      .eq("archived", false)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("This document no longer exists or is archived");

    // The row now points at the new file; drop the old one. A failure here only orphans a file.
    const { error: removeErr } = await context.supabase.storage
      .from(SAFETY_BUCKET)
      .remove([old.file_path]);
    if (removeErr) console.error("Could not remove replaced safety file", old.file_path, removeErr);

    await audit(context.userId, "safety_document_replaced", data.id, {
      title: old.title,
      category: old.category,
      old_version: old.version,
      new_version: data.version,
    });
    return { id: data.id };
  });

export const archiveSafetyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: requireId(d?.id) }))
  .handler(async ({ data, context }) => {
    await assertManageSafety(context);
    const { data: updated, error } = await context.supabase
      .from("safety_documents")
      .update({ archived: true })
      .eq("id", data.id)
      .select("id, title, category");
    if (error) throw new Error(error.message);
    const doc = updated?.[0];
    if (!doc) throw new Error("This document no longer exists");

    await audit(context.userId, "safety_document_archived", doc.id, {
      title: doc.title,
      category: doc.category,
    });
    return { id: doc.id };
  });

export const setSafetyDocumentRequiresAcknowledgement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; required: boolean }) => ({
    id: requireId(d?.id),
    required: d?.required === true,
  }))
  .handler(async ({ data, context }) => {
    await assertManageSafety(context);
    const { data: updated, error } = await context.supabase
      .from("safety_documents")
      .update({ requires_acknowledgement: data.required })
      .eq("id", data.id)
      .select("id, title");
    if (error) throw new Error(error.message);
    const doc = updated?.[0];
    if (!doc) throw new Error("This document no longer exists");

    await audit(context.userId, "safety_document_ack_requirement_changed", doc.id, {
      title: doc.title,
      required: data.required,
    });
    return { id: doc.id };
  });

export const acknowledgeSafetyDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: requireId(d?.id) }))
  .handler(async ({ data, context }) => {
    const { data: doc, error: docErr } = await context.supabase
      .from("safety_documents")
      .select("revision, archived, requires_acknowledgement")
      .eq("id", data.id)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc || doc.archived || !doc.requires_acknowledgement) {
      throw new Error("This document cannot be acknowledged");
    }

    const { error } = await context.supabase
      .from("safety_acknowledgements")
      .insert({ document_id: data.id, revision: doc.revision });
    // 23505 = unique violation: already acknowledged at this revision, which counts as success.
    if (error && error.code !== "23505") throw new Error(error.message);
    return { id: data.id };
  });

export const getSafetyAcknowledgementReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManageSafety(context);
    const [docs, acks, profiles, roles] = await Promise.all([
      context.supabase
        .from("safety_documents")
        .select(
          "id, title, category, version, revision, archived, requires_acknowledgement, shareable_with_subs",
        )
        .eq("archived", false)
        .eq("requires_acknowledgement", true),
      context.supabase
        .from("safety_acknowledgements")
        .select("user_id, document_id, revision, acknowledged_at"),
      context.supabase.from("profiles").select("id, display_name, email, worker_type, is_disabled"),
      context.supabase
        .from("user_roles")
        .select("user_id, app_roles(is_active, is_admin, can_view_safety, can_manage_safety)"),
    ]);
    for (const r of [docs, acks, profiles, roles]) {
      if (r.error) throw new Error(r.error.message);
    }

    // Mirrors has_perm: any active role that is admin or grants view or manage safety.
    const canView = new Set<string>();
    for (const r of roles.data ?? []) {
      const role = r.app_roles;
      if (role?.is_active && (role.is_admin || role.can_view_safety || role.can_manage_safety)) {
        canView.add(r.user_id);
      }
    }
    const people: Person[] = (profiles.data ?? []).map((p) => ({
      id: p.id,
      name: p.display_name || p.email || "Unknown user",
      isSubcontractor: p.worker_type === "subcontractor",
      isDisabled: p.is_disabled,
      canViewSafety: canView.has(p.id),
    }));
    return buildAcknowledgementReport((docs.data ?? []) as AckDoc[], people, acks.data ?? []);
  });
