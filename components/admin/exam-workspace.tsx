"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { DeskLoader } from "@/components/ui/desk-loader";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import {
  QUESTION_TYPE_META,
  type Exam,
  type ExamAudience,
  type ExamQuestion,
  type ExamQuestionType,
  type McqPayload,
} from "@/lib/exams/types";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";

const fieldClass =
  "w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

export type ExamMetaValues = {
  title: string;
  audience: ExamAudience;
  duration_minutes: number;
  pass_percent: number;
  counts_toward_record: boolean;
  visitor_reveal_score: boolean;
  visitor_email_scorecard: boolean;
  year_index: number | null;
  batch_id: string | null;
  instructions: string;
  opens_at: string | null;
  closes_at: string | null;
};

export function ExamMetaForm({
  profile,
  batches,
  pending,
  busyLabel,
  initial,
  onSubmit,
  onCancel,
  onBack,
}: {
  profile: AdminProfile;
  parishes?: Pick<Parish, "id" | "name" | "region">[];
  batches: Batch[];
  pending: boolean;
  busyLabel: string | null;
  initial?: Partial<ExamMetaValues>;
  onSubmit: (values: ExamMetaValues) => void;
  onCancel?: () => void;
  onBack?: () => void;
}) {
  const national = isNationalAdmin(profile);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [audience, setAudience] = useState<ExamAudience>(
    initial?.audience ?? "student",
  );
  const [duration, setDuration] = useState(initial?.duration_minutes ?? 60);
  const [passPercent, setPassPercent] = useState(initial?.pass_percent ?? 50);
  const [counts, setCounts] = useState(initial?.counts_toward_record ?? true);
  const [revealScore, setRevealScore] = useState(
    initial?.visitor_reveal_score ?? false,
  );
  const [emailScorecard, setEmailScorecard] = useState(
    initial?.visitor_email_scorecard ?? false,
  );
  const [yearIndex, setYearIndex] = useState(
    initial?.year_index != null ? String(initial.year_index) : "",
  );
  const [batchId, setBatchId] = useState(initial?.batch_id ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");

  const scopedBatches = national
    ? batches
    : batches.filter((b) => b.parish_id === profile.parish_id);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit({
      title,
      audience,
      duration_minutes: duration,
      pass_percent: passPercent,
      counts_toward_record: counts,
      visitor_reveal_score: revealScore,
      visitor_email_scorecard: emailScorecard,
      year_index: yearIndex ? Number(yearIndex) : null,
      batch_id: batchId || null,
      instructions,
      opens_at: initial?.opens_at ?? null,
      closes_at: initial?.closes_at ?? null,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 px-3 py-4 sm:px-6 sm:py-5">
      <header>
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
          >
            <span aria-hidden>←</span> Directory
          </button>
        ) : null}
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          {initial ? "Settings" : "New exam"}
        </p>
        <h2 className="mt-1 font-display text-xl text-pine sm:text-2xl">
          {initial ? "Exam details" : "Compose an exam"}
        </h2>
      </header>
      <label className="block text-sm">
        Title
        <input
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={`mt-1 ${fieldClass}`}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Audience
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as ExamAudience)}
            className={`mt-1 ${fieldClass}`}
          >
            <option value="student">Enrolled students</option>
            <option value="open">Open link (anyone)</option>
          </select>
        </label>
        <label className="block text-sm">
          Duration (minutes)
          <input
            type="number"
            min={1}
            max={600}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        <label className="block text-sm">
          Pass mark (%)
          <input
            type="number"
            min={0}
            max={100}
            value={passPercent}
            onChange={(e) => setPassPercent(Number(e.target.value))}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
        {audience === "student" ? (
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={counts}
              onChange={(e) => setCounts(e.target.checked)}
            />
            Counts toward student record
          </label>
        ) : null}
      </div>

      {audience === "student" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Exam year (Month 1–10)
            <select
              value={yearIndex}
              onChange={(e) => setYearIndex(e.target.value)}
              className={`mt-1 ${fieldClass}`}
            >
              <option value="">Not year-gated</option>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  Year {n} (Month {n})
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-ink/50">
              Opens after Month N attendance and a pass on Year N−1.
            </span>
          </label>
          <label className="block text-sm">
            Batch (optional)
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              className={`mt-1 ${fieldClass}`}
            >
              <option value="">All batches</option>
              {scopedBatches.map((b) => (
                <option key={b.id} value={b.id}>
                  {formatBatchLabel(b)}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {audience === "open" ? (
        <div className="space-y-3 border border-celadon/25 bg-celadon/[0.06] px-4 py-4">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Open-link results
          </p>
          <p className="text-sm leading-relaxed text-ink/65">
            Choose what unauthenticated visitors see after they finish. Final
            scores appear only when grading is complete (or immediately for
            fully auto-marked papers).
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={revealScore}
              onChange={(e) => {
                setRevealScore(e.target.checked);
                if (!e.target.checked) setEmailScorecard(false);
              }}
            />
            <span>
              <span className="font-medium text-pine">Show final score</span>
              <span className="mt-0.5 block text-xs text-ink/55">
                Show pass/fail % on the thank-you page when grading is ready
              </span>
            </span>
          </label>
          <label
            className={`flex items-start gap-3 text-sm ${
              revealScore ? "" : "opacity-45"
            }`}
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={emailScorecard}
              disabled={!revealScore}
              onChange={(e) => setEmailScorecard(e.target.checked)}
            />
            <span>
              <span className="font-medium text-pine">
                Email open-assessment result
              </span>
              <span className="mt-0.5 block text-xs text-ink/55">
                Send a result notice when the final score is ready — visitors can
                also request a copy from the result page. Enrolled students use
                Records scorecards instead.
              </span>
            </span>
          </label>
        </div>
      ) : null}
      <label className="block text-sm">
        Instructions
        <textarea
          rows={3}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          className={`mt-1 ${fieldClass}`}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[2.5rem] min-w-[8.5rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist disabled:opacity-60"
        >
          {pending ? (
            <DeskLoader
              label={busyLabel ?? (initial ? "Saving…" : "Creating…")}
              tone="mist"
            />
          ) : initial ? (
            "Save details"
          ) : (
            "Create draft"
          )}
        </button>
        {onCancel ? (
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="border border-stone px-4 py-2.5 text-sm text-ink/70 disabled:opacity-60"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

export function ExamWorkspace({
  detail,
  profile,
  parishes,
  batches,
  pending,
  busyLabel,
  refreshing,
  backHref,
  onBack,
  onRefresh,
  onSaveMeta,
  onStatus,
  onDelete,
  onCopyLink,
  onImport,
  onUpsertQuestion,
  onDeleteQuestion,
}: {
  detail: { exam: Exam; questions: ExamQuestion[] };
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name" | "region">[];
  batches: Batch[];
  pending: boolean;
  busyLabel: string | null;
  refreshing?: boolean;
  backHref?: string;
  onBack?: () => void;
  onRefresh?: () => void;
  onSaveMeta: (values: ExamMetaValues) => void;
  onStatus: (status: Exam["status"]) => void;
  onDelete: () => void;
  onCopyLink: () => void;
  onImport: (file: File) => void;
  onUpsertQuestion: (payload: {
    id?: string;
    type: ExamQuestionType;
    prompt: string;
    points: number;
    payload: ExamQuestion["payload"];
  }) => void;
  onDeleteQuestion: (id: string) => void;
}) {
  const [tab, setTab] = useState<"questions" | "settings">("questions");
  const [editing, setEditing] = useState<ExamQuestion | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="animate-panel-in">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-stone px-3 py-4 sm:px-6">
        <div className="min-w-0">
          {backHref ? (
            <Link
              href={backHref}
              className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
            >
              <span aria-hidden>←</span> Exams
            </Link>
          ) : onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
            >
              <span aria-hidden>←</span> Directory
            </button>
          ) : null}
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            {detail.exam.status} · {detail.exam.audience}
          </p>
          <h2 className="mt-1 font-display text-[clamp(1.3rem,4vw,2rem)] text-pine">
            {detail.exam.title}
          </h2>
          <p className="mt-1 text-xs text-ink/50">
            {detail.exam.duration_minutes} min · pass {detail.exam.pass_percent}%
            · {detail.questions.length} questions
            {detail.exam.year_index != null
              ? ` · Year ${detail.exam.year_index}`
              : ""}
            {detail.exam.audience === "open" && detail.exam.visitor_reveal_score
              ? " · reveals score"
              : ""}
            {detail.exam.audience === "open" &&
            detail.exam.visitor_email_scorecard
              ? " · emails certificate"
              : ""}
            {detail.exam.batch_name ? ` · ${detail.exam.batch_name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onRefresh ? (
            <button
              type="button"
              disabled={pending || refreshing}
              onClick={onRefresh}
              className="border border-stone px-3 py-1.5 text-xs font-medium text-pine disabled:opacity-60"
            >
              {refreshing ? (
                <DeskLoader label="Refreshing…" />
              ) : (
                "Refresh"
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCopyLink}
            className="border border-stone px-3 py-1.5 text-xs font-medium text-pine"
          >
            Copy link
          </button>
          {detail.exam.status !== "published" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatus("published")}
              className="inline-flex min-h-[1.85rem] min-w-[4.5rem] items-center justify-center bg-pine px-3 py-1.5 text-xs font-medium text-mist disabled:opacity-60"
            >
              {pending && busyLabel?.startsWith("Publishing") ? (
                <DeskLoader label={busyLabel} tone="mist" />
              ) : (
                "Publish"
              )}
            </button>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatus("closed")}
              className="inline-flex min-h-[1.85rem] min-w-[4rem] items-center justify-center border border-pine/30 px-3 py-1.5 text-xs font-medium text-pine disabled:opacity-60"
            >
              {pending && busyLabel?.startsWith("Closing") ? (
                <DeskLoader label={busyLabel} />
              ) : (
                "Close"
              )}
            </button>
          )}
          {detail.exam.status === "closed" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => onStatus("draft")}
              className="border border-stone px-3 py-1.5 text-xs text-ink/60 disabled:opacity-60"
            >
              To draft
            </button>
          ) : null}
        </div>
      </header>

      <nav className="flex gap-1 border-b border-stone px-4 pt-2">
        {(
          [
            { id: "questions" as const, label: "Questions" },
            { id: "settings" as const, label: "Settings" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`relative px-3 py-2 text-sm font-medium ${
              tab === item.id ? "text-pine" : "text-ink/45"
            }`}
          >
            {item.label}
            <span
              className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon ${
                tab === item.id ? "opacity-100" : "opacity-0"
              }`}
            />
          </button>
        ))}
      </nav>

      {tab === "settings" ? (
        <div className="space-y-4">
          <ExamMetaForm
            profile={profile}
            parishes={parishes}
            batches={batches}
            pending={pending}
            busyLabel={busyLabel}
            initial={{
              title: detail.exam.title,
              audience: detail.exam.audience,
              duration_minutes: detail.exam.duration_minutes,
              pass_percent: detail.exam.pass_percent,
              counts_toward_record: detail.exam.counts_toward_record,
              visitor_reveal_score: detail.exam.visitor_reveal_score,
              visitor_email_scorecard: detail.exam.visitor_email_scorecard,
              year_index: detail.exam.year_index ?? null,
              batch_id: detail.exam.batch_id,
              instructions: detail.exam.instructions ?? "",
              opens_at: detail.exam.opens_at,
              closes_at: detail.exam.closes_at,
            }}
            onSubmit={onSaveMeta}
          />
          <div className="border-t border-stone px-4 py-4 sm:px-6">
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="text-sm text-red-800 hover:underline disabled:opacity-60"
            >
              Delete exam
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(true);
                setEditing(null);
              }}
              className="border border-pine/30 px-3 py-1.5 text-sm font-medium text-pine"
            >
              + Add question
            </button>
            <label
              className={`cursor-pointer border border-stone px-3 py-1.5 text-sm text-ink/70 hover:border-pine ${
                pending ? "pointer-events-none opacity-60" : ""
              }`}
            >
              Import file
              <input
                type="file"
                accept=".csv,.xlsx,.xls,.json,.txt"
                className="hidden"
                disabled={pending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImport(file);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="text-xs text-ink/45">
              CSV / XLSX / JSON / text — parsed only, not stored
            </p>
          </div>

          {(adding || editing) && (
            <QuestionEditor
              key={editing?.id ?? "new"}
              initial={editing}
              pending={pending}
              busyLabel={busyLabel}
              onCancel={() => {
                setAdding(false);
                setEditing(null);
              }}
              onSave={(payload) => {
                onUpsertQuestion(
                  editing ? { ...payload, id: editing.id } : payload,
                );
                setAdding(false);
                setEditing(null);
              }}
            />
          )}

          <ul className="mt-3 divide-y divide-stone border-y border-stone">
            {detail.questions.length === 0 ? (
              <li className="py-8 text-center text-sm text-ink/50">
                No questions yet. Add one or import a sheet.
              </li>
            ) : (
              detail.questions.map((q, index) => (
                <li
                  key={q.id}
                  className="flex flex-wrap items-start justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.65rem] uppercase tracking-[0.12em] text-celadon">
                      Q{index + 1} · {QUESTION_TYPE_META[q.type].label} ·{" "}
                      {q.points} pts
                    </p>
                    <p className="mt-1 text-sm text-ink">{q.prompt}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(q);
                        setAdding(false);
                      }}
                      className="text-xs font-medium text-pine"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteQuestion(q.id)}
                      className="text-xs text-red-800"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function QuestionEditor({
  initial,
  pending,
  busyLabel,
  onSave,
  onCancel,
}: {
  initial: ExamQuestion | null;
  pending: boolean;
  busyLabel: string | null;
  onSave: (payload: {
    type: ExamQuestionType;
    prompt: string;
    points: number;
    payload: ExamQuestion["payload"];
  }) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<ExamQuestionType>(
    initial?.type ?? "multiple_choice",
  );
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [points, setPoints] = useState(initial?.points ?? 1);
  const mcq = (initial?.payload as McqPayload | undefined) ?? undefined;
  const [optionsText, setOptionsText] = useState(
    mcq?.options?.map((o) => `${o.key}. ${o.text}`).join("\n") ??
      "A. Option one\nB. Option two",
  );
  const [correctKeys, setCorrectKeys] = useState(
    mcq?.correctKeys?.join(",") ?? "A",
  );
  const [tfCorrect, setTfCorrect] = useState(
    typeof (initial?.payload as { correct?: boolean })?.correct === "boolean"
      ? Boolean((initial?.payload as { correct: boolean }).correct)
      : true,
  );
  const [modelAnswer, setModelAnswer] = useState(
    String((initial?.payload as { modelAnswer?: string })?.modelAnswer ?? ""),
  );
  const [rubric, setRubric] = useState(
    String((initial?.payload as { rubric?: string })?.rubric ?? ""),
  );

  function buildPayload(): ExamQuestion["payload"] {
    if (type === "multiple_choice") {
      const options = optionsText
        .split(/\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, i) => {
          const m = line.match(/^([A-Za-z0-9]+)[.):\-]\s*(.+)$/);
          return m
            ? { key: m[1].toUpperCase(), text: m[2].trim() }
            : {
                key: String.fromCharCode(65 + i),
                text: line,
              };
        });
      const keys = correctKeys
        .split(/[,|;/\s]+/)
        .map((k) => k.trim().toUpperCase())
        .filter(Boolean);
      return { options, correctKeys: keys, multi: keys.length > 1 };
    }
    if (type === "true_false") return { correct: tfCorrect };
    if (type === "short_answer") return { modelAnswer: modelAnswer || undefined };
    return { rubric: rubric || undefined };
  }

  return (
    <div className="mb-4 border border-pine/20 bg-white/60 px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ExamQuestionType)}
            className={`mt-1 ${fieldClass}`}
          >
            {Object.entries(QUESTION_TYPE_META).map(([id, meta]) => (
              <option key={id} value={id}>
                {meta.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Points
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        Prompt
        <textarea
          required
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className={`mt-1 ${fieldClass}`}
        />
      </label>
      {type === "multiple_choice" ? (
        <>
          <label className="mt-3 block text-sm">
            Options (one per line, e.g. A. Text)
            <textarea
              rows={4}
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              className={`mt-1 font-mono ${fieldClass}`}
            />
          </label>
          <label className="mt-3 block text-sm">
            Correct key(s)
            <input
              value={correctKeys}
              onChange={(e) => setCorrectKeys(e.target.value)}
              className={`mt-1 ${fieldClass}`}
              placeholder="A or A,C"
            />
          </label>
        </>
      ) : null}
      {type === "true_false" ? (
        <label className="mt-3 block text-sm">
          Correct answer
          <select
            value={tfCorrect ? "true" : "false"}
            onChange={(e) => setTfCorrect(e.target.value === "true")}
            className={`mt-1 ${fieldClass}`}
          >
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        </label>
      ) : null}
      {type === "short_answer" ? (
        <label className="mt-3 block text-sm">
          Model answer (for graders)
          <textarea
            rows={2}
            value={modelAnswer}
            onChange={(e) => setModelAnswer(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      ) : null}
      {type === "long_answer" ? (
        <label className="mt-3 block text-sm">
          Rubric note
          <textarea
            rows={2}
            value={rubric}
            onChange={(e) => setRubric(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          />
        </label>
      ) : null}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending || !prompt.trim()}
          onClick={() =>
            onSave({ type, prompt, points, payload: buildPayload() })
          }
          className="inline-flex min-h-[2.25rem] min-w-[8rem] items-center justify-center bg-pine px-4 py-2 text-sm font-medium text-mist disabled:opacity-60"
        >
          {pending && busyLabel?.includes("question") ? (
            <DeskLoader label={busyLabel} tone="mist" />
          ) : (
            "Save question"
          )}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="border border-stone px-4 py-2 text-sm text-ink/60 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}