import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { AttendanceSource, ClassAudience } from "@/lib/classes/types";

export async function ensureStudentRecordId(
  userId: string,
): Promise<string | null> {
  const supabase = createServiceSupabaseClient();
  const { data: enrolment } = await supabase
    .from("enrolments")
    .select("id, parish_id, batch_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("student_records")
    .select("id, batch_id, parish_id, enrolment_id")
    .eq("user_id", userId);

  const match = (existing ?? []).find(
    (r) => (r.batch_id ?? null) === (enrolment?.batch_id ?? null),
  );
  if (match) {
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    let dirty = false;
    if (
      enrolment?.parish_id &&
      (match.parish_id ?? null) !== enrolment.parish_id
    ) {
      patch.parish_id = enrolment.parish_id;
      dirty = true;
    }
    if (enrolment?.id && match.enrolment_id !== enrolment.id) {
      patch.enrolment_id = enrolment.id;
      dirty = true;
    }
    if (dirty) {
      await supabase.from("student_records").update(patch).eq("id", match.id);
    }
    return match.id;
  }

  const { data, error } = await supabase
    .from("student_records")
    .insert({
      user_id: userId,
      enrolment_id: enrolment?.id ?? null,
      parish_id: enrolment?.parish_id ?? null,
      batch_id: enrolment?.batch_id ?? null,
      enrolled_at: enrolment?.created_at
        ? String(enrolment.created_at).slice(0, 10)
        : null,
    })
    .select("id")
    .single();

  if (error) return null;
  return data.id;
}

/** Writes attendance into the student's Records scorecard for that session date. */
export async function writeAttendanceToStudentRecord(input: {
  userId: string;
  sessionDate: string;
  label: string;
  present: boolean;
}): Promise<boolean> {
  const recordId = await ensureStudentRecordId(input.userId);
  if (!recordId) return false;

  const supabase = createServiceSupabaseClient();
  const label = input.label.trim() || "Session";
  const { error } = await supabase.from("student_record_sessions").upsert(
    {
      record_id: recordId,
      session_date: input.sessionDate,
      label,
      present: input.present,
    },
    { onConflict: "record_id,session_date,label" },
  );

  if (error) {
    console.error("class attendance → records:", error.message);
    return false;
  }
  return true;
}

export async function upsertClassAttendanceRow(input: {
  classId: string;
  userId: string;
  matchedEmail: string;
  present: boolean;
  source: AttendanceSource;
  durationSeconds?: number;
  requiredSeconds?: number;
  zoomDisplayName?: string | null;
  joinTime?: string | null;
  leaveTime?: string | null;
  raw?: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = createServiceSupabaseClient();
  const email = input.matchedEmail.trim().toLowerCase();

  const { data: byUser } = await supabase
    .from("zoom_class_attendance")
    .select("id")
    .eq("class_id", input.classId)
    .eq("user_id", input.userId)
    .maybeSingle();

  const payload = {
    class_id: input.classId,
    user_id: input.userId,
    matched_email: email,
    zoom_display_name: input.zoomDisplayName ?? null,
    duration_seconds: input.durationSeconds ?? 0,
    required_seconds: input.requiredSeconds ?? 0,
    present: input.present,
    join_time: input.joinTime ?? null,
    leave_time: input.leaveTime ?? null,
    synced_at: new Date().toISOString(),
    source: input.source,
    raw: input.raw ?? {},
  };

  if (byUser) {
    const { error } = await supabase
      .from("zoom_class_attendance")
      .update(payload)
      .eq("id", byUser.id);
    if (error) {
      console.error("class attendance:", error.message);
      return {
        ok: false,
        message: "Could not save attendance. Please try again.",
      };
    }
    return { ok: true };
  }

  const { error } = await supabase
    .from("zoom_class_attendance")
    .upsert(payload, { onConflict: "class_id,matched_email" });

  if (error) {
    console.error("class attendance:", error.message);
    return {
      ok: false,
      message: "Could not save attendance. Please try again.",
    };
  }
  return { ok: true };
}

export function generateAttendanceCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/** Calendar date in Europe/London (matches invite “when” labels). */
export function sessionDateFromStart(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function studentMatchesClassAudience(input: {
  audience: ClassAudience;
  classParishId: string | null;
  classBatchId: string | null;
  classCohortId?: string | null;
  classYear?: number | null;
  studentParishId: string | null | undefined;
  studentBatchId: string | null | undefined;
  studentCohortId?: string | null | undefined;
  studentCohortYearStart?: number | null | undefined;
}): boolean {
  if (input.audience === "everyone") return true;
  if (input.audience === "parish") {
    return Boolean(
      input.classParishId && input.studentParishId === input.classParishId,
    );
  }
  if (input.audience === "cohort") {
    return Boolean(
      input.classCohortId && input.studentCohortId === input.classCohortId,
    );
  }
  if (input.audience === "year") {
    return Boolean(
      input.classYear != null &&
        input.studentCohortYearStart === input.classYear,
    );
  }
  return Boolean(
    input.classBatchId && input.studentBatchId === input.classBatchId,
  );
}
