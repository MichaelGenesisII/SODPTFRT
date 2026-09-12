"use server";

import {
  attendanceRate,
  includedAverage,
  type RecordBundle,
} from "@/lib/exams/records";
import type {
  StudentRecordEntry,
  StudentRecordSession,
} from "@/lib/exams/types";
import { requireSessionStudent } from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Student portal scorecard for the current enrolment batch.
 * Falls back to newest scorecard only when no batch-matched row exists (legacy).
 * Syncs parish_id from the latest enrolment when it has drifted.
 */
export async function getOwnStudentRecord(): Promise<RecordBundle | null> {
  const student = await requireSessionStudent();
  const supabase = await createServerSupabaseClient();

  const { data: enrolment } = await supabase
    .from("enrolments")
    .select("id, parish_id, batch_id, created_at")
    .eq("user_id", student.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const batchId = enrolment?.batch_id ?? null;

  let recordId: string | null = null;

  if (batchId) {
    const { data } = await supabase
      .from("student_records")
      .select("id")
      .eq("user_id", student.id)
      .eq("batch_id", batchId)
      .limit(1)
      .maybeSingle();
    recordId = data?.id ?? null;
  } else {
    const { data: rows } = await supabase
      .from("student_records")
      .select("id, batch_id")
      .eq("user_id", student.id)
      .order("created_at", { ascending: false });
    const match = (rows ?? []).find((r) => r.batch_id == null);
    recordId = match?.id ?? null;
  }

  if (!recordId) {
    const { data: fallback } = await supabase
      .from("student_records")
      .select("id")
      .eq("user_id", student.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    recordId = fallback?.id ?? null;
  }

  if (!recordId) return null;

  // Keep parish (and enrolment link) aligned with the student's latest enrolment.
  if (enrolment?.parish_id) {
    try {
      const service = createServiceSupabaseClient();
      await service
        .from("student_records")
        .update({
          parish_id: enrolment.parish_id,
          enrolment_id: enrolment.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", recordId)
        .eq("user_id", student.id);
    } catch (error) {
      console.error(
        "getOwnStudentRecord parish sync:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const { data: record } = await supabase
    .from("student_records")
    .select("*, parishes(name), batches(name, year)")
    .eq("id", recordId)
    .maybeSingle();
  if (!record) return null;

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

  return {
    record: {
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
      student_name: [student.first_name, student.middle_name, student.last_name]
        .filter(Boolean)
        .join(" "),
      student_email: student.email,
      parish_name: parish?.name ?? null,
      batch_name: batch?.name ?? null,
      batch_year: batch?.year ?? null,
      passport_url: student.passportUrl ?? null,
    },
    sessions: typedSessions,
    entries: typedEntries,
    average: includedAverage(typedEntries),
    attendance: attendanceRate(typedSessions),
  };
}
