"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addManualEntry,
  deleteAttendanceSession,
  deleteRecordEntry,
  emailStudentScorecard,
  ensureStudentRecord,
  getRecordBundle,
  listRecordStudents,
  setEntryInclude,
  updateScorecardDates,
  upsertAttendanceSession,
} from "@/app/admin/records/actions";
import { useToast } from "@/components/ui/toast";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import type { RecordBundle } from "@/lib/exams/records";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";

const PAGE_SIZE = 8;

type StudentRow = Awaited<ReturnType<typeof listRecordStudents>>[number];
type MobileSurface = "directory" | "workspace";

export function RecordsManager({
  profile,
  initialStudents,
  parishes,
  batches,
}: {
  profile: AdminProfile;
  initialStudents: StudentRow[];
  parishes: Pick<Parish, "id" | "name">[];
  batches: Batch[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const national = isNationalAdmin(profile);
  const [parishId, setParishId] = useState(
    national ? "" : profile.parish_id ?? "",
  );
  const [batchId, setBatchId] = useState("");
  const [students, setStudents] = useState(initialStudents);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(
    initialStudents[0]?.user_id ?? null,
  );
  const [mobileSurface, setMobileSurface] =
    useState<MobileSurface>("directory");
  const [bundle, setBundle] = useState<RecordBundle | null>(null);
  const [pageView, setPageView] = useState<"desk" | "insight">("desk");

  const filterBatches = batches.filter((b) =>
    parishId ? b.parish_id === parishId : true,
  );

  const directoryClass =
    mobileSurface === "directory" ? "block" : "hidden lg:block";
  const workspaceClass =
    mobileSurface === "workspace" ? "block" : "hidden lg:block";

  useEffect(() => {
    startTransition(async () => {
      try {
        const next = await listRecordStudents({
          parishId: parishId || undefined,
          batchId: batchId || undefined,
        });
        setStudents(next);
        setPage(1);
        setMobileSurface("directory");
        setSelectedUserId(next[0]?.user_id ?? null);
      } catch (e) {
        error(
          e instanceof Error ? e.message : "Could not load students.",
          "Records",
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parishId, batchId]);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageStudents = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!selectedUserId) {
      setBundle(null);
      return;
    }
    let cancelled = false;
    startTransition(async () => {
      const ensured = await ensureStudentRecord(selectedUserId);
      if (!ensured.ok || !ensured.recordId) {
        if (!cancelled) error(ensured.message, "Records");
        return;
      }
      const next = await getRecordBundle(ensured.recordId);
      if (!cancelled) {
        if (!next) {
          error("Scorecard not found or outside your parish scope.", "Records");
          setBundle(null);
        } else {
          setBundle(next);
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserId]);

  function refreshBundle() {
    if (!bundle) return;
    startTransition(async () => {
      const next = await getRecordBundle(bundle.record.id);
      setBundle(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 sm:gap-3">
        {national ? (
          <label className="flex flex-col gap-1 text-xs text-ink/50">
            Parish
            <select
              value={parishId}
              onChange={(e) => {
                setParishId(e.target.value);
                setBatchId("");
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
            onChange={(e) => setBatchId(e.target.value)}
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
        <label className={`flex flex-col gap-1 text-xs text-ink/50 ${national ? "sm:col-span-2 lg:col-span-1" : "sm:col-span-1"}`}>
          Search
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
              setMobileSurface("directory");
            }}
            className="w-full border border-stone bg-white/70 px-2 py-1.5 text-sm outline-none focus:border-pine"
            placeholder="Name or email…"
          />
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <aside className={`${directoryClass} border border-stone bg-mist/50`}>
          <div className="border-b border-stone px-3 py-2 text-xs text-ink/50">
            {filtered.length === 0
              ? "No students"
              : `Showing ${pageStart + 1}–${Math.min(pageStart + PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          </div>
          <ul className="max-h-[min(62vh,36rem)] divide-y divide-stone overflow-y-auto lg:max-h-[min(70vh,40rem)]">
            {pageStudents.map((s) => {
              const active = s.user_id === selectedUserId;
              return (
                <li key={s.user_id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUserId(s.user_id);
                      setMobileSurface("workspace");
                    }}
                    className={`flex w-full flex-col px-3 py-2.5 text-left ${
                      active ? "bg-pine text-mist" : "hover:bg-white/60"
                    }`}
                  >
                    <span className="truncate text-sm font-medium">{s.name}</span>
                    <span
                      className={`truncate text-[0.65rem] ${
                        active ? "text-mist/65" : "text-ink/45"
                      }`}
                    >
                      {s.parish_name || "—"}
                      {s.batch_name ? ` · ${s.batch_name}` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {totalPages > 1 ? (
            <div className="flex items-center justify-between border-t border-stone px-2 py-2">
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
        </aside>

        <section
          className={`${workspaceClass} min-h-[16rem] border border-stone bg-mist sm:min-h-[22rem]`}
        >
          {!bundle ? (
            <div className="flex min-h-[16rem] items-center justify-center px-5 text-center text-sm text-ink/50 sm:min-h-[22rem]">
              {pending ? "Loading scorecard…" : "Select a student"}
            </div>
          ) : (
            <Scorecard
              bundle={bundle}
              pending={pending}
              onBack={() => setMobileSurface("directory")}
              onEmailScorecard={() => {
                const email = bundle.record.student_email?.trim();
                if (!email) {
                  error("This student has no email on their profile.", "Records");
                  return;
                }
                if (
                  !window.confirm(
                    `Email the formal scorecard to ${email}? Only the student will receive it.`,
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  const next = await emailStudentScorecard(bundle.record.id);
                  if (next.ok) success(next.message, "Records");
                  else error(next.message, "Records");
                });
              }}
              onSaveDates={(dates) => {
                startTransition(async () => {
                  const next = await updateScorecardDates({
                    recordId: bundle.record.id,
                    ...dates,
                  });
                  if (next.ok) {
                    success(next.message, "Records");
                    refreshBundle();
                  } else error(next.message, "Records");
                });
              }}
              onAttendance={(input) => {
                startTransition(async () => {
                  const next = await upsertAttendanceSession({
                    recordId: bundle.record.id,
                    ...input,
                  });
                  if (next.ok) {
                    success(next.message, "Records");
                    refreshBundle();
                  } else error(next.message, "Records");
                });
              }}
              onDeleteSession={(id) => {
                startTransition(async () => {
                  const next = await deleteAttendanceSession(id);
                  if (next.ok) {
                    success(next.message, "Records");
                    refreshBundle();
                  } else error(next.message, "Records");
                });
              }}
              onAddEntry={(input) => {
                startTransition(async () => {
                  const next = await addManualEntry({
                    recordId: bundle.record.id,
                    ...input,
                  });
                  if (next.ok) {
                    success(next.message, "Records");
                    refreshBundle();
                  } else error(next.message, "Records");
                });
              }}
              onToggleInclude={(id, include) => {
                startTransition(async () => {
                  const next = await setEntryInclude(id, include);
                  if (next.ok) {
                    success(next.message, "Records");
                    refreshBundle();
                  } else error(next.message, "Records");
                });
              }}
              onDeleteEntry={(id) => {
                startTransition(async () => {
                  const next = await deleteRecordEntry(id);
                  if (next.ok) {
                    success(next.message, "Records");
                    refreshBundle();
                  } else error(next.message, "Records");
                });
              }}
            />
          )}
        </section>
      </div>
        </>
      )}
    </div>
  );
}

function Scorecard({
  bundle,
  pending,
  onBack,
  onEmailScorecard,
  onSaveDates,
  onAttendance,
  onDeleteSession,
  onAddEntry,
  onToggleInclude,
  onDeleteEntry,
}: {
  bundle: RecordBundle;
  pending: boolean;
  onBack?: () => void;
  onEmailScorecard: () => void;
  onSaveDates: (input: {
    enrolled_at: string | null;
    completed_at: string | null;
  }) => void;
  onAttendance: (input: {
    session_date: string;
    label?: string;
    present: boolean;
  }) => void;
  onDeleteSession: (id: string) => void;
  onAddEntry: (input: {
    label: string;
    percent: number;
    include_in_total?: boolean;
  }) => void;
  onToggleInclude: (id: string, include: boolean) => void;
  onDeleteEntry: (id: string) => void;
}) {
  const [sessionDate, setSessionDate] = useState("");
  const [sessionLabel, setSessionLabel] = useState("");
  const [entryLabel, setEntryLabel] = useState("");
  const [entryPercent, setEntryPercent] = useState("80");
  const [enrolledAt, setEnrolledAt] = useState(
    bundle.record.enrolled_at?.slice(0, 10) ?? "",
  );
  const [completedAt, setCompletedAt] = useState(
    bundle.record.completed_at?.slice(0, 10) ?? "",
  );

  const enrolledKey = bundle.record.enrolled_at ?? "";
  const completedKey = bundle.record.completed_at ?? "";
  const [datesKey, setDatesKey] = useState(`${enrolledKey}|${completedKey}`);
  if (datesKey !== `${enrolledKey}|${completedKey}`) {
    setDatesKey(`${enrolledKey}|${completedKey}`);
    setEnrolledAt(bundle.record.enrolled_at?.slice(0, 10) ?? "");
    setCompletedAt(bundle.record.completed_at?.slice(0, 10) ?? "");
  }

  return (
    <div className="animate-panel-in">
      <header className="border-b border-stone px-3 py-4 sm:px-5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
          >
            <span aria-hidden>←</span> Directory
          </button>
        ) : null}
        <p className="text-[0.65rem] uppercase tracking-[0.14em] text-celadon">
          Scorecard
          {bundle.record.parish_name ? ` · ${bundle.record.parish_name}` : ""}
          {bundle.record.batch_name
            ? ` · ${bundle.record.batch_name}${bundle.record.batch_year ? ` (${bundle.record.batch_year})` : ""}`
            : ""}
        </p>
        <div className="mt-3 flex items-start gap-4">
          <div className="relative h-[7.5rem] w-24 shrink-0 overflow-hidden border border-pine/25 bg-mist">
            {bundle.record.passport_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bundle.record.passport_url}
                alt={`Passport photo of ${bundle.record.student_name}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-display text-xl tracking-wide text-pine/35">
                {(bundle.record.student_name || "S")
                  .split(/\s+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase() ?? "")
                  .join("") || "S"}
              </div>
            )}
            <span className="absolute inset-x-0 bottom-0 bg-pine/80 px-1 py-0.5 text-center text-[0.55rem] uppercase tracking-[0.12em] text-white/90">
              Passport
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl text-pine sm:text-2xl">
              {bundle.record.student_name}
            </h2>
            <p className="mt-1 truncate text-sm text-ink/55">
              {bundle.record.student_email}
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <p>
                  <span className="text-ink/45">Exam avg </span>
                  <span className="font-medium text-pine tabular-nums">
                    {bundle.average != null ? `${bundle.average}%` : "—"}
                  </span>
                </p>
                <p>
                  <span className="text-ink/45">Attendance </span>
                  <span className="font-medium text-pine tabular-nums">
                    {bundle.attendance != null ? `${bundle.attendance}%` : "—"}
                  </span>
                </p>
              </div>
              <button
                type="button"
                disabled={pending || !bundle.record.student_email}
                onClick={onEmailScorecard}
                className="border border-pine/30 bg-white/70 px-3 py-1.5 text-sm font-medium text-pine disabled:opacity-50"
                title={
                  bundle.record.student_email
                    ? `Email formal scorecard to ${bundle.record.student_email}`
                    : "Student has no email on file"
                }
              >
                Email scorecard
              </button>
            </div>
          </div>
        </div>

        <form
          className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            onSaveDates({
              enrolled_at: enrolledAt || null,
              completed_at: completedAt || null,
            });
          }}
        >
          <label className="block text-xs text-ink/50">
            Date enrolled
            <input
              name="enrolled_at"
              type="date"
              value={enrolledAt}
              onChange={(e) => setEnrolledAt(e.target.value)}
              className="mt-1 w-full border border-stone bg-white/70 px-2 py-1.5 text-sm text-ink outline-none focus:border-pine"
            />
          </label>
          <label className="block text-xs text-ink/50">
            Date completed
            <input
              name="completed_at"
              type="date"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
              className="mt-1 w-full border border-stone bg-white/70 px-2 py-1.5 text-sm text-ink outline-none focus:border-pine"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="border border-pine/25 px-3 py-1.5 text-sm text-pine disabled:opacity-60"
          >
            Save dates
          </button>
          <p className="sm:col-span-3 text-xs text-ink/45">
            These appear on the emailed scorecard. Leave completed blank while
            the course is still in progress.
          </p>
        </form>
      </header>

      <div className="grid gap-0 lg:grid-cols-2">
        <div className="border-b border-stone px-3 py-4 lg:border-b-0 lg:border-r sm:px-5">
          <h3 className="font-display text-lg text-pine">Attendance</h3>
          <p className="mt-1 text-xs text-ink/45">
            Mark sessions present — like the spreadsheet columns.
          </p>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!sessionDate) return;
              onAttendance({
                session_date: sessionDate,
                label: sessionLabel,
                present: true,
              });
              setSessionDate("");
              setSessionLabel("");
            }}
          >
            <input
              type="date"
              required
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="border border-stone bg-white/70 px-2 py-1.5 text-sm"
            />
            <input
              value={sessionLabel}
              onChange={(e) => setSessionLabel(e.target.value)}
              placeholder="Label"
              className="min-w-[6rem] flex-1 border border-stone bg-white/70 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={pending}
              className="bg-pine px-3 py-1.5 text-sm text-mist disabled:opacity-60"
            >
              Add
            </button>
          </form>
          <ul className="mt-3 max-h-56 divide-y divide-stone overflow-y-auto border-y border-stone">
            {bundle.sessions.length === 0 ? (
              <li className="py-6 text-center text-sm text-ink/45">
                No sessions yet
              </li>
            ) : (
              bundle.sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      onAttendance({
                        session_date: s.session_date,
                        label: s.label ?? undefined,
                        present: !s.present,
                      })
                    }
                    className={`font-mono text-xs uppercase ${
                      s.present ? "text-celadon" : "text-ink/35"
                    }`}
                  >
                    {s.present ? "Y" : "N"}
                  </button>
                  <span className="min-w-0 flex-1 truncate">
                    {s.label || s.session_date}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeleteSession(s.id)}
                    className="text-xs text-red-800"
                  >
                    Remove
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <h3 className="font-display text-lg text-pine">Exam scores</h3>
          <p className="mt-1 text-xs text-ink/45">
            Toggle “in total” to include in the average — released exams land
            here automatically.
          </p>
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              onAddEntry({
                label: entryLabel,
                percent: Number(entryPercent),
                include_in_total: true,
              });
              setEntryLabel("");
            }}
          >
            <input
              required
              value={entryLabel}
              onChange={(e) => setEntryLabel(e.target.value)}
              placeholder="Exam Y1"
              className="min-w-[8rem] flex-1 border border-stone bg-white/70 px-2 py-1.5 text-sm"
            />
            <input
              type="number"
              min={0}
              max={100}
              value={entryPercent}
              onChange={(e) => setEntryPercent(e.target.value)}
              className="w-20 border border-stone bg-white/70 px-2 py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={pending}
              className="bg-pine px-3 py-1.5 text-sm text-mist disabled:opacity-60"
            >
              Add
            </button>
          </form>
          <ul className="mt-3 max-h-56 divide-y divide-stone overflow-y-auto border-y border-stone">
            {bundle.entries.length === 0 ? (
              <li className="py-6 text-center text-sm text-ink/45">
                No scores yet
              </li>
            ) : (
              bundle.entries.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.label}</p>
                    <p className="text-xs text-ink/45">
                      {e.percent}% {e.passed ? "pass" : "fail"} · {e.source}
                    </p>
                  </div>
                  <label className="flex items-center gap-1 text-xs text-ink/55">
                    <input
                      type="checkbox"
                      checked={e.include_in_total}
                      onChange={(ev) =>
                        onToggleInclude(e.id, ev.target.checked)
                      }
                    />
                    In total
                  </label>
                  {e.source === "manual" ? (
                    <button
                      type="button"
                      onClick={() => onDeleteEntry(e.id)}
                      className="text-xs text-red-800"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
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
      body: "Filter by parish and batch, pick a student from the list, then edit their scorecard: mark attendance and manage exam entries.",
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
      title: "Exams vs Records",
      body: "Exams compose and grade online papers. Records hold the longitudinal view across the course run. Open-link candidates never appear here.",
    },
    {
      title: "Email scorecard",
      body: "Use Email scorecard to send a formal certificate-style summary (enrolled / completed dates, attendance, exam scores) to that student’s email only. Set Date completed on the card when the course finishes — otherwise the email shows “In progress”. Delivery uses the portal email service.",
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
          Attendance, exam percentages, and which scores count toward the
          average.
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
