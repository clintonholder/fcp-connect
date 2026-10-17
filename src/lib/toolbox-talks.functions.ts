import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertManageSafety } from "@/lib/safety.functions";
import { validateAttendees, validateTopic } from "@/lib/toolbox-talks";

function requireId(id: unknown, what: string): string {
  if (typeof id !== "string" || !id) throw new Error(`Missing ${what}`);
  return id;
}

export const startToolboxTalk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { jobId: string; topicId: string; talkDate: string }) => {
    if (typeof d?.talkDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d.talkDate)) {
      throw new Error("Choose a valid date");
    }
    return {
      jobId: requireId(d?.jobId, "project"),
      topicId: requireId(d?.topicId, "topic"),
      talkDate: d.talkDate,
    };
  })
  .handler(async ({ data, context }) => {
    // topic_title is overwritten from the topic by the toolbox_talk_guard trigger.
    const { data: row, error } = await context.supabase
      .from("toolbox_talks")
      .insert({
        job_id: data.jobId,
        topic_id: data.topicId,
        topic_title: "",
        talk_date: data.talkDate,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const completeToolboxTalk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { talkId: string; attendees: unknown; notes: string | null }) => {
    const notes = typeof d?.notes === "string" ? d.notes.trim() : "";
    if (notes.length > 5000) throw new Error("Notes must be 5000 characters or fewer");
    return {
      talkId: requireId(d?.talkId, "talk"),
      attendees: validateAttendees(d?.attendees),
      notes: notes || null,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("toolbox_talks")
      .update({ attendees: data.attendees, notes: data.notes })
      .eq("id", data.talkId)
      .is("completed_at", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) {
      throw new Error("This talk is already completed or no longer available");
    }
    return { id: data.talkId };
  });

export const createToolboxTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; body: string | null }) =>
    validateTopic({ title: d?.title, body: d?.body }),
  )
  .handler(async ({ data, context }) => {
    await assertManageSafety(context);
    const { data: row, error } = await context.supabase
      .from("toolbox_talk_topics")
      .insert({ title: data.title, body: data.body })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const updateToolboxTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; title: string; body: string | null }) => ({
    id: requireId(d?.id, "topic"),
    ...validateTopic({ title: d?.title, body: d?.body }),
  }))
  .handler(async ({ data, context }) => {
    await assertManageSafety(context);
    const { data: updated, error } = await context.supabase
      .from("toolbox_talk_topics")
      .update({ title: data.title, body: data.body })
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated?.length) throw new Error("This topic no longer exists");
    return { id: data.id };
  });

export const deleteToolboxTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: requireId(d?.id, "topic") }))
  .handler(async ({ data, context }) => {
    await assertManageSafety(context);
    const { error } = await context.supabase.from("toolbox_talk_topics").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
