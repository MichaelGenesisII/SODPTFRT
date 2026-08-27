import {
  getSessionStudent,
  getStudentEnrolment,
  studentDisplayName,
} from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Safe, read-only snapshot for the signed-in student — never other users. */
export async function buildAssistantStudentContext(): Promise<string | null> {
  const profile = await getSessionStudent();
  if (!profile) return null;

  const lines = [
    `Signed-in student: ${studentDisplayName(profile)}.`,
    `Account: ${profile.account_kind === "alumni" ? "alumni portal" : "student portal"}.`,
  ];

  const enrolment = await getStudentEnrolment(profile.id);
  if (!enrolment) {
    lines.push("No enrolment record linked yet.");
    return lines.join("\n");
  }

  if (enrolment.parish_name) lines.push(`Parish: ${enrolment.parish_name}.`);
  if (enrolment.batch_label) {
    lines.push(`Batch: ${enrolment.batch_label}.`);
  }
  if (enrolment.cohort_label) {
    lines.push(`Cohort: ${enrolment.cohort_label}.`);
  }
  lines.push(`Application status: ${enrolment.status.replace(/_/g, " ")}.`);
  lines.push(`Payment status: ${enrolment.payment_status.replace(/_/g, " ")}.`);
  if (enrolment.reference_compact) {
    lines.push(`Payment reference: ${enrolment.reference_compact}.`);
  }
  if (enrolment.attendance_mode === "ignite") {
    lines.push("Programme: SOD Ignite.");
  } else if (enrolment.attendance_mode === "standard") {
    lines.push("Programme: Standard Program.");
  } else if (enrolment.attendance_mode) {
    lines.push(`Programme: ${enrolment.attendance_mode}.`);
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { count: openTickets } = await supabase
      .from("support_tickets")
      .select("id", { count: "exact", head: true })
      .eq("student_user_id", profile.id)
      .in("status", ["open", "pending"]);

    if (openTickets != null && openTickets > 0) {
      lines.push(
        `Open Support conversations: ${openTickets}. Suggest /student/support if they need staff.`,
      );
    }
  } catch {
    // Optional — do not fail the assistant.
  }

  return lines.join("\n");
}
