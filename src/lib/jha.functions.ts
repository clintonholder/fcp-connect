import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateJhaSubmission } from "@/lib/jha";
import { assertManageSafety } from "@/lib/safety.functions";

function requireId(id: unknown, what: string): string {
  if (typeof id !== "string" || !id) throw new Error(`Missing ${what}`);
  return id;
}

function requirePrompt(prompt: unknown): string {
  const p = typeof prompt === "string" ? prompt.trim() : "";
  if (!p) throw new Error("Enter the hazard item text");
  return p;
}

export const submitJha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      jobId: string;
      answers: { templateId: string; answer: string }[];
      signature: string;
    }) => ({
      jobId: requireId(d?.jobId, "project"),
      answers: Array.isArray(d?.answers) ? d.answers : [],
      signature: d?.signature,
    }),
  )
  .handler(async ({ data, context }) => {
    const { data: templates, error: tErr } = await context.supabase
      .from("jha_templates")
      .select("id, prompt, position, created_at");
    if (tErr) throw new Error(tErr.message);
    const checked = validateJhaSubmission(templates ?? [], data.answers, data.signature);

    const { data: pending, error: pErr } = await context.supabase
      .from("jha_records")
      .select("id")
      .eq("job_id", data.jobId)
      .is("completed_at", null)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);

    if (pending) {
      const { error } = await context.supabase
        .from("jha_records")
        .update({ answers: checked.answers, signature: checked.signature })
        .eq("id", pending.id);
      if (error) throw new Error(error.message);
      return { id: pending.id };
    }
    const { data: row, error } = await context.supabase
      .from("jha_records")
      .insert({ job_id: data.jobId, answers: checked.answers, signature: checked.signature })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const requestNewJha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string }) => ({ jobId: requireId(d?.jobId, "project") }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("jha_records")
      .insert({ job_id: data.jobId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const createJhaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string }) => ({ prompt: requirePrompt(d?.prompt) }))
  .handler(async ({ data, context }) => {
    await assertManageSafety(context);
    const { data: last, error: lErr } = await context.supabase
      .from("jha_templates")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lErr) throw new Error(lErr.message);
    const { data: row, error } = await context.supabase
      .from("jha_templates")
      .insert({ prompt: data.prompt, position: (last?.position ?? 0) + 1 })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateJhaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; prompt: string }) => ({
    id: requireId(d?.id, "hazard item"),
    prompt: requirePrompt(d?.prompt),
  }))
  .handler(async ({ data, context }) => {
    await assertManageSafety(context);
    const { data: updated, error } = await context.supabase
      .from("jha_templates")
      .update({ prompt: data.prompt })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("This hazard item no longer exists");
    return { id: data.id };
  });

export const deleteJhaTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: requireId(d?.id, "hazard item") }))
  .handler(async ({ data, context }) => {
    await assertManageSafety(context);
    const { error } = await context.supabase.from("jha_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
