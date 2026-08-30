"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  getOpenAttemptBundle,
  startOpenAttempt,
  type StudentProvisionalResult,
  type TakeActionResult,
} from "@/app/exam/actions";
import { ExamRunner } from "@/components/exam/exam-runner";
import { publicActionMessage } from "@/lib/safe-action-message";
import { attemptHasFinalScore } from "@/lib/exams/attempt-status";
import { passedExam } from "@/lib/exams/score";
import type {
  Exam,
  ExamAnswer,
  ExamAttempt,
  ExamQuestion,
} from "@/lib/exams/types";

type Bundle = {
  exam: Exam;
  questions: ExamQuestion[];
  attempt: ExamAttempt;
  answers: ExamAnswer[];
  retakesRemaining: number;
  canRetake: boolean;
};

export function OpenExamClient({
  slug,
  exam,
  questionCount,
}: {
  slug: string;
  exam: Exam;
  questionCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [church, setChurch] = useState("");
  const [done, setDone] = useState(false);
  const [provisional, setProvisional] = useState<StudentProvisionalResult | null>(
    null,
  );

  useEffect(() => {
    void getOpenAttemptBundle(slug).then((next) => {
      if (next) {
        if (next.attempt.status !== "in_progress") setDone(true);
        setBundle(next);
        const candidate = next.attempt.candidate;
        if (candidate?.full_name) setName(candidate.full_name);
        if (candidate?.email) setEmail(candidate.email);
        if (candidate?.phone) setPhone(candidate.phone);
        if (candidate?.church) setChurch(candidate.church);
      }
    });
  }, [slug]);

  function begin() {
    startTransition(async () => {
      const result = await startOpenAttempt(slug, {
        full_name: name,
        email,
        phone,
        church,
      });
      if (!result.ok) {
        setError(
          publicActionMessage(
            result.message,
            "Could not start the exam. Please try again.",
          ),
        );
        return;
      }
      const next = await getOpenAttemptBundle(slug);
      if (next) {
        setDone(false);
        setProvisional(null);
        setBundle(next);
      } else setError("Could not load your attempt.");
    });
  }

  if (done || (bundle && bundle.attempt.status !== "in_progress")) {
    const attempt = bundle?.attempt;
    const candidate = attempt?.candidate;
    const reveal = exam.visitor_reveal_score;
    const finalReady = attempt ? attemptHasFinalScore(attempt) : false;
    const awaitingGrade = attempt?.status === "submitted";
    const percent =
      reveal && finalReady && attempt?.percent != null
        ? Number(attempt.percent)
        : reveal && provisional
          ? provisional.autoPercent
          : null;
    const passed =
      percent != null
        ? finalReady
          ? passedExam(percent, Number(exam.pass_percent))
          : provisional?.autoPassed ?? null
        : null;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(100%_80%_at_50%_0%,#1f4a3c,#0f2820)] px-4 py-12 sm:px-6">
        <div className="w-full max-w-xl space-y-4">
          <div className="border border-mist/15 bg-white/[0.04] px-6 py-10 text-center text-mist backdrop-blur-sm">
            <p className="text-[0.7rem] uppercase tracking-[0.2em] text-celadon">
              {!reveal
                ? "Submitted"
                : finalReady
                  ? "Result"
                  : awaitingGrade
                    ? "Auto-marked result"
                    : "Submitted"}
            </p>
            <h1 className="mt-3 font-display text-3xl tracking-[-0.02em]">
              {exam.title}
            </h1>
            {reveal && percent != null ? (
              <>
                <p className="mt-6 font-display text-5xl tabular-nums text-mist">
                  {percent}%
                </p>
                {passed != null ? (
                  <p
                    className={`mt-2 text-sm font-medium ${
                      passed ? "text-celadon" : "text-red-200"
                    }`}
                  >
                    {passed ? "Pass" : "Fail"}
                    <span className="font-normal text-mist/50">
                      {" "}
                      · pass mark {exam.pass_percent}%
                    </span>
                  </p>
                ) : null}
                <p className="mt-4 text-sm leading-relaxed text-mist/70">
                  {finalReady
                    ? candidate?.full_name
                      ? `Recorded for ${candidate.full_name}.`
                      : "Your final score is ready."
                    : "Score on auto-marked questions only. Written answers are with the exams desk."}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm leading-relaxed text-mist/70">
                Thank you. Your answers are with the exams desk.
                {candidate?.full_name
                  ? ` We recorded this sitting for ${candidate.full_name}.`
                  : ""}
              </p>
            )}
          </div>

          {bundle?.canRetake ? (
            <div className="border border-celadon/30 bg-celadon/10 px-5 py-5 text-center text-mist">
              <p className="text-sm text-mist/80">
                You have {bundle.retakesRemaining} retake left.
              </p>
              {error ? (
                <p className="mt-2 text-sm text-red-200" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setDone(false);
                  setBundle(null);
                  setError(null);
                }}
                className="mt-3 bg-mist px-5 py-3 text-sm font-medium text-pine disabled:opacity-50"
              >
                Use retake
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (bundle && bundle.attempt.status === "in_progress") {
    return (
      <ExamRunner
        exam={bundle.exam}
        questions={bundle.questions}
        attempt={bundle.attempt}
        initialAnswers={bundle.answers}
        onSubmitted={(result?: TakeActionResult) => {
          if (result?.provisional) setProvisional(result.provisional);
          setDone(true);
          void getOpenAttemptBundle(slug).then((next) => {
            if (next) setBundle(next);
          });
          router.refresh();
        }}
      />
    );
  }

  const windowClosed =
    exam.status !== "published" ||
    (exam.opens_at && new Date(exam.opens_at).getTime() > Date.now()) ||
    (exam.closes_at && new Date(exam.closes_at).getTime() < Date.now());

  return (
    <div className="relative flex min-h-dvh flex-col justify-center overflow-hidden bg-[radial-gradient(120%_90%_at_80%_10%,#2a5c4a_0%,#14352c_50%,#0c221b_100%)] px-4 py-16 text-mist">
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-celadon/10 to-transparent" />
      <div className="relative z-10 mx-auto w-full max-w-lg">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-celadon">
          Open assessment
        </p>
        <h1 className="mt-3 font-display text-[clamp(2rem,6vw,2.75rem)] tracking-[-0.03em]">
          {exam.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-mist/70">
          {exam.instructions ||
            "Fill in your details, then take the timed exam. No account needed. You get one retake if you need it."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-mist/45">
          <span className="border border-mist/15 px-2.5 py-1">
            {questionCount} questions
          </span>
          <span className="border border-mist/15 px-2.5 py-1">
            {exam.duration_minutes} minutes
          </span>
          <span className="border border-mist/15 px-2.5 py-1">
            Pass {exam.pass_percent}%
          </span>
          <span className="border border-mist/15 px-2.5 py-1">1 retake</span>
        </div>

        <form
          className="mt-8 space-y-3 border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm"
          onSubmit={(e) => {
            e.preventDefault();
            begin();
          }}
        >
          <label className="block text-sm">
            Full name
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-celadon"
            />
          </label>
          <label className="block text-sm">
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-celadon"
            />
          </label>
          <label className="block text-sm">
            Phone (optional)
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-celadon"
            />
          </label>
          <label className="block text-sm">
            Church / parish (optional)
            <input
              value={church}
              onChange={(e) => setChurch(e.target.value)}
              className="mt-1 w-full border border-white/15 bg-white/5 px-3 py-2.5 text-sm outline-none focus:border-celadon"
            />
          </label>
          {error ? (
            <p className="text-sm text-red-200" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending || Boolean(windowClosed)}
            className="mt-2 w-full bg-mist px-4 py-3 text-sm font-medium text-pine transition hover:bg-white disabled:opacity-50"
          >
            {pending
              ? "Starting…"
              : windowClosed
                ? "Exam not open"
                : "Begin exam"}
          </button>
        </form>
      </div>
    </div>
  );
}
