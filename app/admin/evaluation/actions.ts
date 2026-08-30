"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
  type AdminProfile,
} from "@/lib/admin/auth";
import {
  computeAttemptTotals,
  passedExam,
} from "@/lib/exams/score";
import {
  attemptHasFinalScore,
  sendAttemptCertificateEmail,
} from "@/lib/exams/certificate-email";
import type {
  ExamAnswer,
  ExamAttempt,
  ExamCandidate,
  ExamQuestion,
} from "@/lib/exams/types";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type EvalActionResult = { ok: boolean; message: string };

function evalFail(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): { ok: false; message: string } {
  console.error("[admin/evaluation]", error);
  return { ok: false, message: publicActionMessage(error, fallback) };
}

function revalidateRecordPaths(userId?: string | null) {
  revalidatePath("/admin/records");
  if (userId) revalidatePath(`/admin/records/${userId}`);
  revalidatePath("/student/records");
}

export type EvaluationAttemptRow = ExamAttempt & {
  exam_title: string;
  exam_audience: "student" | "open";
  exam_year_index: number | null;
  pass_percent: number;
  counts_toward_record: boolean;
  display_name: string;
  display_email: string;
};

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/**
 * Parish desks only grade attempts whose exam.parish_id matches.
 * Relies on RLS + explicit parish check for clear errors.
 */
async function requireAccessibleAttempt(attemptId: string): Promise<
  | {
      ok: true;
      supabase: Supabase;
      actor: AdminProfile;
      exam_id: string;
      parish_id: string | null;
    }
  | { ok: false; message: string }
> {
  let actor: AdminProfile;
  try {
    actor = await requireSessionAdmin();
  } catch {
    return { ok: false, message: "Unauthorized." };
  }

  if (!attemptId) {
    return { ok: false, message: "Attempt id is required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("exam_attempts")
    .select("id, exam_id, exams(parish_id)")
    .eq("id", attemptId)
    .maybeSingle();

  if (error) return evalFail(error);
  if (!data) {
    return {
      ok: false,
      message: "Attempt not found or outside your parish scope.",
    };
  }

  const exam = data.exams as { parish_id?: string | null } | null;
  const parishId = exam?.parish_id ?? null;

  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return {
        ok: false,
        message: "Parish desk is not assigned to a parish.",
      };
    }
    if (!parishId || parishId !== actor.parish_id) {
      return {
        ok: false,
        message: "Attempt not found or outside your parish scope.",
      };
    }
  }

  return {
    ok: true,
    supabase,
    actor,
    exam_id: data.exam_id,
    parish_id: parishId,
  };
}

export async function listEvaluationAttempts(): Promise<EvaluationAttemptRow[]> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();

  if (!isNationalAdmin(actor) && !actor.parish_id) {
    return [];
  }

  let q = supabase
    .from("exam_attempts")
    .select(
      "*, exams!inner(title, audience, pass_percent, counts_toward_record, parish_id, year_index)",
    )
    .in("status", ["submitted", "graded", "released"])
    .order("submitted_at", { ascending: false })
    .limit(500);

  if (!isNationalAdmin(actor) && actor.parish_id) {
    q = q.eq("exams.parish_id", actor.parish_id);
  }

  const { data, error } = await q;

  if (error) throw new Error(error.message);

  const userIds = [
    ...new Set(
      (data ?? [])
        .map((r) => r.user_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const nameMap = new Map<string, { name: string; email: string }>();
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("student_profiles")
      .select("id, email, first_name, middle_name, last_name")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      nameMap.set(p.id, {
        email: p.email,
        name: [p.first_name, p.middle_name, p.last_name]
          .filter(Boolean)
          .join(" "),
      });
    }
  }

  return (data ?? []).map((row) => {
    const exam = row.exams as {
      title: string;
      audience: "student" | "open";
      pass_percent: number;
      counts_toward_record: boolean;
      year_index?: number | null;
    } | null;
    const candidate = row.candidate as {
      full_name?: string;
      email?: string;
    } | null;
    const student = row.user_id ? nameMap.get(row.user_id) : null;
    return {
      id: row.id,
      exam_id: row.exam_id,
      user_id: row.user_id,
      candidate: row.candidate,
      attempt_token: row.attempt_token,
      status: row.status,
      started_at: row.started_at,
      submitted_at: row.submitted_at,
      auto_score: Number(row.auto_score),
      manual_score: Number(row.manual_score),
      total_score: Number(row.total_score),
      max_score: Number(row.max_score),
      percent: row.percent != null ? Number(row.percent) : null,
      graded_by: row.graded_by,
      graded_at: row.graded_at,
      released_at: row.released_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      exam_title: exam?.title ?? "Exam",
      exam_audience: exam?.audience ?? "student",
      exam_year_index:
        exam?.year_index != null ? Number(exam.year_index) : null,
      pass_percent: Number(exam?.pass_percent ?? 50),
      counts_toward_record: Boolean(exam?.counts_toward_record),
      display_name:
        student?.name || candidate?.full_name || "Candidate",
      display_email: student?.email || candidate?.email || "",
    } satisfies EvaluationAttemptRow;
  });
}

export async function getEvaluationDetail(attemptId: string): Promise<{
  attempt: EvaluationAttemptRow;
  questions: ExamQuestion[];
  answers: ExamAnswer[];
} | null> {
  const access = await requireAccessibleAttempt(attemptId);
  if (!access.ok) return null;

  const { supabase } = access;
  const { data: row } = await supabase
    .from("exam_attempts")
    .select("*, exams(title, audience, pass_percent, counts_toward_record, year_index)")
    .eq("id", attemptId)
    .maybeSingle();
  if (!row) return null;

  const examMeta = row.exams as {
    title: string;
    audience: "student" | "open";
    pass_percent: number;
    counts_toward_record: boolean;
    year_index?: number | null;
  };

  const { data: questions } = await supabase
    .from("exam_questions")
    .select("*")
    .eq("exam_id", row.exam_id)
    .order("sort_order", { ascending: true });

  // Grade columns are revoked from authenticated JWT — read via service after access gate.
  const service = createServiceSupabaseClient();
  const { data: answers } = await service
    .from("exam_answers")
    .select("*")
    .eq("attempt_id", attemptId);

  let display_name = "Candidate";
  let display_email = "";
  if (row.user_id) {
    const { data: p } = await supabase
      .from("student_profiles")
      .select("email, first_name, middle_name, last_name")
      .eq("id", row.user_id)
      .maybeSingle();
    if (p) {
      display_name = [p.first_name, p.middle_name, p.last_name]
        .filter(Boolean)
        .join(" ");
      display_email = p.email;
    }
  } else if (row.candidate) {
    const c = row.candidate as { full_name?: string; email?: string };
    display_name = c.full_name ?? display_name;
    display_email = c.email ?? "";
  }

  return {
    attempt: {
      id: row.id,
      exam_id: row.exam_id,
      user_id: row.user_id,
      candidate: row.candidate,
      attempt_token: row.attempt_token,
      status: row.status,
      started_at: row.started_at,
      submitted_at: row.submitted_at,
      auto_score: Number(row.auto_score),
      manual_score: Number(row.manual_score),
      total_score: Number(row.total_score),
      max_score: Number(row.max_score),
      percent: row.percent != null ? Number(row.percent) : null,
      graded_by: row.graded_by,
      graded_at: row.graded_at,
      released_at: row.released_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      exam_title: examMeta.title,
      exam_audience: examMeta.audience,
      exam_year_index:
        examMeta.year_index != null ? Number(examMeta.year_index) : null,
      pass_percent: Number(examMeta.pass_percent),
      counts_toward_record: Boolean(examMeta.counts_toward_record),
      display_name,
      display_email,
    },
    questions: (questions ?? []).map((q) => ({
      ...q,
      points: Number(q.points),
      payload: q.payload ?? {},
    })) as ExamQuestion[],
    answers: (answers ?? []) as ExamAnswer[],
  };
}

export async function saveManualGrades(
  attemptId: string,
  grades: { questionId: string; manual_points: number; grader_note?: string }[],
): Promise<EvalActionResult> {
  const access = await requireAccessibleAttempt(attemptId);
  if (!access.ok) return { ok: false, message: access.message };

  const { actor: admin, supabase } = access;
  const service = createServiceSupabaseClient();
  for (const g of grades) {
    const { error } = await service
      .from("exam_answers")
      .update({
        manual_points: Math.max(0, g.manual_points),
        grader_note: g.grader_note?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("attempt_id", attemptId)
      .eq("question_id", g.questionId);
    if (error) return evalFail(error);
  }

  const detail = await getEvaluationDetail(attemptId);
  if (!detail) return { ok: false, message: "Attempt not found." };

  const totals = computeAttemptTotals(detail.questions, detail.answers.map((a) => {
    const patch = grades.find((g) => g.questionId === a.question_id);
    return patch
      ? { ...a, manual_points: patch.manual_points }
      : a;
  }));

  const { error } = await supabase
    .from("exam_attempts")
    .update({
      auto_score: totals.autoScore,
      manual_score: totals.manualScore,
      total_score: totals.totalScore,
      max_score: totals.maxScore,
      percent: totals.percent,
      status: totals.allManualDone ? "graded" : "submitted",
      graded_by: admin.id,
      graded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", attemptId);

  if (error) return evalFail(error);
  revalidatePath("/admin/exams");
  return { ok: true, message: "Grades saved." };
}

export async function releaseAttempt(
  attemptId: string,
): Promise<EvalActionResult> {
  const access = await requireAccessibleAttempt(attemptId);
  if (!access.ok) return { ok: false, message: access.message };

  const { actor: admin, supabase } = access;
  const detail = await getEvaluationDetail(attemptId);
  if (!detail) return { ok: false, message: "Attempt not found." };
  if (detail.attempt.status === "in_progress") {
    return { ok: false, message: "Still in progress." };
  }

  const totals = computeAttemptTotals(detail.questions, detail.answers);
  if (!totals.allManualDone) {
    return { ok: false, message: "Finish manual grading first." };
  }

  const { error } = await supabase
    .from("exam_attempts")
    .update({
      status: "released",
      auto_score: totals.autoScore,
      manual_score: totals.manualScore,
      total_score: totals.totalScore,
      max_score: totals.maxScore,
      percent: totals.percent,
      graded_by: admin.id,
      graded_at: detail.attempt.graded_at ?? new Date().toISOString(),
      released_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", attemptId);

  if (error) return evalFail(error);

  let recordsNote = "";
  // Write to student record when applicable
  if (
    detail.attempt.user_id &&
    detail.attempt.counts_toward_record &&
    totals.percent != null
  ) {
    const wrote = await upsertRecordEntryFromAttempt({
      userId: detail.attempt.user_id,
      examId: detail.attempt.exam_id,
      attemptId,
      label: detail.attempt.exam_title,
      percent: totals.percent,
      passPercent: detail.attempt.pass_percent,
    });
    if (!wrote) {
      console.error("[eval] records write failed after release", attemptId);
      recordsNote =
        " Results are released, but the scorecard could not be updated — try again or add the score in Records.";
    }
  }

  // Open candidates: email certificate on release only when the desk graded
  // (graded_by set). Auto-graded sittings already emailed on submit.
  if (
    detail.attempt.exam_audience === "open" &&
    !detail.attempt.user_id &&
    detail.attempt.graded_by &&
    totals.percent != null
  ) {
    const service = createServiceSupabaseClient();
    const { data: examRow } = await service
      .from("exams")
      .select(
        "title, slug, pass_percent, audience, visitor_reveal_score, visitor_email_scorecard",
      )
      .eq("id", detail.attempt.exam_id)
      .maybeSingle();

    const candidate = detail.attempt.candidate as ExamCandidate | null;
    if (
      examRow?.visitor_reveal_score &&
      examRow.visitor_email_scorecard &&
      candidate?.email
    ) {
      const releasedAttempt = {
        ...detail.attempt,
        status: "released" as const,
        percent: totals.percent,
        total_score: totals.totalScore,
        max_score: totals.maxScore,
        released_at: new Date().toISOString(),
      };
      if (attemptHasFinalScore(releasedAttempt)) {
        const mailed = await sendAttemptCertificateEmail({
          exam: {
            title: examRow.title,
            slug: examRow.slug,
            pass_percent: Number(examRow.pass_percent),
            audience: "open",
          },
          attempt: releasedAttempt,
          candidate,
        });
        if (!mailed.ok) {
          console.error("[eval] certificate email", mailed.message);
          revalidatePath("/admin/exams");
          revalidateRecordPaths(detail.attempt.user_id);
          return {
            ok: true,
            message:
              `Results released.${recordsNote} The certificate email could not be sent — the candidate can request it from the exam page.`,
          };
        }
      }
    }
  }

  revalidatePath("/admin/exams");
  revalidateRecordPaths(detail.attempt.user_id);
  return {
    ok: true,
    message: recordsNote
      ? `Results released.${recordsNote}`
      : "Results released.",
  };
}

export async function unreleaseAttempt(
  attemptId: string,
): Promise<EvalActionResult> {
  const access = await requireAccessibleAttempt(attemptId);
  if (!access.ok) return { ok: false, message: access.message };

  const { actor: admin, supabase } = access;
  const detail = await getEvaluationDetail(attemptId);
  if (!detail) return { ok: false, message: "Attempt not found." };
  if (detail.attempt.status !== "released") {
    return { ok: false, message: "Only released results can be pulled back." };
  }

  const { error } = await supabase
    .from("exam_attempts")
    .update({
      status: "graded",
      released_at: null,
      graded_by: detail.attempt.graded_by ?? admin.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attemptId);

  if (error) return evalFail(error);

  const service = createServiceSupabaseClient();
  const { error: entryError } = await service
    .from("student_record_entries")
    .delete()
    .eq("attempt_id", attemptId)
    .eq("source", "exam");
  if (entryError) {
    console.error("[eval] unrelease records entry:", entryError.message);
    revalidatePath("/admin/exams");
    revalidateRecordPaths(detail.attempt.user_id);
    revalidatePath("/student/exams");
    return {
      ok: true,
      message:
        "Release pulled back. The scorecard entry could not be removed — delete it in Records if needed.",
    };
  }

  revalidatePath("/admin/exams");
  revalidateRecordPaths(detail.attempt.user_id);
  revalidatePath("/student/exams");
  return {
    ok: true,
    message: "Release pulled back. Scorecard entry removed.",
  };
}

async function upsertRecordEntryFromAttempt(input: {
  userId: string;
  examId: string;
  attemptId: string;
  label: string;
  percent: number;
  passPercent: number;
}): Promise<boolean> {
  const service = createServiceSupabaseClient();
  const { data: enrolment } = await service
    .from("enrolments")
    .select("id, parish_id, batch_id")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let recordId: string | null = null;
  const batchId = enrolment?.batch_id ?? null;

  let existingQuery = service
    .from("student_records")
    .select("id, parish_id, enrolment_id")
    .eq("user_id", input.userId);
  existingQuery = batchId
    ? existingQuery.eq("batch_id", batchId)
    : existingQuery.is("batch_id", null);

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    recordId = existing.id;
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    let dirty = false;
    if (
      enrolment?.parish_id &&
      (existing.parish_id ?? null) !== enrolment.parish_id
    ) {
      patch.parish_id = enrolment.parish_id;
      dirty = true;
    }
    if (enrolment?.id && existing.enrolment_id !== enrolment.id) {
      patch.enrolment_id = enrolment.id;
      dirty = true;
    }
    if (dirty) {
      await service.from("student_records").update(patch).eq("id", existing.id);
    }
  } else {
    const { data: byUser } = await service
      .from("student_records")
      .select("id, batch_id, parish_id, enrolment_id")
      .eq("user_id", input.userId);
    const match = (byUser ?? []).find(
      (r) => (r.batch_id ?? null) === batchId,
    );
    if (match) {
      recordId = match.id;
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
        await service.from("student_records").update(patch).eq("id", match.id);
      }
    } else {
      const { data: created, error } = await service
        .from("student_records")
        .insert({
          user_id: input.userId,
          enrolment_id: enrolment?.id ?? null,
          parish_id: enrolment?.parish_id ?? null,
          batch_id: batchId,
        })
        .select("id")
        .single();
      if (error) {
        console.error("[record upsert]", error.message);
        return false;
      }
      recordId = created.id;
    }
  }

  if (!recordId) return false;

  const passed = passedExam(input.percent, input.passPercent);
  const { data: entry } = await service
    .from("student_record_entries")
    .select("id")
    .eq("attempt_id", input.attemptId)
    .maybeSingle();

  if (entry) {
    const { error } = await service
      .from("student_record_entries")
      .update({
        label: input.label,
        percent: input.percent,
        passed,
        source: "exam",
        exam_id: input.examId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", entry.id);
    if (error) {
      console.error("[record entry update]", error.message);
      return false;
    }
  } else {
    const { error } = await service.from("student_record_entries").insert({
      record_id: recordId,
      source: "exam",
      exam_id: input.examId,
      attempt_id: input.attemptId,
      label: input.label,
      percent: input.percent,
      passed,
      include_in_total: true,
    });
    if (error) {
      console.error("[record entry insert]", error.message);
      return false;
    }
  }
  return true;
}
