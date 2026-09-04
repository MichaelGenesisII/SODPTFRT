"use server";

import { revalidatePath } from "next/cache";
import {
  DEFAULT_ATTENDANCE_THRESHOLD,
  requiredSecondsForClass,
  type ClassAudience,
  type ZoomClass,
} from "@/lib/classes/types";
import {
  sessionDateFromStart,
  studentMatchesClassAudience,
  upsertClassAttendanceRow,
  writeAttendanceToStudentRecord,
} from "@/lib/classes/attendance";
import { listClassAudienceRecipients } from "@/lib/classes/recipients";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { requireSessionTeacher, getSessionTeacher } from "@/lib/teacher/auth";
import { getDeliveryForClass } from "@/lib/teacher/delivery";
import {
  isTeachingDeliveryStatus,
  TEACHING_DELIVERY_STATUS_META,
  type ClassTeachingDelivery,
  type TeachingDeliveryStatus,
} from "@/lib/teacher/types";

export type TeacherActionResult = {
  ok: boolean;
  message: string;
};

export type TeacherRegisterRow = {
  user_id: string;
  name: string;
  present: boolean;
  source: string | null;
};

export type TeacherClassDetail = {
  klass: ZoomClass;
  delivery: ClassTeachingDelivery | null;
  register: {
    attended: TeacherRegisterRow[];
    absent: TeacherRegisterRow[];
    expected_total: number;
  };
};

function unauthorized(): TeacherActionResult {
  return { ok: false, message: "Unauthorized." };
}

function fail(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): TeacherActionResult {
  console.error("[teacher/classes]", error);
  return { ok: false, message: publicActionMessage(error, fallback) };
}

async function requireAssignedClass(classId: string): Promise<
  | { ok: true; teacherId: string; klass: ZoomClass }
  | { ok: false; message: string }
> {
  let teacherId: string;
  try {
    const teacher = await requireSessionTeacher();
    teacherId = teacher.id;
  } catch {
    return { ok: false, message: "Unauthorized." };
  }

  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("zoom_classes")
    .select(
      "id, title, description, audience, parish_id, batch_id, cohort_id, year, programme_month, scheduled_start, scheduled_end, duration_minutes, attendance_threshold_percent, attendance_code, show_checkin_code_to_students, zoom_meeting_id, zoom_meeting_uuid, zoom_join_url, zoom_start_url, zoom_passcode, status, created_by, primary_teacher_id, last_synced_at, created_at, updated_at",
    )
    .eq("id", classId)
    .eq("primary_teacher_id", teacherId)
    .maybeSingle();

  if (error) {
    console.error("[teacher/class]", error.message);
    return {
      ok: false,
      message: "This class is temporarily unavailable. Please try again.",
    };
  }
  if (!data) {
    return { ok: false, message: "Class not found or not assigned to you." };
  }

  return { ok: true, teacherId, klass: data as ZoomClass };
}

export async function listTeacherClasses(): Promise<ZoomClass[]> {
  const teacher = await getSessionTeacher();
  if (!teacher) return [];

  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("zoom_classes")
    .select(
      "id, title, description, audience, parish_id, batch_id, cohort_id, year, programme_month, scheduled_start, scheduled_end, duration_minutes, attendance_threshold_percent, status, primary_teacher_id, zoom_join_url, zoom_passcode, created_at, updated_at, created_by, last_synced_at, zoom_meeting_id, zoom_meeting_uuid, zoom_start_url, attendance_code",
    )
    .eq("primary_teacher_id", teacher.id)
    .order("scheduled_start", { ascending: true });

  if (error) {
    console.error("[teacher/list]", error.message);
    throw new Error("Classes are temporarily unavailable.");
  }

  const classes = (data ?? []) as ZoomClass[];
  if (classes.length === 0) return classes;

  const ids = classes.map((c) => c.id);
  const { data: deliveries } = await service
    .from("class_teaching_deliveries")
    .select("class_id, status")
    .in("class_id", ids);

  const byClass = new Map(
    (deliveries ?? []).map((d) => [d.class_id as string, d.status as string]),
  );

  return classes.map((c) => ({
    ...c,
    teaching_delivery_status: byClass.get(c.id) ?? null,
  }));
}

export async function getTeacherClassDetail(
  classId: string,
): Promise<TeacherClassDetail | null> {
  const access = await requireAssignedClass(classId);
  if (!access.ok) return null;

  const { klass } = access;
  const service = createServiceSupabaseClient();
  const delivery = await getDeliveryForClass(classId);

  const recipients = await listClassAudienceRecipients({
    audience: (klass.audience as ClassAudience) || "everyone",
    parishId: klass.parish_id,
    batchId: klass.batch_id,
    cohortId: klass.cohort_id,
    year: klass.year,
  });

  const { data: attendanceRows } = await service
    .from("zoom_class_attendance")
    .select("user_id, present, source")
    .eq("class_id", classId);

  const attendanceByUser = new Map(
    (attendanceRows ?? [])
      .filter((r) => r.user_id)
      .map((r) => [
        r.user_id as string,
        {
          present: Boolean(r.present),
          source: (r.source as string) ?? null,
        },
      ]),
  );

  const attended: TeacherRegisterRow[] = [];
  const absent: TeacherRegisterRow[] = [];

  for (const recipient of recipients) {
    const att = attendanceByUser.get(recipient.id);
    const row: TeacherRegisterRow = {
      user_id: recipient.id,
      name: recipient.firstName?.trim() || "Student",
      present: att?.present ?? false,
      source: att?.source ?? null,
    };
    // Prefer fuller name if recipients only has firstName — keep as-is for GDPR min.
    if (row.present) attended.push(row);
    else absent.push(row);
  }

  // Enrich names from profiles (first + last only — no email/contact).
  const userIds = [...attended, ...absent].map((r) => r.user_id);
  if (userIds.length > 0) {
    const { data: profiles } = await service
      .from("student_profiles")
      .select("id, first_name, last_name")
      .in("id", userIds);
    const nameById = new Map(
      (profiles ?? []).map((p) => {
        const first = String(p.first_name ?? "").trim();
        const last = String(p.last_name ?? "").trim();
        const display =
          [first, last ? `${last.charAt(0)}.` : ""].filter(Boolean).join(" ") ||
          "Student";
        return [p.id as string, display];
      }),
    );
    for (const row of [...attended, ...absent]) {
      row.name = nameById.get(row.user_id) ?? row.name;
    }
  }

  return {
    klass: await enrichTeacherClassLabels(klass),
    delivery,
    register: {
      attended: sortRegister(attended),
      absent: sortRegister(absent),
      expected_total: recipients.length,
    },
  };
}

function sortRegister(rows: TeacherRegisterRow[]): TeacherRegisterRow[] {
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

async function enrichTeacherClassLabels(klass: ZoomClass): Promise<ZoomClass> {
  const service = createServiceSupabaseClient();
  let parish_name = klass.parish_name ?? null;
  let batch_name = klass.batch_name ?? null;
  let cohort_name = klass.cohort_name ?? null;

  const tasks: Promise<void>[] = [];
  if (klass.parish_id && !parish_name) {
    tasks.push(
      (async () => {
        const { data } = await service
          .from("parishes")
          .select("name")
          .eq("id", klass.parish_id)
          .maybeSingle();
        parish_name = data?.name ?? null;
      })(),
    );
  }
  if (klass.batch_id && !batch_name) {
    tasks.push(
      (async () => {
        const { data } = await service
          .from("batches")
          .select("name")
          .eq("id", klass.batch_id)
          .maybeSingle();
        batch_name = data?.name ?? null;
      })(),
    );
  }
  if (klass.cohort_id && !cohort_name) {
    tasks.push(
      (async () => {
        const { data } = await service
          .from("cohorts")
          .select("name")
          .eq("id", klass.cohort_id)
          .maybeSingle();
        cohort_name = data?.name ?? null;
      })(),
    );
  }
  if (tasks.length > 0) await Promise.all(tasks);

  return {
    ...klass,
    parish_name,
    batch_name,
    cohort_name,
  };
}

export async function markTeacherAttendance(input: {
  classId: string;
  userId: string;
  present: boolean;
}): Promise<TeacherActionResult> {
  const access = await requireAssignedClass(input.classId);
  if (!access.ok) return { ok: false, message: access.message };

  const { klass } = access;
  const service = createServiceSupabaseClient();

  const { data: profile } = await service
    .from("student_profiles")
    .select("id, email, is_active, first_name, last_name")
    .eq("id", input.userId)
    .maybeSingle();

  if (!profile?.is_active) {
    return { ok: false, message: "Student not found on this register." };
  }

  const { data: enrolment } = await service
    .from("enrolments")
    .select("parish_id, batch_id, cohort_id, cohorts(year_start)")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cohort = Array.isArray(enrolment?.cohorts)
    ? enrolment?.cohorts[0]
    : enrolment?.cohorts;

  if (
    !studentMatchesClassAudience({
      audience: (klass.audience as ClassAudience) || "everyone",
      classParishId: klass.parish_id,
      classBatchId: klass.batch_id,
      classCohortId: klass.cohort_id,
      classYear: klass.year,
      studentParishId: enrolment?.parish_id,
      studentBatchId: enrolment?.batch_id,
      studentCohortId: (enrolment?.cohort_id as string | null) ?? null,
      studentCohortYearStart: cohort?.year_start ?? null,
    })
  ) {
    return {
      ok: false,
      message: "That student is outside this class’s audience.",
    };
  }

  const required = requiredSecondsForClass(
    Number(klass.duration_minutes),
    Number(klass.attendance_threshold_percent) || DEFAULT_ATTENDANCE_THRESHOLD,
  );

  const saved = await upsertClassAttendanceRow({
    classId: input.classId,
    userId: input.userId,
    matchedEmail: profile.email,
    present: input.present,
    source: "manual",
    durationSeconds: input.present ? required : 0,
    requiredSeconds: required,
  });

  if (!saved.ok) return fail(saved.message, saved.message);

  await writeAttendanceToStudentRecord({
    userId: input.userId,
    sessionDate: sessionDateFromStart(klass.scheduled_start),
    label: klass.title,
    present: input.present,
    monthIndex: klass.programme_month ?? null,
  });

  revalidatePath("/teacher");
  revalidatePath("/teacher/classes");
  revalidatePath(`/teacher/classes/${input.classId}`);
  return {
    ok: true,
    message: input.present ? "Marked present." : "Marked absent.",
  };
}

export async function confirmTeacherDelivered(
  classId: string,
): Promise<TeacherActionResult> {
  const access = await requireAssignedClass(classId);
  if (!access.ok) return { ok: false, message: access.message };

  const service = createServiceSupabaseClient();
  const now = new Date().toISOString();

  const { data: delivery } = await service
    .from("class_teaching_deliveries")
    .select("id, status, teacher_id")
    .eq("class_id", classId)
    .maybeSingle();

  if (!delivery) {
    const { error: insertError } = await service
      .from("class_teaching_deliveries")
      .insert({
        class_id: classId,
        teacher_id: access.teacherId,
        status: "delivered" satisfies TeachingDeliveryStatus,
        confirmed_at: now,
        confirmed_by: access.teacherId,
        updated_at: now,
      });
    if (insertError) return fail(insertError);
  } else {
    if (delivery.teacher_id !== access.teacherId) {
      return { ok: false, message: "You are not credited for this class." };
    }
    if (delivery.status === "delivered" || delivery.status === "covered") {
      return { ok: true, message: "Already marked as taught." };
    }
    if (delivery.status === "cancelled" || delivery.status === "no_show") {
      return {
        ok: false,
        message: "This class was closed by the desk and cannot be confirmed.",
      };
    }
    const { error } = await service
      .from("class_teaching_deliveries")
      .update({
        status: "delivered",
        confirmed_at: now,
        confirmed_by: access.teacherId,
        updated_at: now,
      })
      .eq("id", delivery.id);
    if (error) return fail(error);
  }

  revalidatePath("/teacher");
  revalidatePath("/teacher/classes");
  revalidatePath(`/teacher/classes/${classId}`);
  revalidatePath("/teacher/history");
  return { ok: true, message: "Marked as taught. Thank you." };
}

export async function listTeacherHistory(): Promise<
  {
    class_id: string;
    title: string;
    scheduled_start: string;
    status: TeachingDeliveryStatus;
    status_label: string;
    confirmed_at: string | null;
  }[]
> {
  const teacher = await getSessionTeacher();
  if (!teacher) return [];

  const service = createServiceSupabaseClient();

  const { data, error } = await service
    .from("class_teaching_deliveries")
    .select(
      "class_id, status, confirmed_at, zoom_classes(title, scheduled_start)",
    )
    .eq("teacher_id", teacher.id)
    .order("confirmed_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("[teacher/history]", error.message);
    throw new Error("History is temporarily unavailable.");
  }

  return (data ?? []).map((row) => {
    const klass = Array.isArray(row.zoom_classes)
      ? row.zoom_classes[0]
      : row.zoom_classes;
    const status = isTeachingDeliveryStatus(String(row.status))
      ? (row.status as TeachingDeliveryStatus)
      : "scheduled";
    return {
      class_id: row.class_id as string,
      title: String(klass?.title ?? "Class"),
      scheduled_start: String(klass?.scheduled_start ?? ""),
      status,
      status_label: TEACHING_DELIVERY_STATUS_META[status].label,
      confirmed_at: (row.confirmed_at as string | null) ?? null,
    };
  });
}
