"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { listRecordStudents } from "@/app/admin/records/actions";
import { useToast } from "@/components/ui/toast";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const PAGE_SIZE = 50;

type StudentRow = Awaited<
  ReturnType<typeof listRecordStudents>
>["items"][number];

export function RecordsManager({
  profile,
  initialStudents,
  initialTotal,
  initialPage = 1,
  initialParishId = "",
  initialBatchId = "",
  parishes,
  batches,
}: {
  profile: AdminProfile;
  initialStudents: StudentRow[];
  initialTotal: number;
  initialPage?: number;
  initialParishId?: string;
  initialBatchId?: string;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Batch[];
}) {
  const { error } = useToast();
  const [pending, startTransition] = useTransition();
  const national = isNationalAdmin(profile);
  const [parishId, setParishId] = useState(
    initialParishId || (national ? "" : profile.parish_id ?? ""),
  );
  const [batchId, setBatchId] = useState(initialBatchId);
  const [students, setStudents] = useState(initialStudents);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(initialPage);
  const [pageView, setPageView] = useState<"desk" | "insight">("desk");

  const filterBatches = batches.filter((b) =>
    parishId ? b.parish_id === parishId : true,
  );

  useEffect(() => {
    startTransition(async () => {
      try {
        const next = await listRecordStudents({
          parishId: parishId || undefined,
          batchId: batchId || undefined,
          page,
          pageSize: PAGE_SIZE,
        });
        setStudents(next.items);
        setTotal(next.total);
      } catch (e) {
        error(
          e instanceof Error ? e.message : "Could not load students.",
          "Records",
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parishId, batchId, page]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.name, s.email, s.parish_name, s.batch_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [students, query]);

  const rangeFrom = filtered.length === 0 ? 0 : 1;
  const rangeTo = filtered.length;

  function recordDetailHref(userId: string) {
    const params = new URLSearchParams();
    if (parishId) params.set("parish", parishId);
    if (batchId) params.set("batch", batchId);
    if (query.trim()) params.set("q", query.trim());
    if (page > 1) params.set("page", String(page));
    const from = params.toString();
    return from
      ? `/admin/records/${userId}?from=${encodeURIComponent(from)}`
      : `/admin/records/${userId}`;
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
        data-tour="records-tabs"
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Records page"
      >
        {(
          [
            { id: "desk" as const, label: "Desk" },
            { id: "insight" as const, label: "Insight" },
          ] as const
        ).map((tab) => {
          const active = pageView === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPageView(tab.id)}
              className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                active ? "text-pine" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              {tab.label}
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

      {pageView === "insight" ? (
        <RecordsInsightGuide national={national} />
      ) : (
        <>
          <div
            data-tour="records-filters"
            className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 sm:gap-3"
          >
            {national ? (
              <label className="flex flex-col gap-1 text-xs text-ink/50">
                Parish
                <select
                  value={parishId}
                  onChange={(e) => {
                    setParishId(e.target.value);
                    setBatchId("");
                    setPage(1);
                  }}
                  className="w-full border border-stone bg-white/70 px-2 py-1.5 text-sm outline-none focus:border-pine"
                >
                  <option value="">All</option>
                  {parishes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-xs text-ink/50">
              Batch
              <select
                value={batchId}
                onChange={(e) => {
                  setBatchId(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-stone bg-white/70 px-2 py-1.5 text-sm outline-none focus:border-pine"
              >
                <option value="">All</option>
                {filterBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {formatBatchLabel(b)}
                  </option>
                ))}
              </select>
            </label>
            <label
              className={`flex flex-col gap-1 text-xs text-ink/50 ${national ? "sm:col-span-2 lg:col-span-1" : "sm:col-span-1"}`}
            >
              Search
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full border border-stone bg-white/70 px-2 py-1.5 text-sm outline-none focus:border-pine"
                placeholder="Name or email…"
              />
            </label>
          </div>

          <div
            data-tour="records-directory"
            className="border border-stone bg-mist/40 px-3 py-3 sm:px-4"
          >
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Scorecard directory
            </p>
            <p className="mt-1 text-sm text-ink/60">
              View only — open a row for attendance, exam scores, and email
              scorecard. Class attendance and released Exams feed the same card.
            </p>
          </div>

          <section className="border border-stone bg-mist/30">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone px-3 py-2.5 text-sm text-ink/55 sm:px-4 sm:py-3">
              <p>
                {filtered.length === 0
                  ? query.trim()
                    ? "No students match on this page."
                    : "No students on this page."
                  : query.trim()
                    ? `${filtered.length} match${filtered.length === 1 ? "" : "es"} on this page`
                    : `Showing ${rangeFrom}–${rangeTo} of ${total} students`}
              </p>
              {pending ? (
                <span className="text-xs text-ink/40">Updating…</span>
              ) : null}
            </div>

            <div className="hidden border-b border-stone bg-white/50 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45 md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_2rem] md:gap-3">
              <span>Student</span>
              <span>Parish · batch</span>
              <span />
            </div>

            <ul className="divide-y divide-stone">
              {filtered.length === 0 ? (
                <li className="px-4 py-10 text-center text-sm text-ink/50">
                  No students match these filters.
                </li>
              ) : (
                filtered.map((s) => (
                  <li key={s.user_id}>
                    <Link
                      href={recordDetailHref(s.user_id)}
                      className="group grid items-center gap-3 px-3 py-3 transition-colors hover:bg-white/70 sm:px-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_2rem]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink group-hover:text-pine">
                          {s.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-ink/45">
                          {s.email}
                        </span>
                      </span>
                      <span className="hidden min-w-0 truncate text-sm text-ink/70 md:block">
                        {s.parish_name || "—"}
                        {s.batch_name ? ` · ${s.batch_name}` : ""}
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

            {!query.trim() ? (
              <div className="border-t border-stone px-3 py-2 sm:px-4">
                <DeskPagination
                  page={page}
                  totalItems={total}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                  itemLabel="students"
                />
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function RecordsInsightGuide({ national }: { national: boolean }) {
  const sections = [
    {
      title: "What Records are for",
      body: "A digital scorecard per student — attendance by session date and exam percentages — inspired by the old spreadsheet cohorts, without importing those sheets.",
    },
    {
      title: "Desk layout",
      body: "Filter by parish and batch, then open a student row for their scorecard file: mark attendance, manage exam entries, and email the formal certificate.",
    },
    {
      title: "Classes → Records",
      body: "When you mark present on a class roster (manual, code, or Zoom sync), the same session date is written to that student’s Records attendance.",
    },
    {
      title: "Exams → Records",
      body: "When you release a graded student exam that counts toward record, the score appears on their scorecard automatically. Open-link candidates never appear here.",
    },
    {
      title: "Attendance",
      body: "Add session dates (and optional labels). Toggle present/absent. The attendance rate is present sessions over all recorded sessions.",
    },
    {
      title: "Exam scores",
      body: "Released student exams with “counts toward record” appear here automatically. You can also add manual scores (for paper tests or legacy marks).",
    },
    {
      title: "Include in total",
      body: "Only entries marked “In total” feed the exam average. Untick a score to keep it on the card without affecting the average — same idea as choosing which Excel columns count.",
    },
    {
      title: "Email scorecard",
      body: "Use Email scorecard to send a formal certificate-style summary (enrolled / completed dates, attendance, exam scores) to that student’s email only. When a course certificate file is on file for an active student, the email also includes a download link. Set Date completed on the card when the course finishes — otherwise the email shows “In progress”.",
    },
    {
      title: "Who sees what",
      body: national
        ? "National desks can open any parish’s students. Parish admins only see their own parish."
        : "You only see students enrolled in your parish. Students can view their own read-only scorecard in the portal.",
    },
  ];

  return (
    <div key="insight" className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-3 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          How records work
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          Insight
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
          Attendance from Classes, scores from Exams, and the longitudinal
          scorecard in one place.
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
  );
}
