"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  startStudentAttempt,
  type StudentProvisionalResult,
  type TakeActionResult,
} from "@/app/exam/actions";
import { ExamRunner } from "@/components/exam/exam-runner";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { publicActionMessage } from "@/lib/safe-action-message";
import { attemptHasFinalScore } from "@/lib/exams/attempt-status";
import { passedExam } from "@/lib/exams/score";
import type { YearUnlockState } from "@/lib/exams/year-unlock";
import type {
  Exam,
  ExamAnswer,
  ExamAttempt,
  ExamQuestion,
} from "@/lib/exams/types";

function ResultCard({
  title,
  eyebrow,
  percent,
  passed,
  passPercent,
  detail,
}: {
  title: string;
  eyebrow: string;
  percent: number | null;
  passed: boolean | null;
  passPercent: number;
  detail: string;
}) {
  return (
    <div className="border border-stone bg-white/40 px-6 py-8 text-center">
      <p className="text-[0.7rem] uppercase tracking-[0.18em] text-celadon">
        {eyebrow}
      </p>
      <h1 className="mt-2 font-display text-3xl text-pine">{title}</h1>
      {percent != null ? (
        <>
          <p className="mt-6 font-display text-5xl tabular-nums text-pine">
            {percent}%
          </p>
          {passed != null ? (
            <p
              className={`mt-2 text-sm font-medium ${
                passed ? "text-pine" : "text-red-900"
              }`}
            >
              {passed ? "Pass" : "Fail"}
              <span className="font-normal text-ink/50">
                {" "}
                · pass mark {passPercent}%
              </span>
            </p>
          ) : null}
        </>
      ) : null}
      <p className="mt-4 text-sm leading-relaxed text-ink/65">{detail}</p>
    </div>
  );
}

export function StudentExamClient({
  slug,
  exam,
  questions,
  questionCount,
  attempt: initialAttempt,
  answers,
  unlock,
  unlockMessage,
  provisional: initialProvisional,
  canRetake,
  retakesRemaining,
}: {
  slug: string;
  exam: Exam;
  questions: ExamQuestion[];
  questionCount: number;
  attempt: ExamAttempt | null;
  answers: ExamAnswer[];
  studentName?: string;
  unlock?: YearUnlockState | null;
  unlockMessage?: string | null;
  provisional?: StudentProvisionalResult | null;
  canRetake?: boolean;
  retakesRemaining?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(initialAttempt);
  const [provisional, setProvisional] = useState(initialProvisional ?? null);
  const [live, setLive] = useState(false);

  function beginAttempt(label: string) {
    setBusyLabel(label);
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
        setProvisional(null);
        setLive(true);
      } finally {
        setBusyLabel(null);
      }
    });
  }

  if (live && attempt && attempt.status === "in_progress") {
    return (
      <div className="fixed inset-0 z-[80]">
        <ExamRunner
          exam={exam}
          questions={questions}
          attempt={attempt}
          initialAnswers={answers}
          onSubmitted={(result?: TakeActionResult) => {
            if (result?.provisional) setProvisional(result.provisional);
            setAttempt((prev) =>
              prev
                ? {
                    ...prev,
                    status:
                      (result?.attemptStatus as ExamAttempt["status"]) ??
                      "submitted",
                    percent:
                      result?.percent ??
                      result?.provisional?.autoPercent ??
                      prev.percent,
                    submitted_at: new Date().toISOString(),
                  }
                : prev,
            );
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
          running from when you began. Answers are saved as you go and restored
          if you lose connection.
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
    const percent =
      finalReady && attempt.percent != null
        ? Number(attempt.percent)
        : provisional?.autoPercent ?? null;
    const passed =
      percent != null
        ? finalReady
          ? passedExam(percent, Number(exam.pass_percent))
          : provisional?.autoPassed ?? null
        : null;

    return (
      <div className="relative mx-auto max-w-xl space-y-6 py-8" aria-busy={busy}>
        <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
        {finalReady ? (
          <ResultCard
            title={exam.title}
            eyebrow="Result"
            percent={percent}
            passed={passed}
            passPercent={exam.pass_percent}
            detail={
              exam.counts_toward_record
                ? attempt.status === "released"
                  ? "This result has been released to your Records scorecard."
                  : "When released, this result can appear on your Records scorecard."
                : "This sitting does not count toward your Records scorecard."
            }
          />
        ) : provisional ? (
          <ResultCard
            title={exam.title}
            eyebrow="Auto-marked result"
            percent={provisional.autoPercent}
            passed={provisional.autoPassed}
            passPercent={exam.pass_percent}
            detail="Score on auto-marked questions only. Written answers are with the exams desk. Answer keys are not shown."
          />
        ) : (
          <ResultCard
            title={exam.title}
            eyebrow={
              attempt.status === "submitted" ? "Awaiting grading" : attempt.status
            }
            percent={null}
            passed={null}
            passPercent={exam.pass_percent}
            detail="Your answers are with the exams desk. Your score will appear here when grading is complete."
          />
        )}

        {canRetake ? (
          <div className="border border-celadon/30 bg-celadon/10 px-4 py-4 text-center">
            <p className="text-sm text-ink/70">
              You have {retakesRemaining ?? 1} retake left for this exam.
            </p>
            {error ? (
              <p className="mt-2 text-sm text-red-800" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={() => beginAttempt("Starting retake…")}
              className="mt-3 bg-pine px-5 py-3 text-sm font-medium text-mist disabled:opacity-50"
            >
              {busy ? "Starting…" : "Start retake"}
            </button>
          </div>
        ) : null}

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

  const locked = Boolean(unlock && !unlock.available);

  return (
    <div className="relative mx-auto max-w-xl py-8" aria-busy={busy}>
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
      <p className="text-[0.7rem] uppercase tracking-[0.18em] text-celadon">
        {locked ? "Not available yet" : "Ready when you are"}
      </p>
      <h1 className="mt-2 font-display text-3xl text-pine">{exam.title}</h1>
      {exam.year_index != null ? (
        <p className="mt-1 text-xs uppercase tracking-[0.12em] text-ink/45">
          Exam Year {exam.year_index}
        </p>
      ) : null}
      <p className="mt-3 text-sm leading-relaxed text-ink/65">
        {locked
          ? unlockMessage || "This exam is not available yet."
          : exam.instructions ||
            "Once you begin, the timer starts. Answers autosave as you move. You get one retake if you need it."}
      </p>
      {!locked ? (
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
          <li className="border border-stone px-2.5 py-1">1 retake</li>
          {exam.counts_toward_record ? (
            <li className="border border-celadon/30 bg-celadon/10 px-2.5 py-1 text-pine">
              Counts to records
            </li>
          ) : null}
        </ul>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy || Boolean(windowClosed) || locked}
        onClick={() => beginAttempt("Starting exam…")}
        className="mt-6 bg-pine px-5 py-3 text-sm font-medium text-mist disabled:opacity-50"
      >
        {busy
          ? "Starting…"
          : locked
            ? "Locked"
            : windowClosed
              ? "Exam not open"
              : "Begin exam"}
      </button>
      {locked ? (
        <p className="mt-4 text-sm text-ink/55">
          Need help? Contact Admin to unlock attendance for this month.
        </p>
      ) : null}
    </div>
  );
}
