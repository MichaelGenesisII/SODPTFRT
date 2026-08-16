"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  deleteStudentAccount,
  type StudentActionResult,
} from "@/app/admin/students/actions";
import { StudentDossier } from "@/components/admin/student-dossier";
import { useToast } from "@/components/ui/toast";
import {
  ENROLMENT_STATUS_META,
  formatAdminDate,
  studentFullName,
  type AdminStudentRecord,
} from "@/lib/admin/students";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import type { EnrolmentStatus } from "@/lib/student/types";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";

const STUDENTS_PAGE_SIZE = 8;

type PathLane = "all" | "review" | "secured" | "paused";
type PageView = "desk" | "insight";
type MobileSurface = "directory" | "workspace";

const LANES: { id: PathLane; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review", label: "In review" },
  { id: "secured", label: "On path" },
  { id: "paused", label: "Paused" },
];

const filterSelectClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

type StudentsManagerProps = {
  students: AdminStudentRecord[];
  profile: AdminProfile;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Pick<
    Batch,
    "id" | "parish_id" | "name" | "year" | "enrolment_open" | "is_active"
  >[];
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();
}

function laneFor(student: AdminStudentRecord): Exclude<PathLane, "all"> {
  if (!student.is_active) return "paused";
  const payment = student.enrolment?.payment_status;
  const status = student.enrolment?.status;
  if (payment === "paid" || status === "paid") return "secured";
  return "review";
}

function statusChipClass(status: EnrolmentStatus) {
  switch (status) {
    case "submitted":
      return "border-celadon/40 text-celadon";
    case "under_review":
      return "border-pine/30 text-pine";
    case "accepted":
      return "border-pine bg-pine/5 text-pine";
    case "payment_pending":
      return "border-[#8c3b2f]/35 text-[#8c3b2f]";
    case "paid":
      return "bg-pine text-mist border-pine";
    case "rejected":
      return "border-ink/20 text-ink/45";
  }
}

export function StudentsManager({
  students,
  profile,
  parishes,
  batches,
}: StudentsManagerProps) {
  const { success, error, info } = useToast();
  const [pending, startTransition] = useTransition();
  const [pageView, setPageView] = useState<PageView>("desk");
  const [lane, setLane] = useState<PathLane>("all");
  const [query, setQuery] = useState("");
  const [parishFilter, setParishFilter] = useState(
    isNationalAdmin(profile) ? "" : profile.parish_id ?? "",
  );
  const [batchFilter, setBatchFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    students[0]?.id ?? null,
  );
  const [mobileSurface, setMobileSurface] =
    useState<MobileSurface>("directory");
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminStudentRecord | null>(
    null,
  );
  const [page, setPage] = useState(1);

  const national = isNationalAdmin(profile);

  const filterBatches = useMemo(
    () =>
      batches.filter((b) =>
        parishFilter ? b.parish_id === parishFilter : true,
      ),
    [batches, parishFilter],
  );

  const counts = useMemo(() => {
    const base: Record<PathLane, number> = {
      all: students.length,
      review: 0,
      secured: 0,
      paused: 0,
    };
    for (const student of students) {
      base[laneFor(student)] += 1;
    }
    return base;
  }, [students]);

  const proofReviewCount = useMemo(
    () =>
      students.filter(
        (s) => s.enrolment?.payment_status === "pending_review",
      ).length,
    [students],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((student) => {
      if (lane !== "all" && laneFor(student) !== lane) return false;
      if (parishFilter && student.enrolment?.parish_id !== parishFilter) {
        return false;
      }
      if (batchFilter && student.enrolment?.batch_id !== batchFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        studentFullName(student),
        student.email,
        student.enrolment?.reference,
        student.enrolment?.reference_compact,
        student.enrolment?.town_city,
        student.enrolment?.local_church,
        student.enrolment?.parish_name,
        student.enrolment?.parish_region,
        student.enrolment?.batch_name,
        student.enrolment?.mobile_number,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [students, lane, query, parishFilter, batchFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / STUDENTS_PAGE_SIZE),
  );
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * STUDENTS_PAGE_SIZE;
  const pageStudents = filtered.slice(
    pageStart,
    pageStart + STUDENTS_PAGE_SIZE,
  );
  const rangeFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + STUDENTS_PAGE_SIZE, filtered.length);

  useEffect(() => {
    setPage(1);
    setMobileSurface("directory");
  }, [lane, query, parishFilter, batchFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (selectedId && filtered.some((s) => s.id === selectedId)) return;
    setSelectedId(filtered[0]?.id ?? null);
    setRevealedPassword(null);
    setMobileSurface("directory");
  }, [filtered, selectedId]);

  const directoryClass =
    mobileSurface === "directory" ? "block" : "hidden lg:block";
  const workspaceClass =
    mobileSurface === "workspace" ? "block" : "hidden lg:block";

  useEffect(() => {
    if (!pendingDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingDelete(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingDelete]);

  const selected =
    filtered.find((student) => student.id === selectedId) ??
    students.find((s) => s.id === selectedId) ??
    null;

  function goToPage(next: number) {
    setPage(Math.min(totalPages, Math.max(1, next)));
  }

  function run(
    action: () => Promise<StudentActionResult>,
    options?: { clearPassword?: boolean },
  ) {
    startTransition(async () => {
      const next = await action();
      if (next.ok) {
        success(next.message, "Students");
        if (next.temporaryPassword) {
          setRevealedPassword(next.temporaryPassword);
          info(
            `Temporary password: ${next.temporaryPassword}`,
            "Share securely",
          );
        } else if (options?.clearPassword) {
          setRevealedPassword(null);
        }
        if (pendingDelete) setPendingDelete(null);
      } else {
        error(next.message, "Students");
      }
    });
  }

  async function copyPassword(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      success("Temporary password copied.", "Students");
    } catch {
      error("Could not copy to clipboard.", "Students");
    }
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
        aria-label="Students page"
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
        <StudentsInsightGuide national={national} />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3.5">
            <StudentStatTile
              label="Students"
              value={students.length}
              hint="On the UK books"
            />
            <StudentStatTile
              label="In review"
              shortLabel="Review"
              value={counts.review}
              hint="Not yet secured"
            />
            <StudentStatTile
              label="On path"
              value={counts.secured}
              hint="Application paid"
            />
            <StudentStatTile
              label="Paused"
              value={counts.paused}
              hint="Seat inactive"
            />
          </section>

          {proofReviewCount > 0 ? (
            <Link
              href="/admin/payments"
              className="flex items-center justify-between gap-3 border border-celadon/40 bg-white px-3 py-2.5 text-sm shadow-[0_8px_20px_-12px_rgba(20,53,44,0.28)] transition hover:border-pine"
            >
              <span>
                <span className="font-medium text-pine">
                  {proofReviewCount} bank proof
                  {proofReviewCount === 1 ? "" : "s"}
                </span>{" "}
                <span className="text-ink/60">waiting on Payments</span>
              </span>
              <span className="shrink-0 text-xs font-medium text-celadon">
                Review →
              </span>
            </Link>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <nav
              className="flex gap-1 overflow-x-auto border-b border-stone pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Student lanes"
            >
              {LANES.map((item) => {
                const active = lane === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLane(item.id)}
                    className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                      active ? "text-pine" : "text-ink/50 hover:text-ink/80"
                    }`}
                  >
                    {item.label}
                    <span className="ml-1.5 tabular-nums text-ink/35">
                      {counts[item.id]}
                    </span>
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

            <label className="block w-full sm:max-w-sm">
              <span className="sr-only">Search students</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email, parish, ref…"
                className="w-full border border-stone bg-white/70 px-3 py-2 text-sm outline-none placeholder:text-ink/35 focus:border-pine focus:bg-mist"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
            {national ? (
              <label className="flex flex-col gap-1 text-xs text-ink/50">
                Parish
                <select
                  value={parishFilter}
                  onChange={(event) => {
                    setParishFilter(event.target.value);
                    setBatchFilter("");
                  }}
                  className={filterSelectClass}
                >
                  <option value="">All parishes</option>
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
                value={batchFilter}
                onChange={(event) => setBatchFilter(event.target.value)}
                className={filterSelectClass}
              >
                <option value="">All batches</option>
                {filterBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {formatBatchLabel(b)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <section
              className={`${directoryClass} border border-stone bg-mist/50`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone px-3 py-2.5 text-sm text-ink/55 sm:px-4 sm:py-3">
                <p>
                  {filtered.length === 0
                    ? "No students match."
                    : `Showing ${rangeFrom}–${rangeTo} of ${filtered.length}`}
                </p>
                {filtered.length > 0 ? (
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                    {STUDENTS_PAGE_SIZE}/page
                  </p>
                ) : null}
              </div>
              <ul className="max-h-[min(62vh,36rem)] divide-y divide-stone overflow-y-auto lg:max-h-[min(70vh,40rem)]">
                {pageStudents.map((student) => {
                  const active = student.id === selected?.id;
                  const name = studentFullName(student);
                  const status = student.enrolment?.status;
                  return (
                    <li key={student.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(student.id);
                          setRevealedPassword(null);
                          setMobileSurface("workspace");
                        }}
                        className={`flex w-full items-start gap-3 px-3 py-3 text-left transition-colors sm:px-4 sm:py-3.5 ${
                          active ? "bg-pine text-mist" : "hover:bg-stone/40"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center text-xs font-medium ${
                            active
                              ? "bg-mist/15 text-mist"
                              : "bg-stone/70 text-pine"
                          }`}
                        >
                          {initials(name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2">
                            <span className="truncate font-medium">{name}</span>
                            {!student.is_active ? (
                              <span
                                className={`shrink-0 text-[0.65rem] uppercase tracking-[0.12em] ${
                                  active ? "text-mist/55" : "text-ink/40"
                                }`}
                              >
                                Paused
                              </span>
                            ) : null}
                          </span>
                          <span
                            className={`mt-1 block truncate text-xs ${
                              active ? "text-mist/65" : "text-ink/50"
                            }`}
                          >
                            {student.enrolment?.parish_name
                              ? `${student.enrolment.parish_name}${
                                  student.enrolment.batch_name
                                    ? ` · ${student.enrolment.batch_name}`
                                    : ""
                                }`
                              : (student.enrolment?.reference ?? student.email)}
                          </span>
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            {status ? (
                              <span
                                className={`border px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.1em] ${
                                  active
                                    ? "border-mist/25 text-mist/80"
                                    : statusChipClass(status)
                                }`}
                              >
                                {ENROLMENT_STATUS_META[status].label}
                              </span>
                            ) : (
                              <span
                                className={`text-[0.65rem] uppercase tracking-[0.1em] ${
                                  active ? "text-mist/55" : "text-ink/40"
                                }`}
                              >
                                No form
                              </span>
                            )}
                            {student.path.exam_average != null ? (
                              <span
                                className={`text-[0.65rem] tabular-nums ${
                                  active ? "text-mist/60" : "text-ink/40"
                                }`}
                              >
                                Avg {student.path.exam_average}%
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {totalPages > 1 ? (
                <div className="flex items-center justify-between gap-2 border-t border-stone px-3 py-2.5 sm:px-4 sm:py-3">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => goToPage(currentPage - 1)}
                    className="border border-pine/25 px-2.5 py-1.5 text-xs font-medium text-pine disabled:opacity-40 sm:px-3 sm:py-2 sm:text-sm"
                  >
                    Prev
                  </button>
                  <p className="text-xs tabular-nums text-ink/60 sm:text-sm">
                    <span className="font-medium text-ink">{currentPage}</span>/
                    {totalPages}
                  </p>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => goToPage(currentPage + 1)}
                    className="border border-pine/25 px-2.5 py-1.5 text-xs font-medium text-pine disabled:opacity-40 sm:px-3 sm:py-2 sm:text-sm"
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </section>

            <section
              className={`${workspaceClass} min-h-[16rem] border border-stone bg-mist sm:min-h-[24rem]`}
            >
              {!selected ? (
                <div className="flex min-h-[16rem] flex-col items-center justify-center px-5 py-12 text-center sm:min-h-[24rem] sm:px-6 sm:py-16">
                  <p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-celadon">
                    Cohort desk
                  </p>
                  <p className="mt-3 font-display text-xl text-pine sm:text-2xl">
                    Choose a student
                  </p>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink/60">
                    Search the directory, open a file, preview their full
                    application and path, then manage placement or account.
                  </p>
                </div>
              ) : (
                <StudentDossier
                  student={selected}
                  profile={profile}
                  parishes={parishes}
                  batches={batches}
                  pending={pending}
                  revealedPassword={revealedPassword}
                  onBack={() => setMobileSurface("directory")}
                  onRun={run}
                  onDeleteRequest={() => setPendingDelete(selected)}
                  onCopyPassword={copyPassword}
                />
              )}
            </section>
          </div>
        </>
      )}

      {pendingDelete ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-pine/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-student-title"
        >
          <div className="animate-sheet-up w-full max-w-md border border-stone bg-mist px-5 py-6 shadow-[0_20px_60px_rgba(20,53,44,0.25)] sm:px-6">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Irreversible
            </p>
            <h3
              id="delete-student-title"
              className="mt-2 font-display text-2xl text-pine"
            >
              Remove {studentFullName(pendingDelete)}?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              This deletes their Auth account, student seat, and enrolment
              record. Joined {formatAdminDate(pendingDelete.created_at)}.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine"
              >
                Keep student
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => deleteStudentAccount(pendingDelete.id), {
                    clearPassword: true,
                  })
                }
                className="bg-red-800 px-4 py-2.5 text-sm font-medium text-red-50 disabled:opacity-50"
              >
                {pending ? "Removing…" : "Remove permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StudentStatTile({
  label,
  shortLabel,
  value,
  hint,
}: {
  label: string;
  shortLabel?: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl border border-stone/50 bg-white px-2 py-2.5 text-center sm:flex-row sm:items-center sm:gap-3 sm:px-3.5 sm:py-3 sm:text-left">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine sm:h-11 sm:w-11">
        <span className="font-display text-xl text-mist tabular-nums">
          {value}
        </span>
      </div>
      <div className="min-w-0 sm:border-l sm:border-stone/70 sm:pl-3">
        <p className="truncate text-[0.7rem] font-medium text-pine sm:text-sm">
          <span className="sm:hidden">{shortLabel ?? label}</span>
          <span className="hidden sm:inline">{label}</span>
        </p>
        <p className="mt-0.5 hidden truncate text-xs text-ink/50 sm:block">
          {hint}
        </p>
      </div>
    </div>
  );
}

function StudentsInsightGuide({ national }: { national: boolean }) {
  const sections = [
    {
      title: "What this desk is for",
      body: "The main student directory — search, open a file, preview everything they submitted, see attendance and exam scores, then update placement or account tools.",
    },
    {
      title: "Profile",
      body: "Identity and placement at a glance: names, contact, DOB, address, region, parish, batch, and application reference — the fields that lived on the old spreadsheet left columns.",
    },
    {
      title: "Application",
      body: "Full enrolment ledger: faith journey, church roles, occupation, and schools — everything captured on the enrol form.",
    },
    {
      title: "Path",
      body: "Attendance (Y/N by session) and exam percentages from Records. Edit the scorecard on the Records desk; release online exams from Exams → Queue.",
    },
    {
      title: "Manage",
      body: "CRUD for the live student: enrolment status, payment flags, fee rows, editable contact details, parish/batch reassignment, pause/reactivate, temporary password, or remove.",
    },
    {
      title: "Payments",
      body: "Bank proof review lives on the Payments desk. This page surfaces fee status and links across when a proof is waiting — it is not a payments-only screen.",
    },
    {
      title: "Who sees what",
      body: national
        ? "National desks see every student. Pause / temp password / remove email the student (toasts under Students). Marketing mail lives on Campaigns."
        : "You only see students enrolled in your parish. Pause / temp password / remove email that student. Marketing mail lives on Campaigns.",
    },
  ];

  return (
    <div key="insight" className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-3 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          How students work
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          Insight
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
          Directory, dossier tabs, and how this desk relates to Payments,
          Exams, and Records.
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
