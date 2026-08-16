import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  StudentEnrolment,
  StudentProfile,
} from "@/lib/student/types";
import { formatBatchLabel } from "@/lib/parishes";
import { signStudentPhotoUrl } from "@/lib/student/photos";

export type {
  EnrolmentStatus,
  PaymentStatus,
  StudentEnrolment,
  StudentProfile,
} from "@/lib/student/types";
export { studentDisplayName } from "@/lib/student/types";

export async function getSessionStudent(): Promise<StudentProfile | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("student_profiles")
    .select(
      "id, email, first_name, middle_name, last_name, is_active, created_at, zoom_email, passport_path, passport_uploaded_at, graduation_selfie_path, graduation_selfie_uploaded_at, selfie_moderation_status, selfie_moderation_note, selfie_moderated_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;

  const passportUrl = await signStudentPhotoUrl(data.passport_path);
  return { ...(data as StudentProfile), passportUrl };
}

export async function requireSessionStudent(): Promise<StudentProfile> {
  const profile = await getSessionStudent();
  if (!profile) {
    throw new Error("Unauthorized");
  }
  return profile;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getStudentEnrolment(
  userId: string,
): Promise<StudentEnrolment | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("enrolments")
    .select(
      `id, user_id, reference, reference_compact, status, payment_status,
       attendance_mode, first_name, middle_name, last_name, email,
       mobile_number, address_line1, address_line2, town_city, county,
       postcode, country, local_church, church_leader, parish_id, batch_id,
       date_of_birth, nationality, created_at, updated_at,
       parishes(name), batches(name, year)`,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const parish = one(
    data.parishes as { name: string } | { name: string }[] | null,
  );
  const batch = one(
    data.batches as
      | { name: string; year: number }
      | { name: string; year: number }[]
      | null,
  );

  const {
    parishes: _p,
    batches: _b,
    ...row
  } = data as typeof data & {
    parishes?: unknown;
    batches?: unknown;
  };

  return {
    ...(row as Omit<StudentEnrolment, "parish_name" | "batch_label">),
    parish_name: parish?.name ?? null,
    batch_label: batch
      ? formatBatchLabel({ name: batch.name, year: batch.year })
      : null,
  };
}
