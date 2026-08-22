"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  getEvaluationDetail,
  listEvaluationAttempts,
  releaseAttempt,
  saveManualGrades,
  unreleaseAttempt,
  type EvaluationAttemptRow,
} from "@/app/admin/evaluation/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import { needsManualGrade } from "@/lib/exams/score";
import {
  ATTEMPT_STATUS_META,
  QUESTION_TYPE_META,
  type ExamAnswer,
  type ExamQuestion,
} from "@/lib/exams/types";

const PAGE_SIZE = 8;

type Lane = "needs" | "graded" | "released" | "open";
type MobileSurface = "directory" | "workspace";

export function EvaluationManager({
  initial,
}: {
  initial: EvaluationAttemptRow[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [rows, setRows] = useState(initial);
  const [lane, setLane] = useState<Lane>("needs");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileSurface, setMobileSurface] =
    useState<MobileSurface>("directory");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<{
    attempt: EvaluationAttemptRow;
    questions: ExamQuestion[];
    answers: ExamAnswer[];
  } | null>(null);

  useEffect(() => setRows(initial), [initial]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (lane === "needs") return r.status === "submitted";
      if (lane === "graded") return r.status === "graded";
      if (lane === "released") return r.status === "released";
      if (lane === "open") return r.exam_audience === "open";
      return true;
    });
  }, [rows, lane]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const directoryClass =
    mobileSurface === "directory" ? "block" : "hidden lg:block";
  const workspaceClass =
    mobileSurface === "workspace" ? "block" : "hidden lg:block";

  useEffect(() => {
    setPage(1);
    setMobileSurface("directory");
    setSelectedId(null);
  }, [lane]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void getEvaluationDetail(selectedId).then((next) => {
      if (!cancelled) setDetail(next);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const counts = useMemo(
    () => ({
      needs: rows.filter((r) => r.status === "submitted").length,
      graded: rows.filter((r) => r.status === "graded").length,
      released: rows.filter((r) => r.status === "released").length,
      open: rows.filter((r) => r.exam_audience === "open").length,
    }),
    [rows],
  );

  function runGrade(
    action: () => Promise<{ ok: boolean; message: string }>,
    label: string,
  ) {
    if (!detail) return;
    const attemptId = detail.attempt.id;
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          success(next.message, "Exams");
          const refreshed = await getEvaluationDetail(attemptId);
          setDetail(refreshed);
          const list = await listEvaluationAttempts();
          setRows(list);
          router.refresh();
        } else {
          error(next.message, "Exams");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      <nav className="flex gap-1 overflow-x-auto border-b border-stone pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(
          [
            { id: "needs" as const, label: "Needs grading", count: counts.needs },
            { id: "graded" as const, label: "Graded", count: counts.graded },
            { id: "released" as const, label: "Released", count: counts.released },
            { id: "open" as const, label: "Open-link", count: counts.open },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setLane(tab.id)}
            className={`relative shrink-0 px-3 py-1.5 text-sm font-medium ${
              lane === tab.id ? "text-pine" : "text-ink/50"
            }`}
          >
            {tab.label}
            <span className="ml-1.5 tabular-nums text-ink/35">{tab.count}</span>
            <span
              className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon ${
                lane === tab.id ? "opacity-100" : "opacity-0"
              }`}
            />
          </button>
        ))}
      </nav>

      <p className="text-xs text-ink/50">
        {filtered.length === 0
          ? "No attempts in this lane"
          : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filtered.length)} of ${filtered.length}`}
      </p>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className={`${directoryClass} border border-stone bg-mist/40`}>
          <ul className="max-h-[min(62vh,36rem)] divide-y divide-stone overflow-y-auto lg:max-h-[min(70vh,40rem)]">
            {pageRows.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-ink/50">
                Quiet queue.
              </li>
            ) : (
              pageRows.map((row) => {
                const active = row.id === selectedId;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(row.id);
                        setMobileSurface("workspace");
                      }}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left ${
                        active ? "bg-pine text-mist" : "hover:bg-white/60"
                      }`}
                    >
                      <span className="truncate text-sm font-medium">
                        {row.display_name}
                      </span>
                      <span
                        className={`truncate text-[0.7rem] ${
                          active ? "text-mist/70" : "text-ink/55"
                        }`}
                      >
                        {row.exam_title}
                      </span>
                      <span
                        className={`text-[0.6rem] uppercase tracking-[0.1em] ${
                          active ? "text-mist/55" : "text-ink/40"
                        }`}
                      >
                        {ATTEMPT_STATUS_META[row.status].label} ·{" "}
                        {row.exam_audience}
                        {row.percent != null ? ` · ${row.percent}%` : ""}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-stone px-3 py-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="border border-pine/25 px-2 py-1 text-xs text-pine disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-xs tabular-nums text-ink/55">
                {currentPage}/{totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="border border-pine/25 px-2 py-1 text-xs text-pine disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>

        <section
          className={`${workspaceClass} relative min-h-[16rem] border border-stone bg-mist sm:min-h-[22rem]`}
          aria-busy={busy}
        >
          <DeskLoaderOverlay
            active={busy}
            label={busyLabel ?? "Working…"}
          />
          {!detail ? (
            <div className="flex min-h-[16rem] items-center justify-center px-5 text-center sm:min-h-[22rem] sm:px-6">
              <div>
                <p className="font-display text-xl text-pine">Open a script</p>
                <p className="mt-2 text-sm text-ink/55">
                  Grade short and long answers, then release scores.
                </p>
              </div>
            </div>
          ) : (
            <GradeWorkspace
              detail={detail}
              pending={busy}
              busyLabel={busyLabel}
              onBack={() => setMobileSurface("directory")}
              onSave={(grades) => {
                runGrade(
                  () => saveManualGrades(detail.attempt.id, grades),
                  "Saving grades…",
                );
              }}
              onRelease={() => {
                runGrade(
                  () => releaseAttempt(detail.attempt.id),
                  "Releasing…",
                );
              }}
              onUnrelease={() => {
                runGrade(
                  () => unreleaseAttempt(detail.attempt.id),
                  "Pulling back release…",
                );
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function GradeWorkspace({
  detail,
  pending,
  busyLabel,
  onBack,
  onSave,
  onRelease,
  onUnrelease,
}: {
  detail: {
    attempt: EvaluationAttemptRow;
    questions: ExamQuestion[];
    answers: ExamAnswer[];
  };
  pending: boolean;
  busyLabel: string | null;
  onBack?: () => void;
  onSave: (
    grades: {
      questionId: string;
      manual_points: number;
      grader_note?: string;
    }[],
  ) => void;
  onRelease: () => void;
  onUnrelease: () => void;
}) {
  const answerMap = useMemo(() => {
    const m = new Map<string, ExamAnswer>();
    for (const a of detail.answers) m.set(a.question_id, a);
    return m;
  }, [detail.answers]);

  const [marks, setMarks] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextMarks: Record<string, string> = {};
    const nextNotes: Record<string, string> = {};
    for (const q of detail.questions) {
      const a = answerMap.get(q.id);
      if (a?.manual_points != null) nextMarks[q.id] = String(a.manual_points);
      if (a?.grader_note) nextNotes[q.id] = a.grader_note;
    }
    setMarks(nextMarks);
    setNotes(nextNotes);
  }, [detail.questions, answerMap]);

  const manualQs = detail.questions.filter((q) => needsManualGrade(q));

  return (
    <div className="animate-panel-in flex h-full flex-col">
      <header className="border-b border-stone px-3 py-4 sm:px-5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
          >
            <span aria-hidden>←</span> Queue
          </button>
        ) : null}
        <p className="text-[0.65rem] uppercase tracking-[0.14em] text-celadon">
          {detail.attempt.exam_title} · {detail.attempt.exam_audience}
        </p>
        <h2 className="mt-1 font-display text-xl text-pine sm:text-2xl">
          {detail.attempt.display_name}
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          {detail.attempt.display_email}
          {detail.attempt.percent != null
            ? ` · ${detail.attempt.percent}%`
            : ""}{" "}
          · {ATTEMPT_STATUS_META[detail.attempt.status].label}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {manualQs.length ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                onSave(
                  manualQs.map((q) => ({
                    questionId: q.id,
                    manual_points: Number(marks[q.id] ?? 0),
                    grader_note: notes[q.id],
                  })),
                )
              }
              className="inline-flex min-h-[2rem] min-w-[6.5rem] items-center justify-center bg-pine px-3 py-1.5 text-sm font-medium text-mist disabled:opacity-60"
            >
              {pending && busyLabel?.startsWith("Saving") ? (
                <DeskLoader label={busyLabel} tone="mist" />
              ) : (
                "Save grades"
              )}
            </button>
          ) : null}
          {detail.attempt.status !== "released" ? (
            <button
              type="button"
              disabled={pending}
              onClick={onRelease}
              className="inline-flex min-h-[2rem] min-w-[5rem] items-center justify-center border border-pine/30 px-3 py-1.5 text-sm font-medium text-pine disabled:opacity-60"
            >
              {pending && busyLabel?.startsWith("Releasing") ? (
                <DeskLoader label={busyLabel} />
              ) : (
                "Release"
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={onUnrelease}
              className="inline-flex min-h-[2rem] min-w-[8rem] items-center justify-center border border-stone px-3 py-1.5 text-sm font-medium text-ink/70 disabled:opacity-60"
            >
              {pending && busyLabel?.startsWith("Pulling") ? (
                <DeskLoader label={busyLabel} />
              ) : (
                "Pull back release"
              )}
            </button>
          )}
        </div>
      </header>

      <ul className="flex-1 divide-y divide-stone overflow-y-auto">
        {detail.questions.map((q, i) => {
          const ans = answerMap.get(q.id);
          const response = (ans?.response ?? {}) as Record<string, unknown>;
          const manual = needsManualGrade(q);
          return (
            <li key={q.id} className="px-4 py-4 sm:px-5">
              <p className="text-[0.65rem] uppercase tracking-[0.12em] text-celadon">
                Q{i + 1} · {QUESTION_TYPE_META[q.type].label} · {q.points} pts
              </p>
              <p className="mt-1 text-sm font-medium text-ink">{q.prompt}</p>
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <div className="border border-stone bg-white/50 px-3 py-2 text-sm text-ink/75">
                  <p className="text-[0.6rem] uppercase tracking-[0.12em] text-ink/40">
                    Response
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">
                    {formatResponse(q, response)}
                  </p>
                  {!manual && ans?.auto_points != null ? (
                    <p className="mt-2 text-xs text-ink/45">
                      Auto: {ans.auto_points}/{q.points}
                    </p>
                  ) : null}
                </div>
                {manual ? (
                  <div className="space-y-2">
                    <label className="block text-sm">
                      Points (max {q.points})
                      <input
                        type="number"
                        min={0}
                        max={q.points}
                        step={0.5}
                        value={marks[q.id] ?? ""}
                        onChange={(e) =>
                          setMarks((m) => ({ ...m, [q.id]: e.target.value }))
                        }
                        className="mt-1 w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine"
                      />
                    </label>
                    <label className="block text-sm">
                      Note
                      <textarea
                        rows={2}
                        value={notes[q.id] ?? ""}
                        onChange={(e) =>
                          setNotes((n) => ({ ...n, [q.id]: e.target.value }))
                        }
                        className="mt-1 w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="text-sm text-ink/45">Auto-scored</div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatResponse(
  q: ExamQuestion,
  response: Record<string, unknown>,
): string {
  if (q.type === "multiple_choice") {
    const sel = response.selected;
    return Array.isArray(sel)
      ? sel.join(", ")
      : typeof sel === "string"
        ? sel
        : "—";
  }
  if (q.type === "true_false") {
    if (typeof response.value === "boolean") {
      return response.value ? "True" : "False";
    }
    return "—";
  }
  return String(response.text ?? "—");
}
