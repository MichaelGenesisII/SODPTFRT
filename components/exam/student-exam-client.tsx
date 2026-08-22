"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startStudentAttempt } from "@/app/exam/actions";
import { ExamResultCertificate } from "@/components/exam/exam-result-certificate";
import { ExamRunner } from "@/components/exam/exam-runner";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { publicActionMessage } from "@/lib/safe-action-message";
import { attemptHasFinalScore } from "@/lib/exams/attempt-status";
import { passedExam } from "@/lib/exams/score";
import type {
  Exam,
  ExamAnswer,
  ExamAttempt,
  ExamQuestion,
} from "@/lib/exams/types";

export function StudentExamClient({
  slug,
  exam,
  questions,
  questionCount,
  attempt: initialAttempt,
  answers,
  studentName,
}: {
  slug: string;
  exam: Exam;
  questions: ExamQuestion[];
  questionCount: number;
  attempt: ExamAttempt | null;
  answers: ExamAnswer[];
  studentName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(initialAttempt);
  const [live, setLive] = useState(false);

  if (live && attempt && attempt.status === "in_progress") {
    return (
      <div className="fixed inset-0 z-[80]">
        <ExamRunner
          exam={exam}
          questions={questions}
          attempt={attempt}
          initialAnswers={answers}
          onSubmitted={() => {
            setLive(false);
            router.refresh();
          }}
        />
      </div>
    );
  }

  if (attempt && attempt.status === "in_progress") {
    return (
      <div className="mx-auto max-w-xl py-8 text-center">
        <p className="text-[0.7rem] uppercase tracking-[0.18em] text-celadon">
          In progress
        </p>
        <h1 className="mt-2 font-display text-3xl text-pine">{exam.title}</h1>
        <p className="mt-3 text-sm text-ink/65">
          You have an open attempt. Continue when ready — the timer keeps
          running from when you began.
        </p>
        <button
          type="button"
          onClick={() => setLive(true)}
          className="mt-6 bg-pine px-5 py-3 text-sm font-medium text-mist"
        >
          Continue exam
        </button>
      </div>
    );
  }

  if (attempt && attempt.status !== "in_progress") {
    const finalReady = attemptHasFinalScore(attempt);
    return (
      <div className="mx-auto max-w-xl space-y-6 py-8">
        {finalReady ? (
          <ExamResultCertificate
            title={exam.title}
            candidateName={studentName?.trim() || "Student"}
            attempt={attempt}
            passPercent={exam.pass_percent}
            passed={passedExam(
              Number(attempt.percent ?? 0),
              Number(exam.pass_percent),
            )}
            footnote={
              exam.counts_toward_record
                ? attempt.status === "released"
                  ? "This result has been released to your Records scorecard."
                  : "When released, this result can appear on your Records scorecard."
                : "This sitting does not count toward your Records scorecard."
            }
          />
        ) : (
          <div className="border border-stone bg-white/40 px-6 py-8">
            <p className="text-[0.7rem] uppercase tracking-[0.18em] text-celadon">
              {attempt.status === "submitted"
                ? "Awaiting grading"
                : attempt.status}
            </p>
            <h1 className="mt-2 font-display text-3xl text-pine">{exam.title}</h1>
            <p className="mt-3 text-sm text-ink/65">
              Your answers are with the exams desk. Your certificate will appear
              here when grading is complete.
            </p>
          </div>
        )}
        <Link
          href="/student/exams"
          className="inline-block text-sm font-medium text-pine underline"
        >
          Back to exams
        </Link>
      </div>
    );
  }

  const windowClosed =
    exam.status !== "published" ||
    (exam.opens_at && new Date(exam.opens_at).getTime() > Date.now()) ||
    (exam.closes_at && new Date(exam.closes_at).getTime() < Date.now());

  return (
    <div className="relative mx-auto max-w-xl py-8" aria-busy={busy}>
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
      <p className="text-[0.7rem] uppercase tracking-[0.18em] text-celadon">
        Ready when you are
      </p>
      <h1 className="mt-2 font-display text-3xl text-pine">{exam.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink/65">
        {exam.instructions ||
          "Once you begin, the timer starts. Answers autosave as you move."}
      </p>
      <ul className="mt-5 flex flex-wrap gap-2 text-xs font-medium uppercase tracking-[0.12em] text-ink/50">
        <li className="border border-stone px-2.5 py-1">
          {questionCount} questions
        </li>
        <li className="border border-stone px-2.5 py-1">
          {exam.duration_minutes} minutes
        </li>
        <li className="border border-stone px-2.5 py-1">
          Pass {exam.pass_percent}%
        </li>
        {exam.counts_toward_record ? (
          <li className="border border-celadon/30 bg-celadon/10 px-2.5 py-1 text-pine">
            Counts to records
          </li>
        ) : null}
      </ul>
      {error ? (
        <p className="mt-4 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy || Boolean(windowClosed)}
        onClick={() => {
          setBusyLabel("Starting exam…");
          startTransition(async () => {
            try {
              const result = await startStudentAttempt(exam.id);
              if (!result.ok) {
                setError(
                  publicActionMessage(
                    result.message,
                    "Could not start the exam. Please try again.",
                  ),
                );
                return;
              }
              router.refresh();
              setAttempt({
                id: result.attemptId!,
                exam_id: exam.id,
                user_id: null,
                candidate: null,
                attempt_token: result.token!,
                status: "in_progress",
                started_at: new Date().toISOString(),
                submitted_at: null,
                auto_score: 0,
                manual_score: 0,
                total_score: 0,
                max_score: 0,
                percent: null,
                graded_by: null,
                graded_at: null,
                released_at: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              setLive(true);
            } finally {
              setBusyLabel(null);
            }
          });
        }}
        className="mt-6 bg-pine px-5 py-3 text-sm font-medium text-mist disabled:opacity-50"
      >
        {busy ? "Starting…" : windowClosed ? "Exam not open" : "Begin exam"}
      </button>
    </div>
  );
}
