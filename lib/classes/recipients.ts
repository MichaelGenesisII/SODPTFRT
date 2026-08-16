import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { ClassAudience } from "@/lib/classes/types";

export type ClassInviteRecipient = {
  id: string;
  email: string;
  firstName: string;
};

export async function listClassAudienceRecipients(input: {
  audience: ClassAudience;
  parishId: string | null;
  batchId: string | null;
}): Promise<ClassInviteRecipient[]> {
  const service = createServiceSupabaseClient();

  if (input.audience === "everyone") {
    const { data } = await service
      .from("student_profiles")
      .select("id, email, first_name")
      .eq("is_active", true)
      .limit(2500);
    return (data ?? []).map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.first_name || "friend",
    }));
  }

  let enrolmentQuery = service
    .from("enrolments")
    .select("user_id, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (input.audience === "parish" && input.parishId) {
    enrolmentQuery = enrolmentQuery.eq("parish_id", input.parishId);
  } else if (input.audience === "batch" && input.batchId) {
    enrolmentQuery = enrolmentQuery.eq("batch_id", input.batchId);
  } else {
    return [];
  }

  const { data: enrolments } = await enrolmentQuery;
  const userIds = [
    ...new Set((enrolments ?? []).map((e) => e.user_id).filter(Boolean)),
  ] as string[];
  if (!userIds.length) return [];

  const { data: profiles } = await service
    .from("student_profiles")
    .select("id, email, first_name")
    .eq("is_active", true)
    .in("id", userIds);

  return (profiles ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    firstName: row.first_name || "friend",
  }));
}
