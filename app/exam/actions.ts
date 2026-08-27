"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  autoScoreAnswer,
  computeAttemptTotals,
  computeAutoPortion,
  needsManualGrade,
  passedExam,
} from "@/lib/exams/score";
import type {
  Exam,
  ExamAnswer,
  ExamAttempt,
  ExamCandidate,
  ExamQuestion,
} from "@/lib/exams/types";
import {
  attemptHasFinalScore,
  sendAttemptCertificateEmail,
} from "@/lib/exams/certificate-email";
import {
  getYearUnlockState,
  isProgrammeMonth,
  yearUnlockMessage,
  type YearUnlockState,
} from "@/lib/exams/year-unlock";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const OPEN_ATTEMPT_COOKIE = "sod_exam_attempt";

export type TakeActionResult = {
  ok: boolean;
  message: string;
  attemptId?: string;
  token?: string;
};

export type StudentExamListItem = Exam & {
  attempt_status?: string | null;
  unlock?: YearUnlockState | null;
  unlock_message?: string | null;
};

export type StudentProvisionalResult = {
  autoPercent: number;
  autoPassed: boolean;
  awaitingManual: boolean;
};

function fail(message: string, fallback?: string): TakeActionResult {
  return {
    ok: false,
    message: publicActionMessage(message, fallback ?? message),
  };
}

function stripAnswerKeys(questions: ExamQuestion[]): ExamQuestion[] {
  return questions.map((q) => {
    if (q.type === "multiple_choice") {
      const payload = { ...(q.payload as object) } as Record<string, unknown>;
      delete payload.correctKeys;
      return { ...q, payload };
    }
    if (q.type === "true_false") {
      const payload = { ...(q.payload as object) } as Record<string, unknown>;
      delete payload.correct;
      return { ...q, payload };
    }
    if (q.type === "short_answer") {
      return { ...q, payload: {} };
    }
    if (q.type === "long_answer") {
      return { ...q, payload: {} };
    }
    return q;
  });
}

/** Never ship per-question scores to take / thank-you clients. */
function stripAnswerScores(answers: ExamAnswer[]): ExamAnswer[] {
  return answers.map((a) => ({
    ...a,
    auto_points: null,
    manual_points: null,
    grader_note: null,
  }));
}

/**
 * Hide totals until the candidate is allowed to see a final score.
 * In-progress attempts never include live auto-score leakage.
 */
function publicFacingAttempt(
  attempt: ExamAttempt,
  revealFinal: boolean,
): ExamAttempt {
  if (attempt.status === "in_progress" || !revealFinal) {
    return {
      ...attempt,
      auto_score: 0,
      manual_score: 0,
      total_score: 0,
      percent: null,
      graded_by: null,
      graded_at: null,
      released_at: null,
    };
  }
  return attempt;
}

async function loadExamBySlug(slug: string): Promise<Exam | null> {
  const service = createServiceSupabaseClient();
  const { data } = await service
    .from("exams")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) return null;
  return {
    ...data,
    pass_percent: Number(data.pass_percent),
    year_index:
      (data as { year_index?: number | null }).year_index != null
        ? Number((data as { year_index?: number | null }).year_index)
        : null,
    visitor_reveal_score: Boolean(
      (data as { visitor_reveal_score?: boolean }).visitor_reveal_score,
    ),
    visitor_email_scorecard: Boolean(
      (data as { visitor_email_scorecard?: boolean }).visitor_email_scorecard,
    ),
  } as Exam;
}

async function loadQuestions(examId: string): Promise<ExamQuestion[]> {
  const service = createServiceSupabaseClient();
  const { data } = await service
    .from("exam_questions")
    .select("*")
    .eq("exam_id", examId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((q) => ({
    ...q,
    points: Number(q.points),
    payload: q.payload ?? {},
  })) as ExamQuestion[];
}

function examIsOpen(exam: Exam): boolean {
  if (exam.status !== "published") return false;
  const now = Date.now();
  if (exam.opens_at && new Date(exam.opens_at).getTime() > now) return false;
  if (exam.closes_at && new Date(exam.closes_at).getTime() < now) return false;
  return true;
}

async function setOpenAttemptCookie(
  slug: string,
  token: string,
  durationMinutes: number,
) {
  const jar = await cookies();
  jar.set(OPEN_ATTEMPT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: `/exam/${slug}`,
    maxAge: durationMinutes * 60 + 3600,
  });
}

export async function getPublicExamBundle(slug: string): Promise<{
  exam: Exam;
  questionCount: number;
} | null> {
  const exam = await loadExamBySlug(slug);
  if (!exam || exam.audience !== "open") return null;
  if (exam.status === "draft") return null;
  const questions = await loadQuestions(exam.id);
  return { exam, questionCount: questions.length };
}

export async function getStudentExamBundle(slug: string): Promise<{
  exam: Exam;
  questions: ExamQuestion[];
  questionCount: number;
  attempt: ExamAttempt | null;
  answers: ExamAnswer[];
  unlock: YearUnlockState | null;
  unlockMessage: string | null;
  provisional: StudentProvisionalResult | null;
} | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const exam = await loadExamBySlug(slug);
  if (!exam || exam.audience !== "student") return null;

  const { data: visible } = await supabase
    .from("exams")
    .select("id")
    .eq("id", exam.id)
    .maybeSingle();
  if (!visible) return null;

  let unlock: YearUnlockState | null = null;
  let unlockMessage: string | null = null;
  if (isProgrammeMonth(exam.year_index)) {
    unlock = await getYearUnlockState(user.id, exam.year_index);
    unlockMessage = unlock.available ? null : yearUnlockMessage(unlock);
  }

  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const typedAttempt = attempt as ExamAttempt | null;
  const revealPrompts =
    examIsOpen(exam) || typedAttempt?.status === "in_progress";

  let questions: ExamQuestion[] = [];
  let questionCount = 0;
  if (revealPrompts) {
    questions = await loadQuestions(exam.id);
    questionCount = questions.length;
  } else {
    const service = createServiceSupabaseClient();
    const { count } = await service
      .from("exam_questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", exam.id);
    questionCount = count ?? 0;
  }

  let answers: ExamAnswer[] = [];
  if (typedAttempt) {
    const { data: ans, error: ansError } = await supabase
      .from("exam_answers_student")
      .select("id, attempt_id, question_id, response, updated_at")
      .eq("attempt_id", typedAttempt.id);
    if (ansError) {
      console.error("exam_answers_student:", ansError.message);
      answers = await loadStudentAnswersFallback(supabase, typedAttempt.id);
    } else {
      answers = (ans ?? []).map((row) => ({
        ...row,
        auto_points: null,
        manual_points: null,
        grader_note: null,
      })) as ExamAnswer[];
    }
  }

  const revealFinal = typedAttempt
    ? attemptHasFinalScore(typedAttempt)
    : false;

  let provisional: StudentProvisionalResult | null = null;
  if (
    typedAttempt &&
    typedAttempt.status === "submitted" &&
    !revealFinal
  ) {
    const service = createServiceSupabaseClient();
    const fullQuestions = await loadQuestions(exam.id);
    const { data: scoredAnswers } = await service
      .from("exam_answers")
      .select("question_id, auto_points, response")
      .eq("attempt_id", typedAttempt.id);
    const portion = computeAutoPortion(
      fullQuestions,
      (scoredAnswers ?? []) as ExamAnswer[],
    );
    if (portion.autoPercent != null) {
      provisional = {
        autoPercent: portion.autoPercent,
        autoPassed: passedExam(portion.autoPercent, Number(exam.pass_percent)),
        awaitingManual: true,
      };
    }
  }

  // Students always see final score when graded/released (no answer keys).
  const publicAttempt = typedAttempt
    ? publicFacingAttempt(typedAttempt, revealFinal || Boolean(provisional))
    : null;

  if (publicAttempt && provisional && !revealFinal) {
    publicAttempt.percent = provisional.autoPercent;
    publicAttempt.auto_score = 0;
    publicAttempt.manual_score = 0;
    publicAttempt.total_score = 0;
  }

  return {
    exam,
    questions: stripAnswerKeys(questions),
    questionCount,
    attempt: publicAttempt,
    answers: stripAnswerScores(answers),
    unlock,
    unlockMessage,
    provisional,
  };
}

/** Fallback when exam_answers_student view is not applied yet. */
async function loadStudentAnswersFallback(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  attemptId: string,
): Promise<ExamAnswer[]> {
  const { data: ans } = await supabase
    .from("exam_answers")
    .select("id, attempt_id, question_id, response, updated_at")
    .eq("attempt_id", attemptId);
  return (ans ?? []).map((row) => ({
    ...row,
    auto_points: null,
    manual_points: null,
    grader_note: null,
  })) as ExamAnswer[];
}

export async function startStudentAttempt(
  examId: string,
): Promise<TakeActionResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sign in required.");

  const service = createServiceSupabaseClient();
  const { data: examRow } = await service
    .from("exams")
    .select("*")
    .eq("id", examId)
    .maybeSingle();
  if (!examRow) return fail("Exam not found.");
  const full = {
    ...examRow,
    pass_percent: Number(examRow.pass_percent),
    year_index:
      (examRow as { year_index?: number | null }).year_index != null
        ? Number((examRow as { year_index?: number | null }).year_index)
        : null,
  } as Exam;
  if (full.audience !== "student" || !examIsOpen(full)) {
    return fail("This exam is not open.");
  }

  if (isProgrammeMonth(full.year_index)) {
    const unlock = await getYearUnlockState(user.id, full.year_index);
    if (!unlock.available) {
      return fail(yearUnlockMessage(unlock));
    }
  }

  const { data: inProgress } = await supabase
    .from("exam_attempts")
    .select("id, status, attempt_token")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    .eq("status", "in_progress")
    .maybeSingle();

  if (inProgress) {
    return {
      ok: true,
      message: "Resuming your attempt.",
      attemptId: inProgress.id,
      token: inProgress.attempt_token,
    };
  }

  const { data: prior } = await supabase
    .from("exam_attempts")
    .select("id, status")
    .eq("exam_id", examId)
    .eq("user_id", user.id)
    .neq("status", "in_progress")
    .limit(1)
    .maybeSingle();

  if (prior) {
    return fail("You have already submitted this exam.");
  }

  const questions = await loadQuestions(examId);
  const maxScore = questions.reduce((s, q) => s + Number(q.points), 0);

  const { data, error } = await supabase
    .from("exam_attempts")
    .insert({
      exam_id: examId,
      user_id: user.id,
      status: "in_progress",
      max_score: maxScore,
    })
    .select("id, attempt_token")
    .single();

  if (error) {
    console.error("[exam] startStudentAttempt", error);
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return fail("You already have an attempt for this exam.");
    }
    return fail(error.message, "Could not start the exam. Please try again.");
  }
  revalidatePath(`/student/exams/${full.slug}`);
  return {
    ok: true,
    message: "Attempt started. Good luck.",
    attemptId: data.id,
    token: data.attempt_token,
  };
}

export async function startOpenAttempt(
  slug: string,
  candidate: ExamCandidate,
): Promise<TakeActionResult> {
  const exam = await loadExamBySlug(slug);
  if (!exam || exam.audience !== "open" || !examIsOpen(exam)) {
    return fail("This exam is not open.");
  }

  const name = candidate.full_name?.trim() ?? "";
  const email = candidate.email?.trim().toLowerCase() ?? "";
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Name and a valid email are required.");
  }

  const service = createServiceSupabaseClient();

  // Resume an in-progress attempt for this email, or block if already submitted.
  const { data: priorRows, error: priorError } = await service
    .from("exam_attempts")
    .select("id, status, attempt_token, started_at")
    .eq("exam_id", exam.id)
    .is("user_id", null)
    .filter("candidate->>email", "eq", email)
    .order("started_at", { ascending: false })
    .limit(5);

  if (priorError) {
    console.error("[exam] open prior lookup", priorError);
  }

  const inProgress = (priorRows ?? []).find((row) => row.status === "in_progress");
  if (inProgress) {
    await setOpenAttemptCookie(slug, inProgress.attempt_token, exam.duration_minutes);
    return {
      ok: true,
      message: "Resuming your attempt.",
      attemptId: inProgress.id,
      token: inProgress.attempt_token,
    };
  }

  const completed = (priorRows ?? []).find(
    (row) => row.status !== "in_progress",
  );
  if (completed) {
    return fail(
      "This email has already submitted this exam. Contact the exams desk if you need help.",
    );
  }

  const questions = await loadQuestions(exam.id);
  const maxScore = questions.reduce((s, q) => s + Number(q.points), 0);

  const { data, error } = await service
    .from("exam_attempts")
    .insert({
      exam_id: exam.id,
      candidate: {
        full_name: name,
        email,
        phone: candidate.phone?.trim() || undefined,
        church: candidate.church?.trim() || undefined,
      },
      status: "in_progress",
      max_score: maxScore,
    })
    .select("id, attempt_token")
    .single();

  if (error) {
    console.error("[exam] startOpenAttempt", error);
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      return fail(
        "This email has already started or submitted this exam.",
      );
    }
    return fail(error.message, "Could not start the exam. Please try again.");
  }

  await setOpenAttemptCookie(slug, data.attempt_token, exam.duration_minutes);

  return {
    ok: true,
    message: "You may begin.",
    attemptId: data.id,
    token: data.attempt_token,
  };
}

export async function getOpenAttemptBundle(slug: string): Promise<{
  exam: Exam;
  questions: ExamQuestion[];
  attempt: ExamAttempt;
  answers: ExamAnswer[];
} | null> {
  const exam = await loadExamBySlug(slug);
  if (!exam || exam.audience !== "open") return null;

  const jar = await cookies();
  const token = jar.get(OPEN_ATTEMPT_COOKIE)?.value;
  if (!token) return null;

  const service = createServiceSupabaseClient();
  const { data: attempt } = await service
    .from("exam_attempts")
    .select("*")
    .eq("attempt_token", token)
    .eq("exam_id", exam.id)
    .maybeSingle();
  if (!attempt) return null;

  const questions = await loadQuestions(exam.id);
  const { data: ans } = await service
    .from("exam_answers")
    .select("id, attempt_id, question_id, response, updated_at")
    .eq("attempt_id", attempt.id);

  const typed = attempt as ExamAttempt;
  const revealFinal =
    exam.visitor_reveal_score && attemptHasFinalScore(typed);

  return {
    exam,
    questions: stripAnswerKeys(questions),
    attempt: publicFacingAttempt(typed, revealFinal),
    answers: stripAnswerScores(
      (ans ?? []).map((row) => ({
        ...row,
        auto_points: null,
        manual_points: null,
        grader_note: null,
      })) as ExamAnswer[],
    ),
  };
}

export async function saveAttemptAnswer(input: {
  attemptId: string;
  questionId: string;
  response: Record<string, unknown>;
  token?: string;
}): Promise<TakeActionResult> {
  const service = createServiceSupabaseClient();
  const { data: attempt } = await service
    .from("exam_attempts")
    .select("*")
    .eq("id", input.attemptId)
    .maybeSingle();
  if (!attempt || attempt.status !== "in_progress") {
    return fail("Attempt is locked.");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const jar = await cookies();
  const cookieToken = jar.get(OPEN_ATTEMPT_COOKIE)?.value;
  const allowed =
    (user && attempt.user_id === user.id) ||
    (cookieToken && cookieToken === attempt.attempt_token) ||
    (input.token && input.token === attempt.attempt_token);
  if (!allowed) return fail("Unauthorized.");

  const { data: exam } = await service
    .from("exams")
    .select("duration_minutes")
    .eq("id", attempt.exam_id)
    .single();
  const ends =
    new Date(attempt.started_at).getTime() +
    (exam?.duration_minutes ?? 60) * 60_000;
  if (Date.now() > ends + 15_000) {
    return fail("Time is up.");
  }

  const { data: question } = await service
    .from("exam_questions")
    .select("*")
    .eq("id", input.questionId)
    .eq("exam_id", attempt.exam_id)
    .maybeSingle();
  if (!question) return fail("Question not found.");

  const q = {
    ...question,
    points: Number(question.points),
    payload: question.payload ?? {},
  } as ExamQuestion;
  const auto = autoScoreAnswer(q, input.response);

  const { error } = await service.from("exam_answers").upsert(
    {
      attempt_id: input.attemptId,
      question_id: input.questionId,
      response: input.response,
      auto_points: auto,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "attempt_id,question_id" },
  );

  if (error) {
    console.error("[exam] saveAttemptAnswer", error);
    return fail(error.message, "Could not save your answer. Please try again.");
  }
  return { ok: true, message: "Saved." };
}

export async function submitAttempt(
  attemptId: string,
  token?: string,
): Promise<TakeActionResult> {
  const service = createServiceSupabaseClient();
  const { data: attempt } = await service
    .from("exam_attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || attempt.status !== "in_progress") {
    return fail("Nothing to submit.");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const jar = await cookies();
  const cookieToken = jar.get(OPEN_ATTEMPT_COOKIE)?.value;
  const allowed =
    (user && attempt.user_id === user.id) ||
    (cookieToken && cookieToken === attempt.attempt_token) ||
    (token && token === attempt.attempt_token);
  if (!allowed) return fail("Unauthorized.");

  const questions = await loadQuestions(attempt.exam_id);
  const { data: answers } = await service
    .from("exam_answers")
    .select("*")
    .eq("attempt_id", attemptId);

  for (const q of questions) {
    if (needsManualGrade(q)) continue;
    const ans = (answers ?? []).find((a) => a.question_id === q.id);
    const auto = autoScoreAnswer(
      q,
      (ans?.response as Record<string, unknown>) ?? null,
    );
    if (ans) {
      await service
        .from("exam_answers")
        .update({ auto_points: auto })
        .eq("id", ans.id);
    }
  }

  const { data: refreshed } = await service
    .from("exam_answers")
    .select("*")
    .eq("attempt_id", attemptId);

  const totals = computeAttemptTotals(
    questions,
    (refreshed ?? []) as ExamAnswer[],
  );

  const status = totals.allManualDone ? "graded" : "submitted";

  const { error } = await service
    .from("exam_attempts")
    .update({
      status,
      submitted_at: new Date().toISOString(),
      auto_score: totals.autoScore,
      manual_score: totals.manualScore,
      total_score: totals.totalScore,
      max_score: totals.maxScore,
      percent: totals.percent,
      graded_at: status === "graded" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", attemptId);

  if (error) {
    console.error("[exam] submitAttempt", error);
    return fail(error.message, "Could not submit. Please try again.");
  }

  const { data: exam } = await service
    .from("exams")
    .select(
      "slug, audience, title, pass_percent, visitor_reveal_score, visitor_email_scorecard",
    )
    .eq("id", attempt.exam_id)
    .single();

  if (exam?.audience === "student" && exam.slug) {
    revalidatePath(`/student/exams/${exam.slug}`);
  }
  revalidatePath("/admin/exams");

  // Open exams: auto-email certificate when final score is ready and settings allow.
  if (
    exam?.audience === "open" &&
    exam.visitor_reveal_score &&
    exam.visitor_email_scorecard &&
    status === "graded" &&
    totals.percent != null
  ) {
    const candidate = attempt.candidate as ExamCandidate | null;
    if (candidate?.email) {
      const mailed = await sendAttemptCertificateEmail({
        exam: {
          title: exam.title,
          slug: exam.slug,
          pass_percent: Number(exam.pass_percent),
          audience: "open",
        },
        attempt: {
          ...(attempt as ExamAttempt),
          status: "graded",
          percent: totals.percent,
          total_score: totals.totalScore,
          max_score: totals.maxScore,
          submitted_at: new Date().toISOString(),
        },
        candidate,
      });
      if (!mailed.ok) {
        console.error("[exam] auto certificate email", mailed.message);
      }
    }
  }

  return {
    ok: true,
    message: totals.allManualDone
      ? "Submitted. Auto-scored."
      : "Submitted. Awaiting manual grading.",
    attemptId,
  };
}

export async function requestOpenExamCertificateEmail(
  slug: string,
): Promise<TakeActionResult> {
  const exam = await loadExamBySlug(slug);
  if (!exam || exam.audience !== "open") {
    return fail("Exam not found.");
  }
  if (!exam.visitor_reveal_score) {
    return fail("This exam does not share final scores with candidates.");
  }
  if (!exam.visitor_email_scorecard) {
    return fail("Certificate email is not enabled for this exam.");
  }

  const jar = await cookies();
  const token = jar.get(OPEN_ATTEMPT_COOKIE)?.value;
  if (!token) {
    return fail("No attempt found for this browser. Use the same device you sat the exam on.");
  }

  const service = createServiceSupabaseClient();
  const { data: attempt } = await service
    .from("exam_attempts")
    .select("*")
    .eq("attempt_token", token)
    .eq("exam_id", exam.id)
    .maybeSingle();

  if (!attempt) return fail("Attempt not found.");
  if (!attemptHasFinalScore(attempt as ExamAttempt)) {
    return fail("Your final score is not ready yet. Please check back after grading.");
  }

  const candidate = attempt.candidate as ExamCandidate | null;
  if (!candidate?.email) {
    return fail("No email on file for this attempt.");
  }

  const mailed = await sendAttemptCertificateEmail({
    exam,
    attempt: attempt as ExamAttempt,
    candidate,
  });

  return mailed.ok
    ? { ok: true, message: mailed.message }
    : fail(mailed.message);
}

export async function listStudentExams(): Promise<StudentExamListItem[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: exams } = await supabase
    .from("exams")
    .select("*")
    .eq("audience", "student")
    .in("status", ["published", "closed"])
    .order("updated_at", { ascending: false });

  const rows = (exams ?? []).map((e) => ({
    ...(e as Exam),
    pass_percent: Number(e.pass_percent),
    year_index:
      (e as { year_index?: number | null }).year_index != null
        ? Number((e as { year_index?: number | null }).year_index)
        : null,
  }));
  if (!rows.length) return [];

  const { data: attempts } = await supabase
    .from("exam_attempts")
    .select("exam_id, status, started_at")
    .eq("user_id", user.id)
    .in(
      "exam_id",
      rows.map((e) => e.id),
    )
    .order("started_at", { ascending: false });

  const latest = new Map<string, string>();
  for (const a of attempts ?? []) {
    if (!latest.has(a.exam_id)) latest.set(a.exam_id, a.status);
  }

  const yearIndexes = [
    ...new Set(
      rows
        .map((e) => e.year_index)
        .filter((y): y is number => isProgrammeMonth(y)),
    ),
  ];
  const unlockByYear = new Map<number, YearUnlockState>();
  await Promise.all(
    yearIndexes.map(async (y) => {
      unlockByYear.set(y, await getYearUnlockState(user.id, y));
    }),
  );

  return rows.map((e) => {
    const unlock =
      isProgrammeMonth(e.year_index) && unlockByYear.has(e.year_index)
        ? unlockByYear.get(e.year_index)!
        : null;
    return {
      ...e,
      attempt_status: latest.get(e.id) ?? null,
      unlock,
      unlock_message: unlock && !unlock.available ? yearUnlockMessage(unlock) : null,
    };
  });
}
