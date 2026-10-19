import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  friendlyDbError,
  inUseMessage,
  isDuplicateName,
  requireId,
  validateCrew,
  validateCrewMember,
  validateName,
} from "@/lib/national-paint-people";
import { NP_STATUSES } from "@/lib/national-paint-import";
import { validateProject } from "@/lib/national-paint-projects";

const STATUSES = ["Potential", "Verbal Award", "Upcoming", "Scheduled", "In Progress", "Completed"];
const MAX_PROJECTS = 5000;

type Str = string | null;
type ImportInput = {
  fileName: string;
  budgetYear: number;
  duplicateCrewCount: number;
  skippedRowCount: number;
  payload: {
    budget_year: number;
    pms: { name: string }[];
    contractors: { name: string }[];
    crews: {
      name: string;
      contractor: Str;
      owner_name: Str;
      crew_type: Str;
      size: number | null;
    }[];
    projects: {
      cmic_job_number: Str;
      name: string;
      address: Str;
      city: Str;
      state: Str;
      pm: Str;
      contractor: Str;
      crew: Str;
      status: string;
      progress: number | null;
      est_start: Str;
      est_end: Str;
      deadline: Str;
      est_revenue: number | null;
      notes: Str;
      tag: Str;
      exclude_revenue: boolean;
      bonus_eligible: boolean;
    }[];
    budget: { month: number; amount: number }[];
  };
};

function validateInput(d: ImportInput): ImportInput {
  const p = d?.payload;
  if (!p || typeof d.fileName !== "string") throw new Error("Missing import data");
  if (!Number.isInteger(d.budgetYear) || p.budget_year !== d.budgetYear) {
    throw new Error("Invalid budget year");
  }
  if (!Array.isArray(p.pms) || !Array.isArray(p.contractors) || !Array.isArray(p.crews)) {
    throw new Error("Invalid import data");
  }
  if (!Array.isArray(p.projects) || !Array.isArray(p.budget))
    throw new Error("Invalid import data");
  if (p.projects.length > MAX_PROJECTS)
    throw new Error(`At most ${MAX_PROJECTS} projects can be imported`);
  if (
    [...p.pms, ...p.contractors, ...p.crews, ...p.projects].some(
      (r) => typeof r?.name !== "string" || !r.name.trim(),
    )
  ) {
    throw new Error("Every row needs a name");
  }
  if (p.projects.some((r) => !STATUSES.includes(r.status)))
    throw new Error("Invalid project status");
  if (
    p.budget.some(
      (b) =>
        !Number.isInteger(b.month) || b.month < 1 || b.month > 12 || !Number.isFinite(b.amount),
    )
  ) {
    throw new Error("Invalid budget month");
  }
  return d;
}

/** Replaces all National Paint data from a workbook parsed in the browser. Admins only. */
export const importNationalPaintWorkbook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateInput)
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: adminError } = await context.supabase.rpc("is_admin", {
      _user_id: context.userId,
    });
    if (adminError || isAdmin !== true) throw new Error("Forbidden: administrators only");

    const { data: counts, error } = await context.supabase.rpc("np_import_workbook", {
      _payload: data.payload as never,
    });
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      action: "national_paint_imported",
      target_type: "national_paint",
      target_id: null,
      details: {
        file_name: data.fileName,
        budget_year: data.budgetYear,
        inserted: counts,
        duplicate_crews: data.duplicateCrewCount,
        skipped_rows: data.skippedRowCount,
      } as never,
    });
    return counts as {
      pms: number;
      contractors: number;
      crews: number;
      projects: number;
      budget_months: number;
    };
  });

type Ctx = { supabase: SupabaseClient<Database>; userId: string };

/** Throws unless the caller has manage_national_paint. Writes below also run under the caller's RLS. */
async function assertManageNationalPaint(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_perm", {
    _user_id: context.userId,
    _perm: "manage_national_paint",
  });
  if (error || data !== true) throw new Error("Forbidden: you cannot manage National Paint");
}

async function audit(
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_log").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details as never,
  });
}

async function assertNameFree(
  context: Ctx,
  table: "np_pms" | "np_contractors",
  label: string,
  name: string,
  id?: string,
) {
  const { data, error } = await context.supabase.from(table).select("id, name");
  if (error) throw new Error(error.message);
  if (isDuplicateName(name, data ?? [], id)) {
    throw new Error(`A ${label} named ${name} already exists`);
  }
}

async function countProjects(
  context: Ctx,
  column: "pm_id" | "contractor_id" | "crew_id",
  id: string,
) {
  const { count, error } = await context.supabase
    .from("np_projects")
    .select("id", { count: "exact", head: true })
    .eq(column, id);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countCrews(context: Ctx, contractorId: string) {
  const { count, error } = await context.supabase
    .from("np_crews")
    .select("id", { count: "exact", head: true })
    .eq("contractor_id", contractorId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

const validateNew = (d: { name: string }) => ({ name: validateName(d?.name) });
const validateRename = (d: { id: string; name: string }) => ({
  id: requireId(d?.id, "record"),
  name: validateName(d?.name),
});
const validateDelete = (d: { id: string }) => ({ id: requireId(d?.id, "record") });

const usedByProjects = "Used by projects. Reassign them before deleting.";

// ---- PMs ----

export const createNpPm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateNew)
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    await assertNameFree(context, "np_pms", "PM", data.name);
    const { data: row, error } = await context.supabase
      .from("np_pms")
      .insert({ name: data.name })
      .select("id, name")
      .single();
    if (error) {
      throw friendlyDbError(error, `A PM named ${data.name} already exists`, error.message);
    }
    await audit(context.userId, "national_paint_pm_created", "np_pm", row.id, { name: row.name });
    return { id: row.id };
  });

export const updateNpPm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRename)
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    await assertNameFree(context, "np_pms", "PM", data.name, data.id);
    const { data: rows, error } = await context.supabase
      .from("np_pms")
      .update({ name: data.name })
      .eq("id", data.id)
      .select("id");
    if (error) {
      throw friendlyDbError(error, `A PM named ${data.name} already exists`, error.message);
    }
    if (!rows?.length) throw new Error("This PM no longer exists");
    await audit(context.userId, "national_paint_pm_updated", "np_pm", data.id, {
      name: data.name,
    });
    return { id: data.id };
  });

export const deleteNpPm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateDelete)
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    const inUse = inUseMessage(await countProjects(context, "pm_id", data.id));
    if (inUse) throw new Error(inUse);
    const { data: rows, error } = await context.supabase
      .from("np_pms")
      .delete()
      .eq("id", data.id)
      .select("id, name");
    if (error) throw friendlyDbError(error, error.message, usedByProjects);
    if (!rows?.length) throw new Error("This PM no longer exists");
    await audit(context.userId, "national_paint_pm_deleted", "np_pm", data.id, {
      name: rows[0].name,
    });
    return { id: data.id };
  });

// ---- Contractors ----

export const createNpContractor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateNew)
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    await assertNameFree(context, "np_contractors", "contractor", data.name);
    const { data: row, error } = await context.supabase
      .from("np_contractors")
      .insert({ name: data.name })
      .select("id, name")
      .single();
    if (error) {
      throw friendlyDbError(error, `A contractor named ${data.name} already exists`, error.message);
    }
    await audit(context.userId, "national_paint_contractor_created", "np_contractor", row.id, {
      name: row.name,
    });
    return { id: row.id };
  });

export const updateNpContractor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateRename)
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    await assertNameFree(context, "np_contractors", "contractor", data.name, data.id);
    const { data: rows, error } = await context.supabase
      .from("np_contractors")
      .update({ name: data.name })
      .eq("id", data.id)
      .select("id");
    if (error) {
      throw friendlyDbError(error, `A contractor named ${data.name} already exists`, error.message);
    }
    if (!rows?.length) throw new Error("This contractor no longer exists");
    await audit(context.userId, "national_paint_contractor_updated", "np_contractor", data.id, {
      name: data.name,
    });
    return { id: data.id };
  });

export const deleteNpContractor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateDelete)
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    const projects = await countProjects(context, "contractor_id", data.id);
    const crews = await countCrews(context, data.id);
    const inUse = inUseMessage(projects, crews);
    if (inUse) throw new Error(inUse);
    const { data: rows, error } = await context.supabase
      .from("np_contractors")
      .delete()
      .eq("id", data.id)
      .select("id, name");
    if (error) {
      throw friendlyDbError(
        error,
        error.message,
        "Used by projects or crews. Reassign them first.",
      );
    }
    if (!rows?.length) throw new Error("This contractor no longer exists");
    await audit(context.userId, "national_paint_contractor_deleted", "np_contractor", data.id, {
      name: rows[0].name,
    });
    return { id: data.id };
  });

// ---- Crews ----

const crewDuplicate = "A crew with this name already exists for this contractor";
const crewBadContractor = "Choose an existing contractor";

export const createNpCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Parameters<typeof validateCrew>[0]) => validateCrew(d))
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    const { data: row, error } = await context.supabase
      .from("np_crews")
      .insert(data)
      .select("id")
      .single();
    if (error) throw friendlyDbError(error, crewDuplicate, crewBadContractor);
    await audit(context.userId, "national_paint_crew_created", "np_crew", row.id, data);
    return { id: row.id };
  });

export const updateNpCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & Parameters<typeof validateCrew>[0]) => ({
    id: requireId(d?.id, "crew"),
    fields: validateCrew(d),
  }))
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    const { data: rows, error } = await context.supabase
      .from("np_crews")
      .update(data.fields)
      .eq("id", data.id)
      .select("id");
    if (error) throw friendlyDbError(error, crewDuplicate, crewBadContractor);
    if (!rows?.length) throw new Error("This crew no longer exists");
    await audit(context.userId, "national_paint_crew_updated", "np_crew", data.id, data.fields);
    return { id: data.id };
  });

export const deleteNpCrew = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateDelete)
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    const inUse = inUseMessage(await countProjects(context, "crew_id", data.id));
    if (inUse) throw new Error(inUse);
    const { data: rows, error } = await context.supabase
      .from("np_crews")
      .delete()
      .eq("id", data.id)
      .select("id, name");
    if (error) throw friendlyDbError(error, error.message, usedByProjects);
    if (!rows?.length) throw new Error("This crew no longer exists");
    await audit(context.userId, "national_paint_crew_deleted", "np_crew", data.id, {
      name: rows[0].name,
    });
    return { id: data.id };
  });

// ---- Crew members ----

export const createNpCrewMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { crewId: string } & Parameters<typeof validateCrewMember>[0]) => ({
    crewId: requireId(d?.crewId, "crew"),
    ...validateCrewMember(d),
  }))
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    const { data: row, error } = await context.supabase
      .from("np_crew_members")
      .insert({ crew_id: data.crewId, name: data.name, role: data.role })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await audit(context.userId, "national_paint_crew_member_created", "np_crew_member", row.id, {
      crew_id: data.crewId,
      name: data.name,
      role: data.role,
    });
    return { id: row.id };
  });

export const updateNpCrewMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & Parameters<typeof validateCrewMember>[0]) => ({
    id: requireId(d?.id, "crew member"),
    ...validateCrewMember(d),
  }))
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    const { data: rows, error } = await context.supabase
      .from("np_crew_members")
      .update({ name: data.name, role: data.role })
      .eq("id", data.id)
      .select("id, crew_id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("This crew member no longer exists");
    await audit(context.userId, "national_paint_crew_member_updated", "np_crew_member", data.id, {
      crew_id: rows[0].crew_id,
      name: data.name,
      role: data.role,
    });
    return { id: data.id };
  });

export const deleteNpCrewMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateDelete)
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    const { data: rows, error } = await context.supabase
      .from("np_crew_members")
      .delete()
      .eq("id", data.id)
      .select("id, crew_id, name");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error("This crew member no longer exists");
    await audit(context.userId, "national_paint_crew_member_deleted", "np_crew_member", data.id, {
      crew_id: rows[0].crew_id,
      name: rows[0].name,
    });
    return { id: data.id };
  });

// ---- Projects ----

const projectGone = "This project no longer exists";
const projectBadRef = "Choose an existing PM, contractor and crew";

/** The crew must exist and belong to the submitted contractor. */
async function assertCrewMatchesContractor(
  context: Ctx,
  crewId: string | null,
  contractorId: string | null,
) {
  if (!crewId) return;
  const { data, error } = await context.supabase
    .from("np_crews")
    .select("contractor_id")
    .eq("id", crewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.contractor_id !== contractorId) {
    throw new Error("Choose a crew assigned to the selected contractor");
  }
}

export const createNpProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Parameters<typeof validateProject>[0]) => validateProject(d))
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    await assertCrewMatchesContractor(context, data.crew_id, data.contractor_id);
    const { data: row, error } = await context.supabase
      .from("np_projects")
      .insert(data)
      .select("id")
      .single();
    if (error) throw friendlyDbError(error, error.message, projectBadRef);
    await audit(context.userId, "national_paint_project_created", "np_project", row.id, {
      ...data,
    });
    return { id: row.id };
  });

export const updateNpProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & Parameters<typeof validateProject>[0]) => ({
    id: requireId(d?.id, "project"),
    fields: validateProject(d),
  }))
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    await assertCrewMatchesContractor(context, data.fields.crew_id, data.fields.contractor_id);
    const { data: rows, error } = await context.supabase
      .from("np_projects")
      .update(data.fields)
      .eq("id", data.id)
      .select("id");
    if (error) throw friendlyDbError(error, error.message, projectBadRef);
    if (!rows?.length) throw new Error(projectGone);
    await audit(context.userId, "national_paint_project_updated", "np_project", data.id, {
      ...data.fields,
    });
    return { id: data.id };
  });

export const deleteNpProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateDelete)
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    const { data: rows, error } = await context.supabase
      .from("np_projects")
      .delete()
      .eq("id", data.id)
      .select("id, name");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error(projectGone);
    await audit(context.userId, "national_paint_project_deleted", "np_project", data.id, {
      name: rows[0].name,
    });
    return { id: data.id };
  });

export const setNpProjectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string }) => {
    const status = NP_STATUSES.find((s) => s === d?.status);
    if (!status) throw new Error("Invalid status");
    return { id: requireId(d?.id, "project"), status };
  })
  .handler(async ({ data, context }) => {
    await assertManageNationalPaint(context);
    const { data: current, error: readError } = await context.supabase
      .from("np_projects")
      .select("name, status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error(projectGone);
    if (current.status === data.status) return { id: data.id };
    const { data: rows, error } = await context.supabase
      .from("np_projects")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows?.length) throw new Error(projectGone);
    await audit(context.userId, "national_paint_project_status_changed", "np_project", data.id, {
      name: current.name,
      from: current.status,
      to: data.status,
    });
    return { id: data.id };
  });
