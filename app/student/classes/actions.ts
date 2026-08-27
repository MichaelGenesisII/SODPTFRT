"use server";

import { revalidatePath } from "next/cache";
import {
  sessionDateFromStart,
  studentMatchesClassAudience,
  upsertClassAttendanceRow,
  writeAttendanceToStudentRecord,
} from "@/lib/classes/attendance";
import type {
  ClassAudience,
  ZoomClass,
  ZoomClassAttendance,
} from "@/lib/classes/types";
import { publicActionMessage } from "@/lib/safe-action-message";
import {
  getSessionStudent,
  requireSessionStudent,
} from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  createMeetingSdkSignature,
  meetingSdkConfigured,
} from "@/lib/zoom/sdk";
import type { InPortalZoomSession } from "@/lib/zoom/types";

export type StudentClassActionResult = {
  ok: boolean;
  message: string;
};

function fail(error: unknown, fallback?: string): { ok: false; message: string } {
  return { ok: false, message: publicActionMessage(error, fallback) };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function updateStudentZoomEmail(
  zoomEmail: string,
): Promise<StudentClassActionResult> {
  let profile;
  try {
    profile = await requireSessionStudent();
  } catch {
    return { ok: false, message: "Unauthorized." };
  }

  const raw = zoomEmail.trim();
  const normalized = raw ? normalizeEmail(raw) : null;

  if (normalized) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return { ok: false, message: "Enter a valid email address." };
    }
  }

  const supabase = await createServerSupabaseClient();

  if (normalized) {
    const [{ data: byEmail }, { data: byZoom }] = await Promise.all([
      supabase
        .from("student_profiles")
        .select("id")
        .neq("id", profile.id)
        .eq("email", normalized)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("student_profiles")
        .select("id")
        .neq("id", profile.id)
        .eq("zoom_email", normalized)
        .limit(1)
        .maybeSingle(),
    ]);

    if (byEmail || byZoom) {
      return {
        ok: false,
        message: "That email is already used by another student.",
      };
    }
  }

  const { error } = await supabase
    .from("student_profiles")
    .update({ zoom_email: normalized })
    .eq("id", profile.id);

  if (error) {
    console.error("student zoom email:", error.message);
    if (/unique|already|23505/i.test(error.message)) {
      return {
        ok: false,
        message: "That email is already used by another student.",
      };
    }
    return fail(error);
  }

  revalidatePath("/student/classes");
  revalidatePath("/student");
  return {
    ok: true,
    message: normalized
      ? "Zoom seat email saved."
      : "Zoom seat email cleared — we’ll match your registration email only.",
  };
}

async function studentEnrolment(userId: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("enrolments")
    .select("parish_id, batch_id, cohort_id, cohorts(year_start)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const cohort = Array.isArray(data.cohorts) ? data.cohorts[0] : data.cohorts;
  return {
    parish_id: data.parish_id as string | null,
    batch_id: data.batch_id as string | null,
    cohort_id: (data.cohort_id as string | null) ?? null,
    cohort_year_start: cohort?.year_start ?? null,
  };
}

function matchesStudentAudience(
  klass: {
    audience?: ClassAudience | null;
    parish_id?: string | null;
    batch_id?: string | null;
    cohort_id?: string | null;
    year?: number | null;
  },
  enrolment: Awaited<ReturnType<typeof studentEnrolment>>,
) {
  return studentMatchesClassAudience({
    audience: (klass.audience as ClassAudience) || "everyone",
    classParishId: klass.parish_id ?? null,
    classBatchId: klass.batch_id ?? null,
    classCohortId: klass.cohort_id ?? null,
    classYear: klass.year ?? null,
    studentParishId: enrolment?.parish_id,
    studentBatchId: enrolment?.batch_id,
    studentCohortId: enrolment?.cohort_id,
    studentCohortYearStart: enrolment?.cohort_year_start,
  });
}

function mapStudentClass(row: Record<string, unknown>): ZoomClass {
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    audience: (row.audience as ClassAudience) || "everyone",
    parish_id: (row.parish_id as string | null) ?? null,
    batch_id: (row.batch_id as string | null) ?? null,
    cohort_id: (row.cohort_id as string | null) ?? null,
    year: row.year != null ? Number(row.year) : null,
    programme_month:
      row.programme_month != null ? Number(row.programme_month) : null,
    scheduled_start: row.scheduled_start as string,
    scheduled_end: row.scheduled_end as string,
    duration_minutes: Number(row.duration_minutes),
    attendance_threshold_percent: Number(row.attendance_threshold_percent),
    attendance_code: null,
    zoom_meeting_id: (row.zoom_meeting_id as string | null) ?? null,
    zoom_meeting_uuid: (row.zoom_meeting_uuid as string | null) ?? null,
    zoom_join_url: (row.zoom_join_url as string | null) ?? null,
    zoom_start_url: null,
    zoom_passcode: (row.zoom_passcode as string | null) ?? null,
    status: row.status as ZoomClass["status"],
    created_by: (row.created_by as string | null) ?? null,
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    parish_name: (row.parish_name as string | null) ?? null,
    batch_name: (row.batch_name as string | null) ?? null,
    batch_year:
      row.batch_year != null ? Number(row.batch_year) : null,
    cohort_name: (row.cohort_name as string | null) ?? null,
  };
}

/**
 * Student-facing class list. Prefers zoom_classes_student view (no secrets).
 * Falls back to base table + app filter if the view is not applied yet.
 */
export async function listStudentClasses(): Promise<ZoomClass[]> {
  const profile = await getSessionStudent();
  if (!profile) return [];

  const enrolment = await studentEnrolment(profile.id);
  const supabase = await createServerSupabaseClient();

  const { data: fromView, error: viewError } = await supabase
    .from("zoom_classes_student")
    .select("*")
    .order("scheduled_start", { ascending: true })
    .limit(80);

  if (!viewError && fromView) {
    return fromView.map((row) =>
      mapStudentClass(row as Record<string, unknown>),
    );
  }

  if (viewError) {
    console.error("zoom_classes_student:", viewError.message);
  }

  const { data, error } = await supabase
    .from("zoom_classes")
    .select(
      `id, title, description, audience, parish_id, batch_id, cohort_id, year,
       scheduled_start, scheduled_end, duration_minutes,
       attendance_threshold_percent, zoom_meeting_id, zoom_meeting_uuid,
       zoom_join_url, zoom_passcode, status, created_by, last_synced_at,
       created_at, updated_at, parishes(name), batches(name, year), cohorts(name)`,
    )
    .in("status", ["scheduled", "live", "ended"])
    .order("scheduled_start", { ascending: true })
    .limit(80);

  if (error) {
    console.error("listStudentClasses:", error.message);
    throw new Error(publicActionMessage(error, "Could not load classes."));
  }

  return (data ?? [])
    .filter((row) => matchesStudentAudience(row, enrolment))
    .map((row) => {
      const parish = row.parishes as { name?: string } | null;
      const batch = row.batches as { name?: string; year?: number } | null;
      const cohort = row.cohorts as { name?: string } | null;
      return mapStudentClass({
        ...(row as Record<string, unknown>),
        parish_name: parish?.name ?? null,
        batch_name: batch?.name ?? null,
        batch_year: batch?.year ?? null,
        cohort_name: cohort?.name ?? null,
      });
    });
}

export async function listMyClassAttendance(): Promise<
  Pick<
    ZoomClassAttendance,
    "class_id" | "present" | "duration_seconds" | "required_seconds" | "source"
  >[]
> {
  const profile = await getSessionStudent();
  if (!profile) return [];
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("zoom_class_attendance")
    .select("class_id, present, duration_seconds, required_seconds, source")
    .eq("user_id", profile.id);
  return (data ?? []) as Pick<
    ZoomClassAttendance,
    "class_id" | "present" | "duration_seconds" | "required_seconds" | "source"
  >[];
}

export async function markAttendanceWithCode(
  code: string,
): Promise<StudentClassActionResult> {
  let profile;
  try {
    profile = await requireSessionStudent();
  } catch {
    return { ok: false, message: "Unauthorized." };
  }

  const normalized = code.trim().toUpperCase().replace(/\s+/g, "");
  if (normalized.length < 4) {
    return { ok: false, message: "Enter the class check-in code." };
  }

  const service = createServiceSupabaseClient();
  const { data: klass, error } = await service
    .from("zoom_classes")
    .select("*")
    .ilike("attendance_code", normalized)
    .maybeSingle();

  if (error) {
    console.error("check-in:", error.message);
    return fail(error);
  }
  if (!klass) {
    return { ok: false, message: "No class matches that code." };
  }

  if (klass.status === "cancelled") {
    return { ok: false, message: "That class was cancelled." };
  }

  const enrolment = await studentEnrolment(profile.id);
  if (!matchesStudentAudience(klass, enrolment)) {
    return {
      ok: false,
      message: "This class is not open to your parish / batch.",
    };
  }

  const now = Date.now();
  const windowStart =
    new Date(klass.scheduled_start).getTime() - 2 * 60 * 60 * 1000;
  const windowEnd =
    new Date(klass.scheduled_end).getTime() + 4 * 60 * 60 * 1000;
  if (now > windowEnd) {
    return {
      ok: false,
      message: "Check-in for this class has closed.",
    };
  }
  if (now < windowStart) {
    return {
      ok: false,
      message: "Check-in is not open yet for this class.",
    };
  }

  const { data: existing } = await service
    .from("zoom_class_attendance")
    .select("id, present")
    .eq("class_id", klass.id)
    .eq("user_id", profile.id)
    .maybeSingle();

  if (existing?.present) {
    return {
      ok: true,
      message: "You are already marked present for this class.",
    };
  }

  const saved = await upsertClassAttendanceRow({
    classId: klass.id,
    userId: profile.id,
    matchedEmail: profile.email,
    present: true,
    source: "code",
    durationSeconds: Number(klass.duration_minutes) * 60,
    requiredSeconds: Number(klass.duration_minutes) * 60,
  });

  if (!saved.ok) return saved;

  const wrote = await writeAttendanceToStudentRecord({
    userId: profile.id,
    sessionDate: sessionDateFromStart(klass.scheduled_start),
    label: klass.title,
    present: true,
    monthIndex: (klass.programme_month as number | null) ?? null,
  });

  if (!wrote) {
    return {
      ok: false,
      message:
        "Check-in saved, but Records could not be updated. Please tell an admin.",
    };
  }

  revalidatePath("/student/classes");
  revalidatePath("/student/records");
  revalidatePath("/admin/classes");
  revalidatePath("/admin/records");

  return {
    ok: true,
    message: `Present · ${klass.title} is on your Records.`,
  };
}

export async function meetingSdkReadyForStudent(): Promise<boolean> {
  return meetingSdkConfigured();
}

export async function getInPortalJoinSession(
  classId: string,
): Promise<
  { ok: true; session: InPortalZoomSession } | { ok: false; message: string }
> {
  let profile;
  try {
    profile = await requireSessionStudent();
  } catch {
    return { ok: false, message: "Unauthorized." };
  }

  if (!meetingSdkConfigured()) {
    return {
      ok: false,
      message:
        "In-portal Zoom is not configured yet. Use Open Zoom app instead.",
    };
  }

  // Service read after audience gate — students must not need base-table SELECT
  // (attendance_code / zoom_start_url stay off the student JWT path).
  const service = createServiceSupabaseClient();
  const { data: klass, error } = await service
    .from("zoom_classes")
    .select(
      "id, title, audience, parish_id, batch_id, cohort_id, year, status, zoom_meeting_id, zoom_passcode",
    )
    .eq("id", classId)
    .maybeSingle();

  if (error) {
    console.error("join session:", error.message);
    return fail(error, "Class not found.");
  }
  if (!klass) {
    return { ok: false, message: "Class not found." };
  }

  if (!klass.zoom_meeting_id) {
    return {
      ok: false,
      message: "This class has no Zoom meeting to join in the portal.",
    };
  }

  if (klass.status === "cancelled" || klass.status === "ended") {
    return { ok: false, message: "This class is no longer joinable." };
  }

  const enrolment = await studentEnrolment(profile.id);
  if (!matchesStudentAudience(klass, enrolment)) {
    return { ok: false, message: "This class is not open to you." };
  }

  try {
    const displayName = [profile.first_name, profile.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      ok: true,
      session: {
        signature: createMeetingSdkSignature({
          meetingNumber: String(klass.zoom_meeting_id),
          role: 0,
        }),
        sdkKey: process.env.ZOOM_MEETING_SDK_KEY!,
        meetingNumber: String(klass.zoom_meeting_id),
        password: klass.zoom_passcode ?? "",
        userName: displayName || profile.email,
        userEmail: profile.email,
        role: 0,
      },
    };
  } catch (err) {
    console.error("join session sdk:", err);
    return {
      ok: false,
      message: publicActionMessage(err, "Could not prepare join session."),
    };
  }
}
