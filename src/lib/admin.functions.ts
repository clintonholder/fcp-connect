import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Throws unless the caller is an active Admin. Enforced on the server, never in the browser. */
async function assertAdmin(context: { supabase: { rpc: (fn: "is_admin", args: { _user_id: string }) => PromiseLike<{ data: unknown; error: unknown }> }; userId: string }) {
  const { data, error } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (error || data !== true) throw new Error("Forbidden: administrators only");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown> = {},
) {
  const db = await admin();
  await db.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details as never,
  });
}

async function countActiveAdmins(excludeUserId?: string) {
  const db = await admin();
  const { data: adminRole } = await db.from("app_roles").select("id").eq("is_admin", true).eq("is_active", true);
  const ids = (adminRole ?? []).map((r) => r.id);
  if (!ids.length) return 0;
  const { data: ur } = await db.from("user_roles").select("user_id").in("role_id", ids);
  const userIds = Array.from(new Set((ur ?? []).map((r) => r.user_id))).filter((id) => id !== excludeUserId);
  if (!userIds.length) return 0;
  const { data: profs } = await db.from("profiles").select("id, is_disabled").in("id", userIds);
  return (profs ?? []).filter((p) => !p.is_disabled).length;
}

/* ------------------------------- reads ------------------------------- */

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = await admin();
    const [{ data: profiles }, { data: userRoles }, { data: invites }] = await Promise.all([
      db.from("profiles").select("id, email, display_name, is_disabled, created_at").order("created_at"),
      db.from("user_roles").select("user_id, role_id, app_roles(id, name, is_active, is_admin)"),
      db.from("invitations").select("*").order("created_at", { ascending: false }),
    ]);

    const { data: authList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authById = new Map(authList?.users?.map((u) => [u.id, u]) ?? []);

    return {
      users: (profiles ?? []).map((p) => {
        const au = authById.get(p.id);
        const confirmed = !!au?.email_confirmed_at;
        const invite = (invites ?? []).find((i) => i.email?.toLowerCase() === (p.email ?? "").toLowerCase());
        let status: string;
        if (p.is_disabled) status = "Disabled";
        else if (!confirmed && invite && new Date(invite.expires_at) < new Date()) status = "Expired";
        else if (!confirmed && invite) status = "Invited";
        else if (!confirmed) status = "Unverified";
        else status = "Active";
        return {
          id: p.id,
          email: p.email ?? au?.email ?? "",
          display_name: p.display_name,
          is_disabled: p.is_disabled,
          created_at: p.created_at,
          last_sign_in_at: au?.last_sign_in_at ?? null,
          status,
          roles: (userRoles ?? [])
            .filter((r) => r.user_id === p.id)
            .map((r) => r.app_roles as unknown as { id: string; name: string; is_admin: boolean } | null)
            .filter((r): r is { id: string; name: string; is_admin: boolean } => !!r),
        };
      }),
      invitations: invites ?? [],
    };
  });

export const adminListAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { data } = await db
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    const actorIds = Array.from(new Set((data ?? []).map((d) => d.actor_id).filter(Boolean))) as string[];
    const { data: profs } = actorIds.length
      ? await db.from("profiles").select("id, display_name, email").in("id", actorIds)
      : { data: [] as { id: string; display_name: string | null; email: string | null }[] };
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.display_name || p.email || "Someone"]));
    return (data ?? []).map((d) => ({ ...d, actor_name: d.actor_id ? nameById.get(d.actor_id) ?? "Someone" : "System" }));
  });

/* ------------------------------- users ------------------------------- */

export const adminInviteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; displayName: string; roleId: string | null; origin: string }) => {
    const email = d.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("A valid email address is required");
    if (!d.displayName?.trim()) throw new Error("A name is required");
    return { ...d, email, displayName: d.displayName.trim() };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();

    const { data: invited, error } = await db.auth.admin.inviteUserByEmail(data.email, {
      data: { display_name: data.displayName },
      redirectTo: `${data.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
    const newId = invited?.user?.id;
    if (!newId) throw new Error("Could not create the account");

    await db.from("profiles").upsert({ id: newId, email: data.email, display_name: data.displayName });
    if (data.roleId) await db.from("user_roles").insert({ user_id: newId, role_id: data.roleId }).select();
    await db.from("invitations").insert({
      email: data.email,
      display_name: data.displayName,
      role_id: data.roleId,
      invited_by: context.userId,
      status: "invited",
    });
    await audit(context.userId, "user_invited", "user", newId, { email: data.email, role_id: data.roleId });
    return { id: newId };
  });

export const adminResendInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; origin: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { error } = await db.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: `${data.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
    await db
      .from("invitations")
      .update({
        last_sent_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
        status: "invited",
      })
      .eq("email", data.email);
    await audit(context.userId, "invitation_resent", "user", null, { email: data.email });
    return { ok: true };
  });

export const adminSetUserDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; disabled: boolean; force?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    if (data.disabled && (await countActiveAdmins(data.userId)) === 0 && !data.force) {
      const { data: isTargetAdmin } = await db.rpc("is_admin", { _user_id: data.userId });
      if (isTargetAdmin) throw new Error("LAST_ADMIN");
    }
    await db.auth.admin.updateUserById(data.userId, { ban_duration: data.disabled ? "876000h" : "none" });
    await db.from("profiles").update({ is_disabled: data.disabled }).eq("id", data.userId);
    await audit(context.userId, data.disabled ? "user_disabled" : "user_reactivated", "user", data.userId);
    return { ok: true };
  });

export const adminSetUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; roleIds: string[]; force?: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const { data: adminRoles } = await db.from("app_roles").select("id").eq("is_admin", true);
    const adminIds = new Set((adminRoles ?? []).map((r) => r.id));
    const keepsAdmin = data.roleIds.some((id) => adminIds.has(id));
    const { data: wasAdmin } = await db.rpc("is_admin", { _user_id: data.userId });
    if (wasAdmin && !keepsAdmin && (await countActiveAdmins(data.userId)) === 0 && !data.force) {
      throw new Error("LAST_ADMIN");
    }
    await db.from("user_roles").delete().eq("user_id", data.userId);
    if (data.roleIds.length) {
      const { error } = await db
        .from("user_roles")
        .insert(data.roleIds.map((role_id) => ({ user_id: data.userId, role_id })));
      if (error) throw new Error(error.message);
    }
    await audit(context.userId, "user_roles_changed", "user", data.userId, { role_ids: data.roleIds });
    return { ok: true };
  });

/* ------------------------------- roles ------------------------------- */

export const adminSaveRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    name: string;
    isActive?: boolean;
    permissions?: Partial<Record<
      "can_add_projects" | "can_edit_projects" | "can_delete_projects"
      | "can_add_photos" | "can_edit_photos" | "can_delete_photos", boolean>>;
  }) => {
    if (!d.name?.trim()) throw new Error("A role name is required");
    return { ...d, name: d.name.trim() };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const db = await admin();
    const keys = [
      "can_add_projects", "can_edit_projects", "can_delete_projects",
      "can_add_photos", "can_edit_photos", "can_delete_photos",
    ] as const;
    const perms: Record<string, boolean> = {};
    for (const k of keys) {
      const v = data.permissions?.[k];
      if (typeof v === "boolean") perms[k] = v;
    }
    if (data.id) {
      const { error } = await db
        .from("app_roles")
        .update({ name: data.name, ...(data.isActive === undefined ? {} : { is_active: data.isActive }), ...perms })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      await audit(context.userId, "role_updated", "role", data.id, { name: data.name, is_active: data.isActive, ...perms });
      return { ok: true };
    }
    const { data: created, error } = await db
      .from("app_roles")
      .insert({ name: data.name, is_active: true, is_admin: false, ...perms })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "role_created", "role", created.id, { name: data.name, ...perms });
    return { ok: true };
  });
