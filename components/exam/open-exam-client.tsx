"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  getOpenAttemptBundle,
  requestOpenExamCertificateEmail,
  startOpenAttempt,
} from "@/app/exam/actions";
import { ExamResultCertificate } from "@/components/exam/exam-result-certificate";
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
  const [emailPending, startEmailTransition] = useTransition();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [church, setChurch] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    void getOpenAttemptBundle(slug).then((next) => {
      if (next) {
        if (next.attempt.status !== "in_progress") setDone(true);
        setBundle(next);
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
      if (next) setBundle(next);
      else setError("Could not load your attempt.");
    });
  }

  function emailCertificate() {
    startEmailTransition(async () => {
      setEmailNote(null);
      const result = await requestOpenExamCertificateEmail(slug);
      setEmailNote(
        result.ok
          ? result.message
          : publicActionMessage(
              result.message,
              "Could not send the certificate. Please try again.",
            ),
      );
    });
  }

  if (done || (bundle && bundle.attempt.status !== "in_progress")) {
    const attempt = bundle?.attempt;
    const candidate = attempt?.candidate;
    const reveal = exam.visitor_reveal_score;
    const finalReady = attempt ? attemptHasFinalScore(attempt) : false;
    const awaitingGrade = attempt?.status === "submitted";

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(100%_80%_at_50%_0%,#1f4a3c,#0f2820)] px-4 py-12 sm:px-6">
        <div className="w-full max-w-xl">
          {!reveal ? (
            <div className="border border-mist/15 bg-white/[0.04] px-6 py-10 text-center text-mist backdrop-blur-sm">
              <p className="text-[0.7rem] uppercase tracking-[0.2em] text-celadon">
                Submitted
              </p>
              <h1 className="mt-3 font-display text-3xl tracking-[-0.02em]">
                {exam.title}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-mist/70">
                Thank you. Your answers are with the exams desk.
                {candidate?.full_name
                  ? ` We recorded this sitting for ${candidate.full_name}.`
                  : ""}
              </p>
            </div>
          ) : finalReady && attempt ? (
            <ExamResultCertificate
              tone="mist"
              title={exam.title}
              candidateName={
                candidate?.full_name?.trim() || "Candidate"
              }
              candidateEmail={candidate?.email}
              church={candidate?.church}
              attempt={attempt}
              passPercent={exam.pass_percent}
              passed={passedExam(
                Number(attempt.percent ?? 0),
                Number(exam.pass_percent),
              )}
              footnote={
                exam.visitor_email_scorecard
                  ? "A certificate can also be emailed to the address you used to begin."
                  : undefined
              }
              actions={
                exam.visitor_email_scorecard ? (
                  <button
                    type="button"
                    disabled={emailPending}
                    onClick={emailCertificate}
                    className="border border-mist/25 bg-mist/10 px-3 py-2 text-xs font-medium text-mist transition hover:bg-mist/20 disabled:opacity-50"
                  >
                    {emailPending ? "Sending…" : "Email my certificate"}
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="border border-mist/15 bg-white/[0.04] px-6 py-10 text-center text-mist backdrop-blur-sm">
              <p className="text-[0.7rem] uppercase tracking-[0.2em] text-celadon">
                {awaitingGrade ? "With the desk" : "Submitted"}
              </p>
              <h1 className="mt-3 font-display text-3xl tracking-[-0.02em]">
                {exam.title}
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-mist/70">
                {awaitingGrade
                  ? "Your paper needs a little marking. Return to this link on the same device — your certificate will appear here when the final score is ready."
                  : "Thank you. Your answers are with the exams desk."}
              </p>
            </div>
          )}
          {emailNote ? (
            <p
              className={`mt-4 text-center text-sm ${
                emailNote.toLowerCase().includes("could not") ||
                emailNote.toLowerCase().includes("not ready")
                  ? "text-red-200"
                  : "text-celadon"
              }`}
              role="status"
            >
              {emailNote}
            </p>
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
        onSubmitted={() => {
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
            "Fill in your details, then take the timed exam. No account needed."}
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
          {exam.visitor_reveal_score ? (
            <span className="border border-celadon/35 bg-celadon/10 px-2.5 py-1 text-celadon">
              Certificate on finish
            </span>
          ) : null}
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
