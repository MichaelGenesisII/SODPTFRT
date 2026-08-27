import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { passedExam } from "@/lib/exams/score";

export const PROGRAMME_MONTH_MIN = 1;
export const PROGRAMME_MONTH_MAX = 10;

export type YearUnlockState = {
  yearIndex: number;
  attendancePresent: boolean;
  priorPassed: boolean;
  available: boolean;
  blockedReason: "attendance" | "prior_exam" | null;
};

export function isProgrammeMonth(value: unknown): value is number {
  const n = Number(value);
  return (
    Number.isInteger(n) &&
    n >= PROGRAMME_MONTH_MIN &&
    n <= PROGRAMME_MONTH_MAX
  );
}

/** Present months recorded on the student's scorecard (1–10). */
export async function listStudentPresentMonths(
  userId: string,
): Promise<number[]> {
  const service = createServiceSupabaseClient();
  const { data: records } = await service
    .from("student_records")
    .select("id")
    .eq("user_id", userId);

  const recordIds = (records ?? []).map((r) => r.id as string);
  if (!recordIds.length) return [];

  const { data: sessions, error } = await service
    .from("student_record_sessions")
    .select("month_index, present")
    .in("record_id", recordIds)
    .eq("present", true)
    .not("month_index", "is", null);

  if (error) {
    console.error("[exams/year-unlock] sessions", error.message);
    return [];
  }

  const months = new Set<number>();
  for (const row of sessions ?? []) {
    if (isProgrammeMonth(row.month_index)) months.add(Number(row.month_index));
  }
  return [...months].sort((a, b) => a - b);
}

/** Passed year-index exams (graded/released with percent >= pass). */
export async function listStudentPassedYearIndexes(
  userId: string,
): Promise<number[]> {
  const service = createServiceSupabaseClient();
  const { data: attempts, error } = await service
    .from("exam_attempts")
    .select("status, percent, exam_id, exams!inner(year_index, pass_percent)")
    .eq("user_id", userId)
    .in("status", ["graded", "released"]);

  if (error) {
    console.error("[exams/year-unlock] attempts", error.message);
    return [];
  }

  const passed = new Set<number>();
  for (const row of attempts ?? []) {
    const exam = row.exams as
      | { year_index: number | null; pass_percent: number }
      | { year_index: number | null; pass_percent: number }[]
      | null;
    const meta = Array.isArray(exam) ? exam[0] : exam;
    if (!meta || !isProgrammeMonth(meta.year_index)) continue;
    if (row.percent == null) continue;
    if (passedExam(Number(row.percent), Number(meta.pass_percent))) {
      passed.add(Number(meta.year_index));
    }
  }
  return [...passed].sort((a, b) => a - b);
}

export async function getYearUnlockState(
  userId: string,
  yearIndex: number,
): Promise<YearUnlockState> {
  const presentMonths = await listStudentPresentMonths(userId);
  const passedYears = await listStudentPassedYearIndexes(userId);
  const attendancePresent = presentMonths.includes(yearIndex);
  const priorPassed =
    yearIndex <= 1 ? true : passedYears.includes(yearIndex - 1);

  if (!attendancePresent) {
    return {
      yearIndex,
      attendancePresent: false,
      priorPassed,
      available: false,
      blockedReason: "attendance",
    };
  }
  if (!priorPassed) {
    return {
      yearIndex,
      attendancePresent: true,
      priorPassed: false,
      available: false,
      blockedReason: "prior_exam",
    };
  }
  return {
    yearIndex,
    attendancePresent: true,
    priorPassed: true,
    available: true,
    blockedReason: null,
  };
}

/**
 * Admin unlock (D3): mark the student present for programme month N.
 * Same effect as attendance for that Saturday.
 */
export async function unlockProgrammeMonthAttendance(input: {
  userId: string;
  monthIndex: number;
  label?: string;
  sessionDate?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isProgrammeMonth(input.monthIndex)) {
    return { ok: false, message: "Month must be between 1 and 10." };
  }

  const { ensureStudentRecordId } = await import("@/lib/classes/attendance");
  const recordId = await ensureStudentRecordId(input.userId);
  if (!recordId) {
    return { ok: false, message: "Could not find a student record." };
  }

  const service = createServiceSupabaseClient();

  const { data: existing } = await service
    .from("student_record_sessions")
    .select("id")
    .eq("record_id", recordId)
    .eq("month_index", input.monthIndex)
    .eq("present", true)
    .limit(1)
    .maybeSingle();

  if (existing) return { ok: true };

  const sessionDate =
    input.sessionDate?.slice(0, 10) ||
    new Date().toISOString().slice(0, 10);
  const label =
    input.label?.trim() || `Programme month ${input.monthIndex} (admin unlock)`;

  const { error } = await service.from("student_record_sessions").insert({
    record_id: recordId,
    session_date: sessionDate,
    label,
    present: true,
    month_index: input.monthIndex,
  });

  if (error) {
    if (/unique|duplicate/i.test(error.message)) return { ok: true };
    console.error("[exams/year-unlock] admin unlock", error.message);
    return { ok: false, message: "Could not unlock this month." };
  }
  return { ok: true };
}

export function yearUnlockMessage(state: YearUnlockState): string {
  if (state.available) return "";
  if (state.blockedReason === "attendance") {
    return `Exam Year ${state.yearIndex} opens after your Month ${state.yearIndex} Saturday class is marked present. If you missed it, contact Admin.`;
  }
  if (state.blockedReason === "prior_exam") {
    return `Pass Exam Year ${state.yearIndex - 1} before Year ${state.yearIndex} opens.`;
  }
  return "This exam is not available yet.";
}
