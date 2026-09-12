import type { StudentProfile } from "@/lib/student/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type ClaimClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function isTransientNetworkFailure(message: string): boolean {
  return /fetch failed|ECONNREFUSED|ENOTFOUND|network|timeout|socket/i.test(
    message,
  );
}

async function claimWith(
  client: ClaimClient,
  studentId: string,
  email: string,
): Promise<{ count: number; ok: boolean }> {
  const { data, error } = await client
    .from("support_tickets")
    .update({ user_id: studentId })
    .ilike("email", email)
    .is("user_id", null)
    .select("id");

  if (error) {
    if (
      process.env.NODE_ENV === "development" &&
      !isTransientNetworkFailure(error.message)
    ) {
      console.debug("claimTicketsByEmail:", error.message);
    }
    return { count: 0, ok: false };
  }

  return { count: data?.length ?? 0, ok: true };
}

/**
 * Link orphan public /support tickets to this student when the email matches.
 * Never steals tickets already owned by another user_id.
 */
export async function claimTicketsByEmail(student: StudentProfile): Promise<number> {
  const email = student.email.trim().toLowerCase();
  if (!email) return 0;

  try {
    const supabase = await createServerSupabaseClient();
    const sessionClaim = await claimWith(supabase, student.id, email);
    if (sessionClaim.ok) return sessionClaim.count;

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return 0;

    const service = createServiceSupabaseClient();
    const serviceClaim = await claimWith(service, student.id, email);
    return serviceClaim.count;
  } catch {
    return 0;
  }
}
