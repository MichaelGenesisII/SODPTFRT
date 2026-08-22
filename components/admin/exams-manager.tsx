"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  createExam,
  deleteExam,
  deleteQuestion,
  getAdminExam,
  importQuestionsToExam,
  setExamStatus,
  updateExamMeta,
  upsertQuestion,
  type ExamActionResult,
} from "@/app/admin/exams/actions";
import { EvaluationManager } from "@/components/admin/evaluation-manager";
import { ExamSamples } from "@/components/admin/exam-samples";
import { ExamUpload } from "@/components/admin/exam-upload";
import type { EvaluationAttemptRow } from "@/app/admin/evaluation/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
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
import {
  FULL_EXAM_PACKS,
  downloadTemplatePack,
} from "@/lib/exams/templates";

const PAGE_SIZE = 8;
const fieldClass =
  "w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

type Props = {
  profile: AdminProfile;
  exams: Exam[];
  parishes: Pick<Parish, "id" | "name" | "region">[];
  batches: Batch[];
  attempts: EvaluationAttemptRow[];
  initialTab?: DeskTab;
};

type DeskTab = "compose" | "upload" | "samples" | "queue" | "insight";
type MobileSurface = "directory" | "workspace";

export function ExamsManager({
  profile,
  exams,
  parishes,
  batches,
  attempts,
  initialTab = "compose",
}: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [deskTab, setDeskTab] = useState<DeskTab>(initialTab);
  const [selectedId, setSelectedId] = useState<string | null>(exams[0]?.id ?? null);
  const [detail, setDetail] = useState<{
    exam: Exam;
    questions: ExamQuestion[];
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [mobileSurface, setMobileSurface] =
    useState<MobileSurface>("directory");
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return exams;
    return exams.filter((e) =>
      [e.title, e.slug, e.parish_name, e.batch_name, e.audience, e.status]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [exams, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageExams = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  const directoryClass =
    mobileSurface === "directory" ? "block" : "hidden lg:block";
  const workspaceClass =
    mobileSurface === "workspace" ? "block" : "hidden lg:block";

  useEffect(() => {
    setPage(1);
    setMobileSurface("directory");
  }, [query]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void getAdminExam(selectedId).then((next) => {
      if (!cancelled) setDetail(next);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedId, exams]);

  function backToDirectory() {
    setMobileSurface("directory");
    setCreating(false);
  }

  function run(
    action: () => Promise<ExamActionResult>,
    then?: () => void,
    label = "Working…",
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          success(next.message, "Exams");
          then?.();
          router.refresh();
          if (next.examId) setSelectedId(next.examId);
        } else {
          error(next.message, "Exams");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function onImport(file: File) {
    if (!selectedId) return;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    const base64 = btoa(binary);
    run(
      () => importQuestionsToExam(selectedId, file.name, base64),
      undefined,
      "Importing questions…",
    );
  }

  function copyLink(slug: string, audience: ExamAudience) {
    const path =
      audience === "open" ? `/exam/${slug}` : `/student/exams/${slug}`;
    const url = `${window.location.origin}${path}`;
    void navigator.clipboard.writeText(url).then(
      () => success("Link copied.", "Exams"),
      () => error("Could not copy link.", "Exams"),
    );
  }

  const needsGrading = attempts.filter((a) => a.status === "submitted").length;

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Exams desk"
      >
        {(
          [
            { id: "compose" as const, label: "Compose" },
            { id: "upload" as const, label: "Upload" },
            { id: "samples" as const, label: "Samples" },
            { id: "queue" as const, label: "Queue" },
            { id: "insight" as const, label: "Insight" },
          ] as const
        ).map((tab) => {
          const active = deskTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDeskTab(tab.id)}
              className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                active ? "text-pine" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              {tab.label}
              {tab.id === "queue" && needsGrading > 0 ? (
                <span className="ml-1.5 tabular-nums text-ink/35">
                  {needsGrading}
                </span>
              ) : null}
              <span
                className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity ${
                  active ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>

      {deskTab === "insight" ? (
        <ExamsInsightGuide
          national={isNationalAdmin(profile)}
          onOpenSamples={() => setDeskTab("samples")}
          onOpenUpload={() => setDeskTab("upload")}
        />
      ) : deskTab === "queue" ? (
        <EvaluationManager initial={attempts} />
      ) : deskTab === "upload" ? (
        <ExamUpload
          exams={exams}
          onOpenSamples={() => setDeskTab("samples")}
          onOpenedExam={(examId) => {
            setSelectedId(examId);
            setCreating(false);
            setMobileSurface("workspace");
            setDeskTab("compose");
          }}
        />
      ) : deskTab === "samples" ? (
        <ExamSamples onOpenUpload={() => setDeskTab("upload")} />
      ) : (
        <>
      <section className="grid grid-cols-3 gap-2 sm:gap-3.5">
        <Stat value={exams.length} label="Exams" hint="All drafts & live" />
        <Stat
          value={exams.filter((e) => e.status === "published").length}
          label="Live"
          hint="Published now"
        />
        <Stat
          value={exams.filter((e) => e.audience === "open").length}
          label="Open link"
          short="Open"
          hint="Public candidates"
        />
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <aside className={`${directoryClass} border border-stone bg-mist/50`}>
          <div className="space-y-2 border-b border-stone px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.55rem] font-medium uppercase tracking-[0.14em] text-ink/45">
                Directory
              </p>
              <p className="text-[0.65rem] tabular-nums text-ink/40">
                {filtered.length
                  ? `${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filtered.length)}/${filtered.length}`
                  : "0"}
              </p>
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exams…"
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setSelectedId(null);
                setMobileSurface("workspace");
              }}
              className="w-full border border-pine/30 px-2 py-1.5 text-sm font-medium text-pine hover:border-pine"
            >
              + New exam
            </button>
          </div>
          <ul className="max-h-[min(62vh,36rem)] divide-y divide-stone overflow-y-auto lg:max-h-[min(70vh,40rem)]">
            {pageExams.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-ink/50">
                No exams yet.
              </li>
            ) : (
              pageExams.map((exam) => {
                const active = exam.id === selectedId && !creating;
                return (
                  <li key={exam.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCreating(false);
                        setSelectedId(exam.id);
                        setMobileSurface("workspace");
                      }}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left ${
                        active ? "bg-pine text-mist" : "hover:bg-white/60"
                      }`}
                    >
                      <span className="truncate text-sm font-medium">
                        {exam.title}
                      </span>
                      <span
                        className={`text-[0.65rem] uppercase tracking-[0.1em] ${
                          active ? "text-mist/65" : "text-ink/45"
                        }`}
                      >
                        {exam.status} · {exam.audience} ·{" "}
                        {exam.question_count ?? 0}q
                        {exam.audience === "open" && exam.visitor_reveal_score
                          ? " · score"
                          : ""}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between gap-2 border-t border-stone px-2 py-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="border border-pine/25 px-2 py-1 text-[0.7rem] text-pine disabled:opacity-40"
              >
                Prev
              </button>
              <span className="text-[0.65rem] tabular-nums text-ink/55">
                {currentPage}/{totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="border border-pine/25 px-2 py-1 text-[0.7rem] text-pine disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </aside>

        <section
          className={`${workspaceClass} relative min-h-[16rem] border border-stone bg-mist sm:min-h-[22rem]`}
          aria-busy={busy}
        >
          <DeskLoaderOverlay
            active={busy}
            label={busyLabel ?? "Working…"}
          />
          {creating ? (
            <ExamMetaForm
              profile={profile}
              parishes={parishes}
              batches={batches}
              pending={busy}
              busyLabel={busyLabel}
              onBack={backToDirectory}
              onCancel={backToDirectory}
              onSubmit={(values) =>
                run(
                  () => createExam(values),
                  () => {
                    setCreating(false);
                    setMobileSurface("workspace");
                  },
                  "Creating draft…",
                )
              }
            />
          ) : !detail ? (
            <div className="flex min-h-[16rem] flex-col items-center justify-center px-5 py-12 text-center sm:min-h-[22rem] sm:px-6">
              <p className="font-display text-xl text-pine">Choose an exam</p>
              <p className="mt-2 max-w-sm text-sm text-ink/55">
                Author questions, import a sheet, publish, and share the take
                link.
              </p>
            </div>
          ) : (
            <ExamWorkspace
              detail={detail}
              profile={profile}
              parishes={parishes}
              batches={batches}
              pending={busy}
              busyLabel={busyLabel}
              onBack={backToDirectory}
              onSaveMeta={(values) =>
                run(
                  () => updateExamMeta(detail.exam.id, values),
                  undefined,
                  "Saving details…",
                )
              }
              onStatus={(status) =>
                run(
                  () => setExamStatus(detail.exam.id, status),
                  undefined,
                  status === "published"
                    ? "Publishing…"
                    : status === "closed"
                      ? "Closing…"
                      : "Updating status…",
                )
              }
              onDelete={() => {
                if (!window.confirm("Delete this exam and all attempts?")) return;
                run(
                  () => deleteExam(detail.exam.id),
                  () => {
                    setSelectedId(null);
                    setDetail(null);
                    setMobileSurface("directory");
                  },
                  "Deleting exam…",
                );
              }}
              onCopyLink={() =>
                copyLink(detail.exam.slug, detail.exam.audience)
              }
              onImport={onImport}
              onUpsertQuestion={(payload) =>
                run(
                  () =>
                    upsertQuestion({ ...payload, exam_id: detail.exam.id }),
                  undefined,
                  "Saving question…",
                )
              }
              onDeleteQuestion={(id) =>
                run(
                  () => deleteQuestion(id, detail.exam.id),
                  undefined,
                  "Removing question…",
                )
              }
            />
          )}
        </section>
      </div>
        </>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  short,
  hint,
}: {
  value: number;
  label: string;
  short?: string;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-stone/50 bg-white px-2 py-2.5 text-center sm:flex-row sm:items-center sm:gap-3 sm:px-3.5 sm:py-3 sm:text-left">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine sm:h-11 sm:w-11">
        <span className="font-display text-xl text-mist tabular-nums">{value}</span>
      </div>
      <div className="min-w-0 sm:border-l sm:border-stone/70 sm:pl-3">
        <p className="truncate text-[0.7rem] font-medium text-pine sm:text-sm">
          <span className="sm:hidden">{short ?? label}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="mt-0.5 hidden truncate text-xs text-ink/50 sm:block">
          {hint}
        </p>
      </div>
    </div>
  );
}

type MetaValues = {
  title: string;
  audience: ExamAudience;
  duration_minutes: number;
  pass_percent: number;
  counts_toward_record: boolean;
  visitor_reveal_score: boolean;
  visitor_email_scorecard: boolean;
  parish_id: string | null;
  batch_id: string | null;
  instructions: string;
  opens_at: string | null;
  closes_at: string | null;
};

function ExamMetaForm({
  profile,
  parishes,
  batches,
  pending,
  busyLabel,
  initial,
  onSubmit,
  onCancel,
  onBack,
}: {
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name" | "region">[];
  batches: Batch[];
  pending: boolean;
  busyLabel: string | null;
  initial?: Partial<MetaValues>;
  onSubmit: (values: MetaValues) => void;
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
  const [parishId, setParishId] = useState(
    initial?.parish_id ?? profile.parish_id ?? "",
  );
  const [batchId, setBatchId] = useState(initial?.batch_id ?? "");
  const [instructions, setInstructions] = useState(initial?.instructions ?? "");

  const parishBatches = batches.filter((b) =>
    parishId ? b.parish_id === parishId : true,
  );

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
      parish_id: parishId || null,
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
                Certificate-style result on the thank-you page
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

      <div className="grid gap-3 sm:grid-cols-2">
        {national ? (
          <label className="block text-sm">
            Parish scope
            <select
              value={parishId}
              onChange={(e) => {
                setParishId(e.target.value);
                setBatchId("");
              }}
              className={`mt-1 ${fieldClass}`}
            >
              <option value="">All (national)</option>
              {parishes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-ink/55">
            Parish scope:{" "}
            <span className="font-medium text-pine">
              {parishes.find((p) => p.id === profile.parish_id)?.name ??
                "Your parish"}
            </span>
          </p>
        )}
        <label className="block text-sm">
          Batch (optional)
          <select
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            className={`mt-1 ${fieldClass}`}
          >
            <option value="">All batches</option>
            {parishBatches.map((b) => (
              <option key={b.id} value={b.id}>
                {formatBatchLabel(b)}
              </option>
            ))}
          </select>
        </label>
      </div>
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

function ExamWorkspace({
  detail,
  profile,
  parishes,
  batches,
  pending,
  busyLabel,
  onBack,
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
  onBack?: () => void;
  onSaveMeta: (values: MetaValues) => void;
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
          {onBack ? (
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
            {detail.exam.audience === "open" && detail.exam.visitor_reveal_score
              ? " · reveals score"
              : ""}
            {detail.exam.audience === "open" &&
            detail.exam.visitor_email_scorecard
              ? " · emails certificate"
              : ""}
            {detail.exam.parish_name ? ` · ${detail.exam.parish_name}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
              parish_id: detail.exam.parish_id,
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

function ExamsInsightGuide({
  national,
  onOpenSamples,
  onOpenUpload,
}: {
  national: boolean;
  onOpenSamples: () => void;
  onOpenUpload: () => void;
}) {
  const sections = [
    {
      title: "What this desk is for",
      body: "Author and grade timed exams. Compose builds papers by hand; Samples provides downloads; Upload turns a file into a draft; Queue grades and releases.",
    },
    {
      title: "Compose",
      body: "Create drafts, add questions, publish, and copy the take link. After an Upload, you land here to review the imported bank.",
    },
    {
      title: "Upload",
      body: "Bring a completed XLSX, CSV, JSON, or text file back into the portal. Creates a new draft (or appends to an existing draft). The file is parsed only — never stored.",
    },
    {
      title: "Samples",
      body: "Download ready-made full tests or blank templates. Fill offline if needed, then switch to Upload.",
    },
    {
      title: "Student vs open link",
      body: "Student exams are for signed-in enrolled learners (optionally scoped to a parish or batch). Open-link exams are for anyone with the URL — they fill a short form (name, email) before the timer starts.",
    },
    {
      title: "Publish & share",
      body: "Publish when the question bank is ready. Copy the take link from Compose. Students use /student/exams/…; open candidates use /exam/… with no site header or footer.",
    },
    {
      title: "Queue",
      body: "Submitted attempts land here. Auto-scored items are already marked; short and long answers need your points and notes. Release when grading is complete.",
    },
    {
      title: "Open-link results",
      body: "For open exams, toggle Show final score so visitors see a certificate after grading. Enable Email open-assessment result to send that notice automatically (and let them request another copy). Enrolled student Records use a separate scorecard email.",
    },
    {
      title: "Counts toward record",
      body: "On student exams, toggle this so a released result writes into the student’s Records scorecard. Open-link candidates never feed Records.",
    },
    {
      title: "Who sees what",
      body: national
        ? "National desks manage every parish’s exams and attempts. Parish admins only see exams attached to their parish."
        : "You only manage exams for your parish. National staff see the full UK set.",
    },
  ];

  const insightDownloads = FULL_EXAM_PACKS.filter((p) =>
    [
      "exam-foundation-xlsx",
      "exam-spirit-xlsx",
      "exam-midcourse-xlsx",
      "exam-open-xlsx",
      "exam-graduation-xlsx",
    ].includes(p.id),
  );

  return (
    <div key="insight" className="animate-panel-in space-y-3">
      <div className="border border-stone bg-mist">
        <div className="border-b border-stone px-3 py-4 sm:px-5 sm:py-5">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
            How exams work
          </p>
          <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
            Insight
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
            Compose · Upload · Samples · Queue — download, import, grade,
            release.
          </p>
        </div>
        <ol className="divide-y divide-stone">
          {sections.map((section, index) => (
            <li
              key={section.title}
              className="grid gap-1.5 px-3 py-3.5 sm:grid-cols-[2rem_1fr] sm:gap-4 sm:px-5"
            >
              <p className="font-display text-lg tabular-nums text-celadon/80">
                {String(index + 1).padStart(2, "0")}
              </p>
              <div>
                <h3 className="text-sm font-medium text-ink">{section.title}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink/65">
                  {section.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <section className="border border-stone bg-mist">
        <div className="border-b border-stone px-3 py-4 sm:px-5">
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
            Ready-made tests
          </p>
          <h3 className="mt-1.5 font-display text-xl text-pine">
            Download full exam files
          </h3>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
            Complete papers with questions and answer keys. Download here (or
            from{" "}
            <button
              type="button"
              onClick={onOpenSamples}
              className="font-medium text-pine underline"
            >
              Samples
            </button>
            ), then import on{" "}
            <button
              type="button"
              onClick={onOpenUpload}
              className="font-medium text-pine underline"
            >
              Upload
            </button>{" "}
            to create a draft that behaves like a hand-built exam.
          </p>
        </div>
        <ul className="divide-y divide-stone">
          {insightDownloads.map((pack) => (
            <li
              key={pack.id}
              className="flex flex-col gap-2 px-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-pine">{pack.title}</p>
                <p className="mt-0.5 text-sm text-ink/60">{pack.useWhen}</p>
                <p className="mt-1 font-mono text-[0.65rem] text-ink/35">
                  {pack.filename}
                  {pack.rows?.length ? ` · ${pack.rows.length} questions` : ""}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadTemplatePack(pack)}
                  className="border border-pine/30 px-3 py-2 text-sm font-medium text-pine transition hover:border-pine hover:bg-pine/5"
                >
                  Download
                </button>
                <button
                  type="button"
                  onClick={onOpenUpload}
                  className="bg-pine px-3 py-2 text-sm font-medium text-mist transition hover:bg-celadon"
                >
                  Upload →
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="border-t border-stone px-3 py-3 text-xs text-ink/50 sm:px-5">
          More formats (JSON / CSV) and blank kits live under Samples.
        </p>
      </section>
    </div>
  );
}
