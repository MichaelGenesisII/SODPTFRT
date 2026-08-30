"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  defaultStudentDeskFilters,
  parseStudentDeskListQuery,
  StudentDeskFilters,
  studentDeskListQuery,
  type StudentDeskFilterState,
  type StudentDeskLane,
} from "@/components/admin/student-desk-filters";
import {
  ENROLMENT_STATUS_META,
  isStudentFeePaid,
  studentFeeSnap,
  studentFullName,
  type AdminStudentRecord,
} from "@/lib/admin/students";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { SATURDAY_SLOT_LABELS } from "@/lib/cohorts/saturday";
import type { EnrolmentStatus } from "@/lib/student/types";
import { type Batch, type Parish } from "@/lib/parishes";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const STUDENTS_PAGE_SIZE = 12;

type PageView = "desk" | "insight";

const LANES: { id: StudentDeskLane; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review", label: "In review" },
  { id: "secured", label: "On path" },
  { id: "paused", label: "Paused" },
];

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

function laneFor(student: AdminStudentRecord): Exclude<StudentDeskLane, "all"> {
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const national = isNationalAdmin(profile);

  const initial = parseStudentDeskListQuery(
    searchParams.toString(),
    profile.parish_id,
    national,
  );

  const [pageView, setPageView] = useState<PageView>("desk");
  const [lane, setLane] = useState<StudentDeskLane>(initial.lane);
  const [query, setQuery] = useState(initial.query);
  const [filters, setFilters] = useState<StudentDeskFilterState>(initial.filters);
  const [page, setPage] = useState(1);

  const listQuery = useMemo(
    () => studentDeskListQuery({ lane, query, filters }),
    [lane, query, filters],
  );

  useEffect(() => {
    const next = studentDeskListQuery({ lane, query, filters });
    const current = searchParams.toString();
    const normalizedCurrent = current ? `?${current}` : "";
    if (next !== normalizedCurrent) {
      router.replace(next ? `${pathname}${next}` : pathname, { scroll: false });
    }
  }, [lane, query, filters, pathname, router, searchParams]);

  const counts = useMemo(() => {
    const base: Record<StudentDeskLane, number> = {
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
      if (filters.parish && student.enrolment?.parish_id !== filters.parish) {
        return false;
      }
      if (filters.batch && student.enrolment?.batch_id !== filters.batch) {
        return false;
      }
      if (filters.manuals === "sent" && student.manuals_status !== "sent") {
        return false;
      }
      if (
        filters.manuals === "not_sent" &&
        (student.manuals_status ?? "not_sent") !== "not_sent"
      ) {
        return false;
      }
      if (
        filters.saturday &&
        String(student.enrolment?.saturday_slot ?? "") !== filters.saturday
      ) {
        return false;
      }
      const tuition = studentFeeSnap(student, "tuition");
      const graduation = studentFeeSnap(student, "graduation");
      const tuitionPaid = isStudentFeePaid(tuition);
      const graduationPaid = isStudentFeePaid(graduation);
      if (filters.tuition === "paid" && !tuitionPaid) return false;
      if (filters.tuition === "unpaid" && tuitionPaid) return false;
      if (filters.graduation === "paid" && !graduationPaid) return false;
      if (filters.graduation === "unpaid" && graduationPaid) return false;
      if (
        filters.bothFees === "both_paid" &&
        !(tuitionPaid && graduationPaid)
      ) {
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
  }, [students, lane, query, filters]);

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
  }, [lane, query, filters]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function goToPage(next: number) {
    setPage(Math.min(totalPages, Math.max(1, next)));
  }

  function studentDetailHref(studentId: string) {
    const from = listQuery.startsWith("?") ? listQuery.slice(1) : "";
    return from
      ? `/admin/students/${studentId}?from=${encodeURIComponent(from)}`
      : `/admin/students/${studentId}`;
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
        data-tour="students-tabs"
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
          <section
            data-tour="students-stats"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3.5"
          >
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

          <div className="flex flex-col gap-2">
            <nav
              data-tour="students-lanes"
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

            <StudentDeskFilters
              query={query}
              onQueryChange={setQuery}
              filters={filters}
              onFiltersChange={setFilters}
              parishes={parishes}
              batches={batches}
              national={national}
              resultCount={filtered.length}
              totalCount={students.length}
            />
          </div>

          <section className="border border-stone bg-mist/30">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone px-3 py-2.5 text-sm text-ink/55 sm:px-4 sm:py-3">
              <p>
                {filtered.length === 0
                  ? "No students match."
                  : `Showing ${rangeFrom}–${rangeTo} of ${filtered.length}`}
              </p>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                View only — open a row to manage the student
              </p>
            </div>

            <div className="hidden border-b border-stone bg-white/50 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45 md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_6rem_7rem_5rem_2rem] md:gap-3">
              <span>Student</span>
              <span>Placement</span>
              <span>Saturday</span>
              <span>Fees</span>
              <span>Status</span>
              <span />
            </div>

            <ul className="divide-y divide-stone">
              {pageStudents.map((student) => (
                <StudentListRow
                  key={student.id}
                  student={student}
                  href={studentDetailHref(student.id)}
                />
              ))}
            </ul>

            {filtered.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <p className="font-display text-lg text-pine">No matches</p>
                <p className="mt-2 text-sm text-ink/55">
                  Try clearing filters or widening your search.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setLane("all");
                    setQuery("");
                    setFilters(
                      defaultStudentDeskFilters(
                        national ? "" : profile.parish_id,
                        national,
                      ),
                    );
                  }}
                  className="mt-4 border border-pine/30 px-4 py-2 text-sm font-medium text-pine hover:bg-pine hover:text-mist"
                >
                  Reset filters
                </button>
              </div>
            ) : null}

            <DeskPagination
              page={currentPage}
              totalItems={filtered.length}
              pageSize={STUDENTS_PAGE_SIZE}
              onPageChange={goToPage}
              className="px-3 pb-2.5 sm:px-4 sm:pb-3"
              itemLabel="students"
            />
          </section>
        </>
      )}
    </div>
  );
}

function StudentListRow({
  student,
  href,
}: {
  student: AdminStudentRecord;
  href: string;
}) {
  const name = studentFullName(student);
  const status = student.enrolment?.status;
  const tuitionPaid = isStudentFeePaid(studentFeeSnap(student, "tuition"));
  const graduationPaid = isStudentFeePaid(studentFeeSnap(student, "graduation"));
  const slot = student.enrolment?.saturday_slot;

  return (
    <li>
      <div className="group grid items-center gap-3 px-3 py-3 transition-colors hover:bg-white/70 sm:px-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_6rem_7rem_5rem_2rem]">
        <Link href={href} className="flex min-w-0 items-start gap-3">
          {student.passport_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={student.passport_url}
              alt=""
              className="mt-0.5 size-10 shrink-0 object-cover ring-1 ring-pine/10 group-hover:ring-pine/30"
            />
          ) : (
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center bg-stone/70 text-xs font-medium text-pine group-hover:bg-pine group-hover:text-mist">
              {initials(name)}
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink group-hover:text-pine">
              {name}
            </span>
            <span className="mt-0.5 block truncate text-xs text-ink/50">
              {student.email}
            </span>
            {student.path.exam_average != null ? (
              <span className="mt-1 inline-block text-[0.65rem] tabular-nums text-ink/40">
                Exam avg {student.path.exam_average}%
              </span>
            ) : null}
          </span>
        </Link>

        <Link href={href} className="hidden min-w-0 md:block">
          <p className="truncate text-sm text-ink/75">
            {student.enrolment?.parish_name ?? "—"}
          </p>
          <p className="truncate text-xs text-ink/45">
            {student.enrolment?.batch_name ?? student.enrolment?.reference ?? "—"}
          </p>
        </Link>

        <Link href={href} className="hidden text-sm text-ink/60 md:block">
          {slot ? SATURDAY_SLOT_LABELS[slot] : "—"}
        </Link>

        <Link href={href} className="hidden flex-wrap gap-1 md:flex">
          <FeePill label="Tuition" paid={tuitionPaid} />
          <FeePill label="Grad" paid={graduationPaid} />
        </Link>

        <Link href={href} className="hidden md:block">
          {status ? (
            <span
              className={`inline-block border px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.1em] ${statusChipClass(status)}`}
            >
              {ENROLMENT_STATUS_META[status].label}
            </span>
          ) : (
            <span className="text-xs text-ink/40">No form</span>
          )}
          {!student.is_active ? (
            <span className="mt-1 block text-[0.65rem] uppercase tracking-[0.1em] text-ink/40">
              Paused
            </span>
          ) : null}
        </Link>

        <Link
          href={href}
          className="ml-auto flex shrink-0 items-center justify-end text-pine/50 group-hover:text-pine md:ml-0"
          aria-label={`Open ${name}`}
        >
          <span className="text-lg leading-none" aria-hidden>
            →
          </span>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-stone/60 px-3 pb-3 pt-0 md:hidden">
        <span className="text-xs text-ink/50">
          {student.enrolment?.parish_name ?? "No parish"}
          {student.enrolment?.batch_name
            ? ` · ${student.enrolment.batch_name}`
            : ""}
        </span>
        {status ? (
          <span
            className={`border px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.1em] ${statusChipClass(status)}`}
          >
            {ENROLMENT_STATUS_META[status].label}
          </span>
        ) : null}
        <FeePill label="Tuition" paid={tuitionPaid} />
        <FeePill label="Grad" paid={graduationPaid} />
      </div>
    </li>
  );
}

function FeePill({ label, paid }: { label: string; paid: boolean }) {
  return (
    <span
      className={`border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.08em] ${
        paid
          ? "border-celadon/40 bg-celadon/10 text-pine"
          : "border-stone text-ink/40"
      }`}
    >
      {label} {paid ? "paid" : "due"}
    </span>
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
      title: "Navigation",
      body: "The list is view-only — filter, search, and open any row for the full student file. Status, fees, placement, and account changes happen on the detail page only.",
    },
    {
      title: "What this desk is for",
      body: "Search the cohort, open a student file on its own page, preview everything they submitted, see attendance and exam scores, then update placement or account tools.",
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
