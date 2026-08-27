"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
} from "@/lib/admin/auth";
import {
  portalBaseUrl,
  sendStudentScorecardEmail,
} from "@/lib/email/backend";
import {
  attendanceRate,
  includedAverage,
  type RecordBundle,
} from "@/lib/exams/records";
import type {
  StudentRecord,
  StudentRecordEntry,
  StudentRecordSession,
} from "@/lib/exams/types";
import { signStudentPhotoUrl } from "@/lib/student/photos";
import { signStudentCertificateUrl } from "@/lib/student/certificates";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type RecordActionResult = {
  ok: boolean;
  message: string;
  recordId?: string;
};

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function unauthorized(): { ok: false; message: string } {
  return { ok: false, message: "Unauthorized." };
}

function fail(error: unknown, fallback?: string): { ok: false; message: string } {
  return { ok: false, message: publicActionMessage(error, fallback) };
}

/**
 * Cookie/RLS gate — parish admins only reach scorecards whose parish_id matches.
 * National/master see all. Prefer this before every mutation by record id.
 */
async function requireAccessibleRecord(recordId: string): Promise<
  | { ok: true; supabase: Supabase; parish_id: string | null }
  | { ok: false; message: string }
> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("student_records")
    .select("id, parish_id")
    .eq("id", recordId)
    .maybeSingle();

  if (error) {
    console.error("records:", error.message);
    return fail(error);
  }
  if (!data) {
    return {
      ok: false,
      message: "Record not found or outside your parish scope.",
    };
  }
  return { ok: true, supabase, parish_id: data.parish_id ?? null };
}

/**
 * Ensure the student has a visible enrolment in the actor’s parish before
 * creating or opening a scorecard by user id.
 */
async function requireAccessibleEnrolmentUser(userId: string): Promise<
  | {
      ok: true;
      supabase: Supabase;
      enrolment: {
        id: string;
        parish_id: string | null;
        batch_id: string | null;
        created_at: string;
      } | null;
    }
  | { ok: false; message: string }
> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();

  const { data: enrolment, error } = await supabase
    .from("enrolments")
    .select("id, parish_id, batch_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("records:", error.message);
    return fail(error);
  }

  // Parish desk: enrolment must be visible (RLS) and match assigned parish.
  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return {
        ok: false,
        message: "Parish desk is not assigned to a parish.",
      };
    }
    if (!enrolment || enrolment.parish_id !== actor.parish_id) {
      return {
        ok: false,
        message: "Student not found or outside your parish scope.",
      };
    }
  }

  return {
    ok: true,
    supabase,
    enrolment: enrolment
      ? {
          id: enrolment.id,
          parish_id: enrolment.parish_id,
          batch_id: enrolment.batch_id,
          created_at: enrolment.created_at,
        }
      : null,
  };
}

function toDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function formatScorecardDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "In progress";
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function revalidateRecords() {
  revalidatePath("/admin/records");
  revalidatePath("/student/records");
}

export async function listRecordStudents(filters?: {
  parishId?: string;
  batchId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: {
    user_id: string;
    name: string;
    email: string;
    parish_id: string | null;
    batch_id: string | null;
    parish_name: string | null;
    batch_name: string | null;
    record_id: string | null;
  }[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();

  let parishFilter = filters?.parishId ?? "";
  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return { items: [], total: 0, page: 1, pageSize: filters?.pageSize ?? 50 };
    }
    parishFilter = actor.parish_id;
  }

  let enrolQ = supabase
    .from("enrolments")
    .select(
      "id, user_id, first_name, middle_name, last_name, email, parish_id, batch_id, parishes(name), batches(name), created_at",
    )
    .order("created_at", { ascending: false });

  if (parishFilter) enrolQ = enrolQ.eq("parish_id", parishFilter);
  if (filters?.batchId) enrolQ = enrolQ.eq("batch_id", filters.batchId);

  const { data: enrolments, error } = await enrolQ;
  if (error) {
    console.error("records list:", error.message);
    throw new Error(publicActionMessage(error, "Could not load students."));
  }

  const latest = new Map<string, (typeof enrolments)[number]>();
  for (const row of enrolments ?? []) {
    if (!latest.has(row.user_id)) latest.set(row.user_id, row);
  }

  const allStudents = [...latest.values()].map((e) => {
    const parish = e.parishes as { name?: string } | null;
    const batch = e.batches as { name?: string } | null;
    return {
      user_id: e.user_id,
      name: [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(" "),
      email: e.email,
      parish_id: e.parish_id,
      batch_id: e.batch_id,
      parish_name: parish?.name ?? null,
      batch_name: batch?.name ?? null,
      record_id: null as string | null,
    };
  });

  const pageSize = Math.min(Math.max(filters?.pageSize ?? 50, 1), 100);
  const page = Math.max(filters?.page ?? 1, 1);
  const total = allStudents.length;
  const pageStart = (page - 1) * pageSize;
  const pageRows = allStudents.slice(pageStart, pageStart + pageSize);

  const userIds = pageRows.map((row) => row.user_id);
  const recordMap = new Map<string, string>();
  if (userIds.length) {
    const { data: records } = await supabase
      .from("student_records")
      .select("id, user_id, batch_id")
      .in("user_id", userIds);
    for (const r of records ?? []) {
      const enrol = latest.get(r.user_id);
      if ((r.batch_id ?? null) === (enrol?.batch_id ?? null)) {
        recordMap.set(r.user_id, r.id);
      }
    }
  }

  const items = pageRows.map((row) => ({
    ...row,
    record_id: recordMap.get(row.user_id) ?? null,
  }));

  return { items, total, page, pageSize };
}

export async function ensureStudentRecord(
  userId: string,
): Promise<RecordActionResult> {
  try {
    if (!userId) return { ok: false, message: "Student id is required." };

    const access = await requireAccessibleEnrolmentUser(userId);
    if (!access.ok) return { ok: false, message: access.message };

    const { supabase, enrolment } = access;

    const { data: existing } = await supabase
      .from("student_records")
      .select("id, batch_id, parish_id, enrolment_id, enrolled_at")
      .eq("user_id", userId);

    const match = (existing ?? []).find(
      (r) => (r.batch_id ?? null) === (enrolment?.batch_id ?? null),
    );
    if (match) {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      let dirty = false;
      // Keep parish/enrolment aligned when the student transfers.
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
      if (!match.enrolled_at && enrolment?.created_at) {
        patch.enrolled_at = toDateOnly(enrolment.created_at);
        dirty = true;
      }
      if (dirty) {
        await supabase.from("student_records").update(patch).eq("id", match.id);
      }
      return { ok: true, message: "Record ready.", recordId: match.id };
    }

    const { data, error } = await supabase
      .from("student_records")
      .insert({
        user_id: userId,
        enrolment_id: enrolment?.id ?? null,
        parish_id: enrolment?.parish_id ?? null,
        batch_id: enrolment?.batch_id ?? null,
        enrolled_at: toDateOnly(enrolment?.created_at),
      })
      .select("id")
      .single();

    if (error) {
      console.error("records:", error.message);
      return fail(error);
    }
    revalidateRecords();
    return { ok: true, message: "Record created.", recordId: data.id };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return fail(error);
  }
}

export async function getRecordBundle(
  recordId: string,
): Promise<RecordBundle | null> {
  await requireSessionAdmin();
  if (!recordId) return null;

  const access = await requireAccessibleRecord(recordId);
  if (!access.ok) return null;

  const { supabase } = access;
  const { data: record } = await supabase
    .from("student_records")
    .select("*, parishes(name), batches(name, year)")
    .eq("id", recordId)
    .maybeSingle();
  if (!record) return null;

  const { data: profile } = await supabase
    .from("student_profiles")
    .select(
      "email, first_name, middle_name, last_name, passport_path, graduation_gate_override_note",
    )
    .eq("id", record.user_id)
    .maybeSingle();

  const { data: sessions } = await supabase
    .from("student_record_sessions")
    .select("*")
    .eq("record_id", recordId)
    .order("session_date", { ascending: true });

  const { data: entries } = await supabase
    .from("student_record_entries")
    .select("*")
    .eq("record_id", recordId)
    .order("created_at", { ascending: true });

  const parish = record.parishes as { name?: string } | null;
  const batch = record.batches as { name?: string; year?: number } | null;

  const typedSessions = (sessions ?? []) as StudentRecordSession[];
  const typedEntries = (entries ?? []).map((e) => ({
    ...e,
    percent: Number(e.percent),
  })) as StudentRecordEntry[];

  const passportUrl = await signStudentPhotoUrl(
    profile?.passport_path as string | null | undefined,
  );

  const bundleRecord: StudentRecord = {
    id: record.id,
    user_id: record.user_id,
    enrolment_id: record.enrolment_id,
    parish_id: record.parish_id,
    batch_id: record.batch_id,
    notes: record.notes,
    enrolled_at: record.enrolled_at ?? null,
    completed_at: record.completed_at ?? null,
    created_at: record.created_at,
    updated_at: record.updated_at,
    student_name: profile
      ? [profile.first_name, profile.middle_name, profile.last_name]
          .filter(Boolean)
          .join(" ")
      : "Student",
    student_email: profile?.email,
    parish_name: parish?.name ?? null,
    batch_name: batch?.name ?? null,
    batch_year: batch?.year ?? null,
    passport_url: passportUrl,
    graduation_gate_override_note:
      (profile?.graduation_gate_override_note as string | null) ?? null,
  };

  // If enrolled_at never set, prefer enrolment created_at for display.
  if (!bundleRecord.enrolled_at) {
    const { data: enrolment } = await supabase
      .from("enrolments")
      .select("created_at")
      .eq("user_id", record.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    bundleRecord.enrolled_at = toDateOnly(enrolment?.created_at);
  }

  return {
    record: bundleRecord,
    sessions: typedSessions,
    entries: typedEntries,
    average: includedAverage(typedEntries),
    attendance: attendanceRate(typedSessions),
  };
}

export async function updateScorecardDates(input: {
  recordId: string;
  enrolled_at: string | null;
  completed_at: string | null;
}): Promise<RecordActionResult> {
  try {
    const access = await requireAccessibleRecord(input.recordId);
    if (!access.ok) return { ok: false, message: access.message };

    const enrolled = input.enrolled_at?.trim() || null;
    const completed = input.completed_at?.trim() || null;
    if (enrolled && !/^\d{4}-\d{2}-\d{2}$/.test(enrolled)) {
      return { ok: false, message: "Invalid enrolled date." };
    }
    if (completed && !/^\d{4}-\d{2}-\d{2}$/.test(completed)) {
      return { ok: false, message: "Invalid completed date." };
    }

    const { error } = await access.supabase
      .from("student_records")
      .update({
        enrolled_at: enrolled,
        completed_at: completed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.recordId);

    if (error) {
      console.error("records dates:", error.message);
      if (/enrolled_at|completed_at|column/i.test(error.message)) {
        return {
          ok: false,
          message:
            "Scorecard dates could not be saved. Please try again later.",
        };
      }
      return fail(error);
    }

    revalidateRecords();
    return { ok: true, message: "Scorecard dates saved.", recordId: input.recordId };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return fail(error);
  }
}

export async function upsertAttendanceSession(input: {
  recordId: string;
  session_date: string;
  label?: string;
  present: boolean;
}): Promise<RecordActionResult> {
  try {
    await requireSessionAdmin();
    const access = await requireAccessibleRecord(input.recordId);
    if (!access.ok) return { ok: false, message: access.message };

    const { error } = await access.supabase.from("student_record_sessions").upsert(
      {
        record_id: input.recordId,
        session_date: input.session_date,
        label: input.label?.trim() || null,
        present: input.present,
      },
      { onConflict: "record_id,session_date" },
    );
    if (error) {
      console.error("records:", error.message);
      return fail(error);
    }
    revalidateRecords();
    return { ok: true, message: "Attendance saved." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return fail(error);
  }
}

export async function deleteAttendanceSession(
  sessionId: string,
): Promise<RecordActionResult> {
  try {
    await requireSessionAdmin();
    if (!sessionId) return { ok: false, message: "Session id is required." };

    const supabase = await createServerSupabaseClient();
    const { data: session, error: findError } = await supabase
      .from("student_record_sessions")
      .select("id, record_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (findError) {
      console.error("records:", findError.message);
      return fail(findError);
    }
    if (!session) {
      return {
        ok: false,
        message: "Session not found or outside your parish scope.",
      };
    }

    const access = await requireAccessibleRecord(session.record_id);
    if (!access.ok) return { ok: false, message: access.message };

    const { error } = await access.supabase
      .from("student_record_sessions")
      .delete()
      .eq("id", sessionId);
    if (error) {
      console.error("records:", error.message);
      return fail(error);
    }
    revalidateRecords();
    return { ok: true, message: "Session removed." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return fail(error);
  }
}

export async function addManualEntry(input: {
  recordId: string;
  label: string;
  percent: number;
  passed?: boolean;
  include_in_total?: boolean;
  notes?: string;
}): Promise<RecordActionResult> {
  try {
    await requireSessionAdmin();
    const label = input.label.trim();
    if (!label) return { ok: false, message: "Label required." };

    const access = await requireAccessibleRecord(input.recordId);
    if (!access.ok) return { ok: false, message: access.message };

    const percent = Math.min(100, Math.max(0, input.percent));
    const { error } = await access.supabase.from("student_record_entries").insert({
      record_id: input.recordId,
      source: "manual",
      label,
      percent,
      passed: input.passed ?? percent >= 50,
      include_in_total: input.include_in_total ?? true,
      notes: input.notes?.trim() || null,
    });
    if (error) {
      console.error("records:", error.message);
      return fail(error);
    }
    revalidateRecords();
    return { ok: true, message: "Score added." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return fail(error);
  }
}

export async function setEntryInclude(
  entryId: string,
  include: boolean,
): Promise<RecordActionResult> {
  try {
    await requireSessionAdmin();
    if (!entryId) return { ok: false, message: "Entry id is required." };

    const supabase = await createServerSupabaseClient();
    const { data: entry, error: findError } = await supabase
      .from("student_record_entries")
      .select("id, record_id")
      .eq("id", entryId)
      .maybeSingle();

    if (findError) {
      console.error("records:", findError.message);
      return fail(findError);
    }
    if (!entry) {
      return {
        ok: false,
        message: "Entry not found or outside your parish scope.",
      };
    }

    const access = await requireAccessibleRecord(entry.record_id);
    if (!access.ok) return { ok: false, message: access.message };

    const { error } = await access.supabase
      .from("student_record_entries")
      .update({
        include_in_total: include,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entryId);
    if (error) {
      console.error("records:", error.message);
      return fail(error);
    }
    revalidateRecords();
    return {
      ok: true,
      message: include ? "Included in total." : "Excluded from total.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return fail(error);
  }
}

export async function deleteRecordEntry(
  entryId: string,
): Promise<RecordActionResult> {
  try {
    await requireSessionAdmin();
    if (!entryId) return { ok: false, message: "Entry id is required." };

    const supabase = await createServerSupabaseClient();
    const { data: entry, error: findError } = await supabase
      .from("student_record_entries")
      .select("id, record_id, source")
      .eq("id", entryId)
      .maybeSingle();

    if (findError) {
      console.error("records:", findError.message);
      return fail(findError);
    }
    if (!entry) {
      return {
        ok: false,
        message: "Entry not found or outside your parish scope.",
      };
    }
    if (entry.source === "exam") {
      return {
        ok: false,
        message:
          "Exam scores cannot be deleted here. Pull back the release from the Exams queue, or regrade there.",
      };
    }

    const access = await requireAccessibleRecord(entry.record_id);
    if (!access.ok) return { ok: false, message: access.message };

    const { error } = await access.supabase
      .from("student_record_entries")
      .delete()
      .eq("id", entryId);
    if (error) {
      console.error("records:", error.message);
      return fail(error);
    }
    revalidateRecords();
    return { ok: true, message: "Entry removed." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return fail(error);
  }
}

/**
 * Email the formal scorecard / certificate document to the student only.
 * Scoped via requireAccessibleRecord (parish desks cannot email other parishes).
 */
export async function emailStudentScorecard(
  recordId: string,
): Promise<RecordActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!recordId) return { ok: false, message: "Record id is required." };

    const access = await requireAccessibleRecord(recordId);
    if (!access.ok) return { ok: false, message: access.message };

    const bundle = await getRecordBundle(recordId);
    if (!bundle) {
      return {
        ok: false,
        message: "Scorecard not found or outside your parish scope.",
      };
    }

    const to = bundle.record.student_email?.trim();
    if (!to) {
      return {
        ok: false,
        message: "This student has no email on their profile.",
      };
    }

    const { data: enrolment } = await access.supabase
      .from("enrolments")
      .select("reference, created_at")
      .eq("user_id", bundle.record.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const enrolledAt =
      bundle.record.enrolled_at || toDateOnly(enrolment?.created_at);
    const completedAt = bundle.record.completed_at;

    const issuedAtLabel = new Date().toLocaleString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const { data: photoRow } = await access.supabase
      .from("student_profiles")
      .select(
        "passport_path, certificate_path, is_active",
      )
      .eq("id", bundle.record.user_id)
      .maybeSingle();
    // Long-lived URL so the emailed scorecard photo still loads days later.
    const passportImageUrl = await signStudentPhotoUrl(
      photoRow?.passport_path,
      60 * 60 * 24 * 7,
    );

    // Certificate download only when on file and the student seat is active.
    const certificateAppropriate =
      Boolean(photoRow?.certificate_path) && photoRow?.is_active !== false;
    const certificateDownloadUrl = certificateAppropriate
      ? await signStudentCertificateUrl(
          photoRow?.certificate_path,
          60 * 60 * 24 * 7,
        )
      : null;

    const sent = await sendStudentScorecardEmail({
      to,
      studentName: bundle.record.student_name || "Student",
      studentEmail: to,
      reference: enrolment?.reference ?? undefined,
      parishName: bundle.record.parish_name ?? undefined,
      batchName: bundle.record.batch_name ?? undefined,
      batchYear: bundle.record.batch_year ?? null,
      enrolledAtLabel: formatScorecardDate(enrolledAt),
      completedAtLabel: completedAt
        ? formatScorecardDate(completedAt)
        : "In progress",
      attendancePercent: bundle.attendance,
      examAveragePercent: bundle.average,
      sessions: bundle.sessions.map((s) => ({
        date: s.session_date,
        label: s.label?.trim() || "Session",
        present: s.present,
      })),
      entries: bundle.entries.map((e) => ({
        label: e.label,
        percent: Number(e.percent),
        passed: e.passed,
        includeInTotal: e.include_in_total,
        source: e.source || "manual",
      })),
      issuedAtLabel,
      issuedByName: actor.full_name?.trim() || actor.email,
      portalRecordsUrl: `${portalBaseUrl()}/student/records`,
      portalCertificatesUrl: `${portalBaseUrl()}/student/records`,
      passportImageUrl: passportImageUrl ?? undefined,
      certificateDownloadUrl: certificateDownloadUrl ?? undefined,
    });

    if (!sent.ok) {
      return {
        ok: false,
        message: publicActionMessage(
          sent.message,
          "The scorecard email could not be sent. Please try again.",
        ),
      };
    }

    revalidateRecords();
    return {
      ok: true,
      message: `Scorecard emailed to ${to}.`,
      recordId,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return fail(error);
  }
}

export async function setGraduationGateOverride(input: {
  userId: string;
  note: string;
}): Promise<RecordActionResult> {
  try {
    const actor = await requireSessionAdmin();
    const note = input.note.trim();
    if (!input.userId) {
      return { ok: false, message: "Student is required." };
    }
    if (note.length < 4) {
      return { ok: false, message: "Add a short reason for the override." };
    }

    const access = await requireAccessibleEnrolmentUser(input.userId);
    if (!access.ok) return { ok: false, message: access.message };

    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("student_profiles")
      .update({
        graduation_gate_override_note: note,
        graduation_gate_override_by: actor.id,
        graduation_gate_override_at: new Date().toISOString(),
      })
      .eq("id", input.userId);

    if (error) {
      console.error("[records/graduation-override]", error.message);
      return fail(error, "Could not save the graduation override.");
    }

    revalidateRecords();
    revalidatePath("/student/gallery");
    revalidatePath("/student/records");
    return { ok: true, message: "Graduation override saved." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return fail(error);
  }
}

export async function clearGraduationGateOverride(
  userId: string,
): Promise<RecordActionResult> {
  try {
    await requireSessionAdmin();
    if (!userId) return { ok: false, message: "Student is required." };

    const access = await requireAccessibleEnrolmentUser(userId);
    if (!access.ok) return { ok: false, message: access.message };

    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("student_profiles")
      .update({
        graduation_gate_override_note: null,
        graduation_gate_override_by: null,
        graduation_gate_override_at: null,
      })
      .eq("id", userId);

    if (error) {
      console.error("[records/graduation-override-clear]", error.message);
      return fail(error, "Could not clear the graduation override.");
    }

    revalidateRecords();
    revalidatePath("/student/gallery");
    revalidatePath("/student/records");
    return { ok: true, message: "Graduation override cleared." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return fail(error);
  }
}
