"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createExam,
  type ExamActionResult,
} from "@/app/admin/exams/actions";
import { EvaluationManager } from "@/components/admin/evaluation-manager";
import { ExamResultsBoard } from "@/components/admin/exam-results-board";
import { ExamSamples } from "@/components/admin/exam-samples";
import { ExamUpload } from "@/components/admin/exam-upload";
import { ExamMetaForm } from "@/components/admin/exam-workspace";
import type { EvaluationAttemptRow } from "@/app/admin/evaluation/actions";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { type Exam } from "@/lib/exams/types";
import { type Batch, type Parish } from "@/lib/parishes";
import {
  FULL_EXAM_PACKS,
  downloadTemplatePack,
} from "@/lib/exams/templates";
import { DeskPagination } from "@/lib/ui/desk-pagination";

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

type DeskTab = "compose" | "upload" | "samples" | "queue" | "results" | "insight";

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
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");

  useEffect(() => {
    setDeskTab(initialTab);
  }, [initialTab]);

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
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
  }, [query]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function examDetailHref(examId: string) {
    const params = new URLSearchParams();
    params.set("tab", "compose");
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", String(page));
    const from = params.toString();
    return from
      ? `/admin/exams/${examId}?from=${encodeURIComponent(from)}`
      : `/admin/exams/${examId}`;
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
          if (next.examId) {
            setCreating(false);
            router.push(examDetailHref(next.examId));
          }
        } else {
          error(next.message, "Exams");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  const needsGrading = attempts.filter((a) => a.status === "submitted").length;

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
        data-tour="exams-tabs"
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Exams desk"
      >
        {(
          [
            { id: "compose" as const, label: "Compose" },
            { id: "upload" as const, label: "Upload" },
            { id: "samples" as const, label: "Samples" },
            { id: "queue" as const, label: "Queue" },
            { id: "results" as const, label: "Results" },
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
      ) : deskTab === "results" ? (
        <ExamResultsBoard attempts={attempts} />
      ) : deskTab === "upload" ? (
        <ExamUpload
          exams={exams}
          onOpenSamples={() => setDeskTab("samples")}
          onOpenedExam={(examId) => {
            router.push(examDetailHref(examId));
          }}
        />
      ) : deskTab === "samples" ? (
        <ExamSamples onOpenUpload={() => setDeskTab("upload")} />
      ) : (
        <>
      <section
        data-tour="exams-stats"
        className="grid grid-cols-3 gap-2 sm:gap-3.5"
      >
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

      {creating ? (
        <section className="relative border border-stone bg-mist/30">
          <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
          <ExamMetaForm
            profile={profile}
            parishes={parishes}
            batches={batches}
            pending={busy}
            busyLabel={busyLabel}
            onCancel={() => setCreating(false)}
            onSubmit={(values) =>
              run(
                () => createExam(values),
                undefined,
                "Creating draft…",
              )
            }
          />
        </section>
      ) : (
        <>
          <div
            data-tour="exams-directory"
            className="border border-stone bg-mist/40 px-3 py-3 sm:px-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Exam directory
                </p>
                <p className="mt-1 text-sm text-ink/60">
                  View only — open a row for questions, settings, and publish
                </p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:max-w-md">
                <label className="block min-w-0 flex-1 text-sm">
                  <span className="sr-only">Search exams</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search title, status, audience…"
                    className={fieldClass}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="shrink-0 border border-pine/35 px-3 py-2 text-sm font-medium text-pine hover:border-pine"
                >
                  + New exam
                </button>
              </div>
            </div>
          </div>

          <section className="border border-stone bg-mist/30">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone px-3 py-2.5 text-sm text-ink/55 sm:px-4 sm:py-3">
              <p>
                {filtered.length === 0
                  ? "No exams match."
                  : `Showing ${rangeFrom}–${rangeTo} of ${filtered.length}`}
              </p>
            </div>

            <div className="hidden border-b border-stone bg-white/50 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_5rem_2rem] md:gap-3">
              <span>Exam</span>
              <span>Audience · scope</span>
              <span>Status</span>
              <span>Questions</span>
              <span />
            </div>

            <ul className="divide-y divide-stone">
              {pageExams.length === 0 ? (
                <li className="px-4 py-10 text-center text-sm text-ink/50">
                  No exams yet. Create one or import on Upload.
                </li>
              ) : (
                pageExams.map((exam) => (
                  <li key={exam.id}>
                    <Link
                      href={examDetailHref(exam.id)}
                      className="group grid items-center gap-3 px-3 py-3 transition-colors hover:bg-white/70 sm:px-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_5rem_2rem]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink group-hover:text-pine">
                          {exam.title}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink/45">
                          {exam.duration_minutes} min · pass {exam.pass_percent}%
                          {exam.year_index != null
                            ? ` · Year ${exam.year_index}`
                            : ""}
                        </span>
                      </span>
                      <span className="hidden min-w-0 md:block">
                        <span className="block truncate text-sm capitalize text-ink/70">
                          {exam.audience === "open"
                            ? "Open link"
                            : "Enrolled students"}
                        </span>
                        <span className="block truncate text-xs text-ink/45">
                          {[exam.parish_name, exam.batch_name]
                            .filter(Boolean)
                            .join(" · ") || "All batches"}
                        </span>
                      </span>
                      <span className="hidden capitalize text-sm text-ink/70 md:block">
                        {exam.status}
                      </span>
                      <span className="hidden tabular-nums text-sm text-ink/70 md:block">
                        {exam.question_count ?? 0}
                      </span>
                      <span
                        className="ml-auto text-pine/70 group-hover:text-pine md:ml-0"
                        aria-hidden
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))
              )}
            </ul>

            {totalPages > 1 ? (
              <div className="border-t border-stone px-3 py-2 sm:px-4">
                <DeskPagination
                  page={currentPage}
                  totalItems={filtered.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                  itemLabel="exams"
                />
              </div>
            ) : null}
          </section>
        </>
      )}
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
      body: "Browse drafts and live exams on the directory. Open any row for the exam file — questions, settings, publish, and copy link. After Upload, you land on that exam’s file to review the imported bank.",
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
      body: "Publish when the question bank is ready. Copy the take link from the exam file. Students use the student exams area; open candidates use the public take page with no site header or footer.",
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
