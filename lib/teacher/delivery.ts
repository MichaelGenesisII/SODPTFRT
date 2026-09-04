import type {
  ClassTeachingDelivery,
  TeachingDeliveryStatus,
} from "@/lib/teacher/types";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/** Ensure a scheduled delivery row exists for the credited teacher. */
export async function upsertScheduledDelivery(input: {
  classId: string;
  teacherId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const service = createServiceSupabaseClient();
  const now = new Date().toISOString();

  const { data: existing } = await service
    .from("class_teaching_deliveries")
    .select("id, status, teacher_id")
    .eq("class_id", input.classId)
    .maybeSingle();

  if (!existing) {
    const { error } = await service.from("class_teaching_deliveries").insert({
      class_id: input.classId,
      teacher_id: input.teacherId,
      status: "scheduled" satisfies TeachingDeliveryStatus,
      updated_at: now,
    });
    if (error) {
      console.error("[teaching-delivery] insert", error.message);
      return { ok: false, message: error.message };
    }
    return { ok: true };
  }

  // Reassign teacher only while still scheduled (don't rewrite confirmed pay history).
  if (existing.status === "scheduled" && existing.teacher_id !== input.teacherId) {
    const { error } = await service
      .from("class_teaching_deliveries")
      .update({
        teacher_id: input.teacherId,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (error) {
      console.error("[teaching-delivery] reassign", error.message);
      return { ok: false, message: error.message };
    }
  }

  return { ok: true };
}

export async function clearDeliveryIfScheduled(
  classId: string,
): Promise<void> {
  const service = createServiceSupabaseClient();
  await service
    .from("class_teaching_deliveries")
    .delete()
    .eq("class_id", classId)
    .eq("status", "scheduled");
}

export async function getDeliveryForClass(
  classId: string,
): Promise<ClassTeachingDelivery | null> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("class_teaching_deliveries")
    .select(
      "id, class_id, teacher_id, status, confirmed_at, confirmed_by, notes, created_at, updated_at",
    )
    .eq("class_id", classId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ClassTeachingDelivery;
}
