import type { StudentProfile } from "@/lib/student/types";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Link orphan public /support tickets to this student when the email matches.
 * Never steals tickets already owned by another user_id.
 */
export async function claimTicketsByEmail(student: StudentProfile): Promise<number> {
  const email = student.email.trim().toLowerCase();
  if (!email) return 0;

  try {
    const service = createServiceSupabaseClient();
    const { data, error } = await service
      .from("support_tickets")
      .update({ user_id: student.id })
      .ilike("email", email)
      .is("user_id", null)
      .select("id");

    if (error) {
      console.error("claimTicketsByEmail:", error.message);
      return 0;
    }
    return data?.length ?? 0;
  } catch (error) {
    console.error(
      "claimTicketsByEmail:",
      error instanceof Error ? error.message : error,
    );
    return 0;
  }
}
