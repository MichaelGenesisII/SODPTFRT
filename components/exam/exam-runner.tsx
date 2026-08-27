"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  saveAttemptAnswer,
  submitAttempt,
  type TakeActionResult,
} from "@/app/exam/actions";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import type {
  Exam,
  ExamAnswer,
  ExamAttempt,
  ExamQuestion,
  McqPayload,
} from "@/lib/exams/types";

type Props = {
  exam: Exam;
  questions: ExamQuestion[];
  attempt: ExamAttempt;
  initialAnswers: ExamAnswer[];
  onSubmitted?: () => void;
};

function draftKey(attemptId: string) {
  return `sod_exam_draft_${attemptId}`;
}

function readLocalDraft(
  attemptId: string,
): Record<string, Record<string, unknown>> | null {
  try {
    const raw = window.localStorage.getItem(draftKey(attemptId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      answers?: Record<string, Record<string, unknown>>;
    };
    return parsed.answers ?? null;
  } catch {
    return null;
  }
}

function writeLocalDraft(
  attemptId: string,
  answers: Record<string, Record<string, unknown>>,
) {
  try {
    window.localStorage.setItem(
      draftKey(attemptId),
      JSON.stringify({ answers, savedAt: Date.now() }),
    );
  } catch {
    // Quota / private mode — server autosave remains primary.
  }
}

function clearLocalDraft(attemptId: string) {
  try {
    window.localStorage.removeItem(draftKey(attemptId));
  } catch {
    // ignore
  }
}

function mergeAnswers(
  server: Record<string, Record<string, unknown>>,
  local: Record<string, Record<string, unknown>> | null,
): Record<string, Record<string, unknown>> {
  if (!local) return server;
  const next = { ...server };
  for (const [qid, response] of Object.entries(local)) {
    const existing = next[qid];
    const localHas = Object.values(response).some(
      (v) =>
        v !== null &&
        v !== undefined &&
        v !== "" &&
        !(Array.isArray(v) && v.length === 0),
    );
    const serverHas = existing
      ? Object.values(existing).some(
          (v) =>
            v !== null &&
            v !== undefined &&
            v !== "" &&
            !(Array.isArray(v) && v.length === 0),
        )
      : false;
    if (localHas && !serverHas) next[qid] = response;
    else if (localHas && serverHas) next[qid] = { ...existing, ...response };
  }
  return next;
}

export function ExamRunner({
  exam,
  questions,
  attempt,
  initialAnswers,
  onSubmitted,
}: Props) {
  const [index, setIndex] = useState(0);
  const [, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const submitting = Boolean(busyLabel?.startsWith("Submitting"));
  const [message, setMessage] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>(
    () => {
      const map: Record<string, Record<string, unknown>> = {};
      for (const a of initialAnswers) {
        map[a.question_id] = (a.response as Record<string, unknown>) ?? {};
      }
      return map;
    },
  );

  useEffect(() => {
    const local = readLocalDraft(attempt.id);
    if (!local) return;
    setAnswers((prev) => mergeAnswers(prev, local));
  }, [attempt.id]);

  const endsAt = useMemo(
    () =>
      new Date(attempt.started_at).getTime() + exam.duration_minutes * 60_000,
    [attempt.started_at, exam.duration_minutes],
  );
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = Math.max(0, endsAt - now);
  const expired = remainingMs <= 0;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const question = questions[index];
  const progress = questions.length
    ? ((index + 1) / questions.length) * 100
    : 0;
  const answeredCount = questions.filter((q) => {
    const response = answers[q.id];
    if (!response) return false;
    return Object.values(response).some(
      (value) =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        !(Array.isArray(value) && value.length === 0),
    );
  }).length;

  const persist = useEffectEvent(
    (questionId: string, response: Record<string, unknown>) => {
      startTransition(async () => {
        const result = await saveAttemptAnswer({
          attemptId: attempt.id,
          questionId,
          response,
          token: attempt.attempt_token,
        });
        if (!result.ok) {
          setMessage(result.message);
          setSaveHint("Saved on this device — will retry when online.");
        } else {
          setSaveHint(null);
        }
      });
    },
  );

  const flushAll = useEffectEvent(async () => {
    const entries = Object.entries(answers);
    for (const [questionId, response] of entries) {
      await saveAttemptAnswer({
        attemptId: attempt.id,
        questionId,
        response,
        token: attempt.attempt_token,
      });
    }
  });

  useEffect(() => {
    function onOnline() {
      void flushAll().then(() => setSaveHint(null));
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushAll]);

  function setResponse(patch: Record<string, unknown>) {
    if (!question || expired) return;
    const next = { ...(answers[question.id] ?? {}), ...patch };
    setAnswers((prev) => {
      const merged = { ...prev, [question.id]: next };
      writeLocalDraft(attempt.id, merged);
      return merged;
    });
    persist(question.id, next);
  }

  function doSubmit() {
    setBusyLabel("Submitting exam…");
    startTransition(async () => {
      try {
        await flushAll();
        const result: TakeActionResult = await submitAttempt(
          attempt.id,
          attempt.attempt_token,
        );
        setMessage(result.message);
        if (result.ok) {
          clearLocalDraft(attempt.id);
          onSubmitted?.();
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  useEffect(() => {
    if (!expired || attempt.status !== "in_progress") return;
    doSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- auto-submit once when time ends
  }, [expired]);

  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);

  if (!question) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-pine text-mist">
        <p>No questions on this exam.</p>
      </div>
    );
  }

  return (
    <div
      className="exam-runner relative flex min-h-dvh flex-col overflow-hidden bg-[radial-gradient(120%_80%_at_10%_0%,#1f4a3c_0%,#14352c_45%,#0f2820_100%)] text-mist"
      aria-busy={submitting}
    >
      <DeskLoaderOverlay
        active={submitting}
        label={busyLabel ?? "Submitting exam…"}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
        }}
        aria-hidden
      />

      <header className="relative z-10 flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <div className="min-w-0">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-celadon">
            School of Disciples
          </p>
          <h1 className="mt-1 truncate font-display text-xl tracking-[-0.02em] sm:text-2xl">
            {exam.title}
          </h1>
        </div>
        <div
          className={`shrink-0 rounded-full border px-4 py-2 font-mono text-lg tabular-nums ${
            remainingMs < 60_000
              ? "border-red-300/40 bg-red-950/40 text-red-100 animate-pulse"
              : "border-white/15 bg-white/5 text-mist"
          }`}
          aria-live="polite"
        >
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </div>
      </header>

      <div className="relative z-10 mx-4 h-1 overflow-hidden rounded-full bg-white/10 sm:mx-8">
        <div
          className="h-full bg-celadon transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-8">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon/90">
          Question {index + 1} of {questions.length}
          <span className="ml-2 text-mist/40 normal-case tracking-normal">
            · {answeredCount} answered
          </span>
        </p>
        <div
          key={question.id}
          className="animate-fade-rise mt-4 rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-sm sm:p-8"
        >
          <p className="font-display text-[clamp(1.35rem,3.5vw,1.85rem)] leading-snug tracking-[-0.02em]">
            {question.prompt}
          </p>
          <p className="mt-2 text-xs text-mist/50">{question.points} points</p>

          <div className="mt-6">
            <QuestionInput
              question={question}
              value={answers[question.id] ?? {}}
              disabled={
                expired || submitting || attempt.status !== "in_progress"
              }
              onChange={setResponse}
            />
          </div>
        </div>

        {message ? (
          <p className="mt-4 text-center text-sm text-celadon">{message}</p>
        ) : null}
        {saveHint ? (
          <p className="mt-2 text-center text-xs text-mist/55">{saveHint}</p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-8">
          <button
            type="button"
            disabled={index === 0 || submitting}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            className="border border-white/20 px-4 py-2.5 text-sm font-medium text-mist/90 transition hover:border-white/50 disabled:opacity-30"
          >
            Previous
          </button>
          <div className="flex gap-2">
            {index < questions.length - 1 ? (
              <button
                type="button"
                disabled={submitting}
                onClick={() =>
                  setIndex((i) => Math.min(questions.length - 1, i + 1))
                }
                className="bg-mist px-5 py-2.5 text-sm font-medium text-pine transition hover:bg-white disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || attempt.status !== "in_progress"}
                onClick={doSubmit}
                className="bg-celadon px-5 py-2.5 text-sm font-medium text-pine transition hover:brightness-110 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit exam"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function QuestionInput({
  question,
  value,
  disabled,
  onChange,
}: {
  question: ExamQuestion;
  value: Record<string, unknown>;
  disabled: boolean;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  if (question.type === "multiple_choice") {
    const payload = question.payload as McqPayload;
    const options = payload.options ?? [];
    const multi = Boolean(payload.multi);
    const selected = Array.isArray(value.selected)
      ? (value.selected as string[])
      : typeof value.selected === "string"
        ? [value.selected]
        : [];

    return (
      <ul className="space-y-2">
        {options.map((opt) => {
          const active = selected.includes(opt.key);
          return (
            <li key={opt.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (multi) {
                    const next = active
                      ? selected.filter((k) => k !== opt.key)
                      : [...selected, opt.key];
                    onChange({ selected: next });
                  } else {
                    onChange({ selected: opt.key });
                  }
                }}
                className={`flex w-full items-start gap-3 border px-4 py-3 text-left text-sm transition ${
                  active
                    ? "border-celadon bg-celadon/15 text-mist"
                    : "border-white/15 bg-white/[0.03] hover:border-white/35"
                } disabled:opacity-50`}
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center border border-current/40 font-mono text-xs">
                  {opt.key}
                </span>
                <span>{opt.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  if (question.type === "true_false") {
    const current = value.value;
    return (
      <div className="grid grid-cols-2 gap-3">
        {[true, false].map((flag) => (
          <button
            key={String(flag)}
            type="button"
            disabled={disabled}
            onClick={() => onChange({ value: flag })}
            className={`border px-4 py-6 text-center font-display text-xl transition ${
              current === flag
                ? "border-celadon bg-celadon/20"
                : "border-white/15 hover:border-white/40"
            } disabled:opacity-50`}
          >
            {flag ? "True" : "False"}
          </button>
        ))}
      </div>
    );
  }

  const rows = question.type === "long_answer" ? 8 : 3;
  return (
    <textarea
      disabled={disabled}
      rows={rows}
      value={String(value.text ?? "")}
      onChange={(e) => onChange({ text: e.target.value })}
      placeholder="Write your answer…"
      className="w-full border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-mist outline-none placeholder:text-mist/35 focus:border-celadon disabled:opacity-50"
    />
  );
}
