"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  bulkDeleteStudentAccounts,
  bulkSetManualsSent,
  bulkSetStudentsActive,
  bulkUpdateEnrolmentStatus,
  bulkUpdatePaymentStatus,
  type StudentActionResult,
} from "@/app/admin/students/actions";
import {
  defaultStudentDeskFilters,
  enrolmentMatchesDateFilter,
  parseStudentDeskListQuery,
  StudentDeskFilters,
  studentDeskListQuery,
  studentDeskListQueriesEqual,
  type StudentDeskFilterState,
  type StudentDeskLane,
} from "@/components/admin/student-desk-filters";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import {
  ENROLMENT_STATUS_META,
  ENROLMENT_STATUSES,
  PAYMENT_STATUS_META,
  PAYMENT_STATUSES,
  isStudentFeePaid,
  studentFeeSnap,
  studentFullName,
  studentProgrammeFeeLane,
  type AdminStudentRecord,
} from "@/lib/admin/students";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { INTAKE_LABELS } from "@/lib/cohorts/intake";
import { SATURDAY_SLOT_LABELS } from "@/lib/cohorts/saturday";
import type { EnrolmentStatus, PaymentStatus } from "@/lib/student/types";
import { type Batch, type Parish } from "@/lib/parishes";
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";
import { DeskPagination } from "@/lib/ui/desk-pagination";
import { useDebouncedValue } from "@/lib/ui/use-debounced-value";

const STUDENTS_PAGE_SIZE = 12;

type PageView = "desk" | "insight";

type BulkConfirm =
  | { kind: "enrolment"; status: EnrolmentStatus }
  | { kind: "payment"; status: PaymentStatus }
  | { kind: "pause" }
  | { kind: "reactivate" }
  | { kind: "manuals" }
  | { kind: "delete" }
  | { kind: "export" };

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

function downloadStudentsCsv(
  rows: AdminStudentRecord[],
  filename: string,
) {
  const header = [
    "name",
    "email",
    "active",
    "enrolment_status",
    "payment_status",
    "parish",
    "batch",
    "intake",
    "saturday",
    "reference",
    "programme_fee_paid",
  ];
  const lines = [
    header.join(","),
    ...rows.map((student) => {
      const cells = [
        studentFullName(student),
        student.email,
        student.is_active ? "yes" : "no",
        student.enrolment?.status ?? "",
        student.enrolment?.payment_status ?? "",
        student.enrolment?.parish_name ?? "",
        student.enrolment?.batch_name ?? "",
        student.enrolment?.intake_key
          ? INTAKE_LABELS[student.enrolment.intake_key]
          : "",
        student.enrolment?.saturday_slot
          ? SATURDAY_SLOT_LABELS[student.enrolment.saturday_slot]
          : "",
        student.enrolment?.reference ?? "",
        isStudentFeePaid(studentFeeSnap(student, "tuition")) ? "yes" : "no",
      ];
      return cells
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(",");
    }),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
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
  const [pending, startTransition] = useTransition();
  const national = isNationalAdmin(profile);

  const initial = parseStudentDeskListQuery(
    searchParams.toString(),
    profile.parish_id,
    national,
  );

  const [pageView, setPageView] = useState<PageView>("desk");
  const [lane, setLane] = useState<StudentDeskLane>(initial.lane);
  const [query, setQuery] = useState(initial.query);
  const debouncedQuery = useDebouncedValue(query, 450);
  const [filters, setFilters] = useState<StudentDeskFilterState>(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [bulkEnrolStatus, setBulkEnrolStatus] =
    useState<EnrolmentStatus>("accepted");
  const [bulkPayStatus, setBulkPayStatus] =
    useState<PaymentStatus>("pending_review");
  const [openingStudentId, setOpeningStudentId] = useState<string | null>(
    null,
  );

  const busy = pending || Boolean(busyLabel) || Boolean(openingStudentId);

  const listQuery = useMemo(
    () => studentDeskListQuery({ lane, query: debouncedQuery, filters, page }),
    [lane, debouncedQuery, filters, page],
  );

  useEffect(() => {
    const next = studentDeskListQuery({ lane, query: debouncedQuery, filters, page });
    const current = searchParams.toString();
    const normalizedCurrent = current ? `?${current}` : "";
    if (!studentDeskListQueriesEqual(next, normalizedCurrent, profile.parish_id, national)) {
      const href = next ? `${pathname}${next}` : pathname;
      window.history.replaceState(window.history.state, "", href);
    }
  }, [lane, debouncedQuery, filters, page, pathname, searchParams, profile.parish_id, national]);

  useEffect(() => {
    setOpeningStudentId(null);
  }, [pathname]);

  const proofReviewCount = useMemo(
    () =>
      students.filter(
        (s) => s.enrolment?.payment_status === "pending_review",
      ).length,
    [students],
  );

  const studentSearchHaystacks = useMemo(() => {
    return new Map(
      students.map((student) => [
        student.id,
        [
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
          .toLowerCase(),
      ]),
    );
  }, [students]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return students.filter((student) => {
      if (lane !== "all" && laneFor(student) !== lane) return false;
      if (
        filters.intake &&
        student.enrolment?.intake_key !== filters.intake
      ) {
        return false;
      }
      if (filters.parish && student.enrolment?.parish_id !== filters.parish) {
        return false;
      }
      if (filters.batch && student.enrolment?.batch_id !== filters.batch) {
        return false;
      }
      if (
        filters.batchYear &&
        String(student.enrolment?.batch_year ?? "") !== filters.batchYear
      ) {
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
      if (filters.programmeFee !== "all") {
        const feeLane = studentProgrammeFeeLane(student);
        if (feeLane !== filters.programmeFee) return false;
      }
      if (
        filters.enrolmentStatus &&
        student.enrolment?.status !== filters.enrolmentStatus
      ) {
        return false;
      }
      if (
        filters.dateKind &&
        filters.dateFrom &&
        !enrolmentMatchesDateFilter(
          student.enrolment,
          filters.dateKind,
          filters.dateFrom,
          filters.dateTo,
        )
      ) {
        return false;
      }
      if (!q) return true;
      return studentSearchHaystacks.get(student.id)?.includes(q) ?? false;
    });
  }, [students, lane, debouncedQuery, filters, studentSearchHaystacks]);

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

  const pageAllSelected =
    pageStudents.length > 0 &&
    pageStudents.every((student) => selected.has(student.id));
  const pageSomeSelected =
    pageStudents.some((student) => selected.has(student.id)) && !pageAllSelected;

  const selectedStudents = useMemo(
    () => students.filter((student) => selected.has(student.id)),
    [students, selected],
  );

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [lane, debouncedQuery, filters]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function goToPage(next: number) {
    const target = Math.min(totalPages, Math.max(1, next));
    setPage(target);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function studentDetailHref(studentId: string) {
    const from = listQuery.startsWith("?") ? listQuery.slice(1) : "";
    return from
      ? `/admin/students/${studentId}?from=${encodeURIComponent(from)}`
      : `/admin/students/${studentId}`;
  }

  function openStudentFile(studentId: string) {
    setOpeningStudentId(studentId);
    router.push(studentDetailHref(studentId));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) {
        for (const student of pageStudents) next.delete(student.id);
      } else {
        for (const student of pageStudents) next.add(student.id);
      }
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((student) => student.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function runBulk(
    action: () => Promise<StudentActionResult>,
    label: string,
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          await deskSuccess({ text: result.message });
          clearSelection();
          router.refresh();
        } else {
          await deskError({ text: result.message });
        }
      } catch (err) {
        console.error("[students/bulk]", err);
        await deskError({
          text: "Something went wrong. Please try again.",
        });
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function requestBulk(confirm: BulkConfirm) {
    if (busy || selected.size === 0) return;
    const count = selected.size;
    const who = `${count} student${count === 1 ? "" : "s"}`;
    const ids = [...selected];

    switch (confirm.kind) {
      case "enrolment": {
        const accepting = confirm.status === "accepted";
        const ok = await deskConfirm({
          title: `Set enrolment to ${ENROLMENT_STATUS_META[confirm.status].label}?`,
          text: accepting
            ? `This updates enrolment status for ${who}. Each student moving to Accepted will receive an acceptance email — please wait while those are sent.`
            : `This updates enrolment status for ${who}.`,
          confirmLabel: accepting ? "Accept and email" : "Update status",
        });
        if (!ok) return;
        runBulk(
          () => bulkUpdateEnrolmentStatus(ids, confirm.status),
          accepting
            ? "Accepting students and sending emails…"
            : "Updating enrolment…",
        );
        return;
      }
      case "payment": {
        const ok = await deskConfirm({
          title: `Mark payment ${PAYMENT_STATUS_META[confirm.status].label}?`,
          text: `This updates application payment for ${who}. Marking paid syncs the programme fee.`,
          confirmLabel: "Update payment",
        });
        if (!ok) return;
        runBulk(
          () => bulkUpdatePaymentStatus(ids, confirm.status),
          "Updating payment…",
        );
        return;
      }
      case "pause": {
        const ok = await deskConfirm({
          title: `Pause ${who}?`,
          text: "Selected students will not be able to sign in. A notice email is sent where possible.",
          confirmLabel: "Pause seats",
          danger: true,
        });
        if (!ok) return;
        runBulk(() => bulkSetStudentsActive(ids, false), "Pausing seats…");
        return;
      }
      case "reactivate": {
        const ok = await deskConfirm({
          title: `Reactivate ${who}?`,
          text: "Selected students will be able to sign in again.",
          confirmLabel: "Reactivate",
        });
        if (!ok) return;
        runBulk(() => bulkSetStudentsActive(ids, true), "Reactivating…");
        return;
      }
      case "manuals": {
        const ok = await deskConfirm({
          title: `Mark manuals send 1 of 3 for ${who}?`,
          text: "Students who already have send 1 marked are skipped. Notification emails are queued for the rest.",
          confirmLabel: "Send manuals 1",
        });
        if (!ok) return;
        runBulk(() => bulkSetManualsSent(ids), "Sending manuals…");
        return;
      }
      case "delete": {
        const ok = await deskConfirm({
          title: `Delete ${who}?`,
          text: "This permanently removes the selected accounts, enrolment data, and portal access. This cannot be undone.",
          confirmLabel: count === 1 ? "Delete student" : "Delete students",
          danger: true,
        });
        if (!ok) return;
        runBulk(
          () => bulkDeleteStudentAccounts(ids),
          "Removing students…",
        );
        return;
      }
      case "export": {
        downloadStudentsCsv(
          selectedStudents,
          `sod-students-${new Date().toISOString().slice(0, 10)}.csv`,
        );
        return;
      }
    }
  }

  return (
    <div className="relative space-y-3 sm:space-y-4" aria-busy={busy}>
      <DeskLoaderOverlay
        active={busy}
        label={
          openingStudentId
            ? "Opening student file…"
            : (busyLabel ?? "Working…")
        }
      />

      <nav
        data-tour="students-tabs"
        className="flex flex-wrap items-center justify-between gap-2 border-b border-stone pb-px"
        aria-label="Students page"
      >
        <div className="flex gap-1 overflow-x-auto">
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
        </div>
        {pageView === "desk" ? (
          <button
            type="button"
            onClick={() => {
              setBusyLabel("Refreshing students…");
              router.refresh();
              window.setTimeout(() => setBusyLabel(null), 800);
            }}
            disabled={busy}
            className="shrink-0 border border-stone bg-white/70 px-2.5 py-1 text-xs font-medium text-ink/70 hover:border-pine/40 hover:text-pine disabled:opacity-50"
          >
            Refresh
          </button>
        ) : null}
      </nav>

      {pageView === "insight" ? (
        <StudentsInsightGuide national={national} />
      ) : (
        <>
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

          <StudentDeskFilters
            query={query}
            onQueryChange={setQuery}
            lane={lane}
            onLaneChange={setLane}
            filters={filters}
            onFiltersChange={setFilters}
            parishes={parishes}
            batches={batches}
            national={national}
            resultCount={filtered.length}
            totalCount={students.length}
          />

          {selected.size > 0 ? (
            <section className="sticky top-0 z-20 space-y-3 border border-pine/25 bg-mist/95 px-3 py-3 shadow-[0_8px_24px_-16px_rgba(20,53,44,0.45)] backdrop-blur-sm sm:px-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-ink/70">
                  <span className="font-medium text-pine">{selected.size}</span>{" "}
                  selected
                  {selected.size < filtered.length ? (
                    <>
                      {" "}
                      ·{" "}
                      <button
                        type="button"
                        onClick={selectAllFiltered}
                        disabled={busy}
                        className="font-medium text-pine underline decoration-pine/30 underline-offset-2 disabled:opacity-50"
                      >
                        Select all {filtered.length} matching
                      </button>
                    </>
                  ) : null}
                </p>
                <button
                  type="button"
                  onClick={clearSelection}
                  disabled={busy}
                  className="text-sm text-ink/55 hover:text-pine disabled:opacity-50"
                >
                  Clear
                </button>
              </div>

              <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-end">
                <label className="block min-w-[12rem] flex-1 text-xs">
                  <span className="font-medium uppercase tracking-[0.12em] text-ink/45">
                    Enrolment status
                  </span>
                  <span className="mt-1 flex gap-1">
                    <select
                      value={bulkEnrolStatus}
                      disabled={busy}
                      onChange={(e) =>
                        setBulkEnrolStatus(e.target.value as EnrolmentStatus)
                      }
                      className="min-w-0 flex-1 border border-stone bg-white/80 px-2 py-2 text-sm outline-none focus:border-pine disabled:opacity-50"
                    >
                      {ENROLMENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {ENROLMENT_STATUS_META[status].label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void requestBulk({
                          kind: "enrolment",
                          status: bulkEnrolStatus,
                        })
                      }
                      className="shrink-0 border border-pine px-3 py-2 text-sm font-medium text-pine hover:bg-pine hover:text-mist disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </span>
                </label>

                <label className="block min-w-[12rem] flex-1 text-xs">
                  <span className="font-medium uppercase tracking-[0.12em] text-ink/45">
                    Payment status
                  </span>
                  <span className="mt-1 flex gap-1">
                    <select
                      value={bulkPayStatus}
                      disabled={busy}
                      onChange={(e) =>
                        setBulkPayStatus(e.target.value as PaymentStatus)
                      }
                      className="min-w-0 flex-1 border border-stone bg-white/80 px-2 py-2 text-sm outline-none focus:border-pine disabled:opacity-50"
                    >
                      {PAYMENT_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {PAYMENT_STATUS_META[status].label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void requestBulk({
                          kind: "payment",
                          status: bulkPayStatus,
                        })
                      }
                      className="shrink-0 border border-pine px-3 py-2 text-sm font-medium text-pine hover:bg-pine hover:text-mist disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </span>
                </label>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void requestBulk({ kind: "manuals" })}
                    className="border border-stone px-3 py-2 text-sm text-ink/75 hover:border-pine hover:text-pine disabled:opacity-50"
                  >
                    Manuals 1 of 3
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void requestBulk({ kind: "reactivate" })}
                    className="border border-stone px-3 py-2 text-sm text-ink/75 hover:border-pine hover:text-pine disabled:opacity-50"
                  >
                    Reactivate
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void requestBulk({ kind: "pause" })}
                    className="border border-red-800/30 px-3 py-2 text-sm text-red-900/80 hover:border-red-800/50 disabled:opacity-50"
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void requestBulk({ kind: "delete" })}
                    className="inline-flex items-center justify-center border border-red-800/35 px-2.5 py-2 text-red-900/85 hover:border-red-800/60 hover:bg-red-50 disabled:opacity-50"
                    aria-label={`Delete ${selected.size} selected student${selected.size === 1 ? "" : "s"}`}
                    title="Delete selected"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || selectedStudents.length === 0}
                    onClick={() => void requestBulk({ kind: "export" })}
                    className="border border-stone px-3 py-2 text-sm text-ink/75 hover:border-pine hover:text-pine disabled:opacity-50"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <section className="border border-stone bg-mist/30">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone px-3 py-2.5 text-sm text-ink/55 sm:px-4 sm:py-3">
              <p>
                {filtered.length === 0
                  ? "No students match."
                  : `${filtered.length} in roster`}
              </p>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                Select rows for bulk actions · open a name for the full file
              </p>
            </div>

            {filtered.length > 0 ? (
              <DeskPagination
                variant="header"
                page={currentPage}
                totalItems={filtered.length}
                pageSize={STUDENTS_PAGE_SIZE}
                onPageChange={goToPage}
                className="px-3 sm:px-4"
                itemLabel="students"
              />
            ) : null}

            <div className="hidden border-b border-stone bg-white/50 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45 md:grid md:grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_6rem_7rem_5rem_2rem] md:items-center md:gap-3">
              <label className="flex items-center justify-center">
                <span className="sr-only">Select page</span>
                <input
                  type="checkbox"
                  checked={pageAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = pageSomeSelected;
                  }}
                  onChange={togglePage}
                  disabled={busy || pageStudents.length === 0}
                  className="size-4 accent-pine"
                />
              </label>
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
                  onOpen={() => openStudentFile(student.id)}
                  opening={openingStudentId === student.id}
                  checked={selected.has(student.id)}
                  onToggle={() => toggleOne(student.id)}
                  disabled={busy}
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

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M8 7v12a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 11v5M14 11v5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StudentListRow({
  student,
  href,
  onOpen,
  opening,
  checked,
  onToggle,
  disabled,
}: {
  student: AdminStudentRecord;
  href: string;
  onOpen: () => void;
  opening?: boolean;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const name = studentFullName(student);
  const status = student.enrolment?.status;
  const feeLane = studentProgrammeFeeLane(student);
  const slot = student.enrolment?.saturday_slot;

  function handleOpen(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (disabled || opening) return;
    onOpen();
  }

  const rowLinkClass = opening ? "pointer-events-none opacity-70" : undefined;

  return (
    <li>
      <div className="group grid items-center gap-3 px-3 py-3 transition-colors hover:bg-white/70 sm:px-4 md:grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_6rem_7rem_5rem_2rem]">
        <label className="flex items-center justify-center self-start pt-2 md:self-center md:pt-0">
          <span className="sr-only">Select {name}</span>
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={onToggle}
            className="size-4 accent-pine"
          />
        </label>

        <Link
          href={href}
          onClick={handleOpen}
          className={`flex min-w-0 items-start gap-3 ${rowLinkClass ?? ""}`}
          aria-busy={opening}
        >
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
            {student.enrolment?.intake_key ? (
              <span className="mt-1 inline-block border border-celadon/30 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-[0.1em] text-celadon">
                {student.enrolment.intake_key === "november"
                  ? "C1 · Nov"
                  : student.enrolment.intake_key === "january"
                    ? "C2 · Jan"
                    : "C3 · Feb"}
              </span>
            ) : null}
            {student.path.exam_average != null ? (
              <span className="mt-1 inline-block text-[0.65rem] tabular-nums text-ink/40">
                Exam avg {student.path.exam_average}%
              </span>
            ) : null}
          </span>
        </Link>

        <Link
          href={href}
          onClick={handleOpen}
          className={`hidden min-w-0 md:block ${rowLinkClass ?? ""}`}
        >
          <p className="truncate text-sm text-ink/75">
            {student.enrolment?.parish_name ?? "—"}
          </p>
          <p className="truncate text-xs text-ink/45">
            {student.enrolment?.batch_name
              ? student.enrolment.batch_year != null
                ? `${student.enrolment.batch_name} (${student.enrolment.batch_year})`
                : student.enrolment.batch_name
              : (student.enrolment?.reference ?? "—")}
          </p>
        </Link>

        <Link
          href={href}
          onClick={handleOpen}
          className={`hidden text-sm text-ink/60 md:block ${rowLinkClass ?? ""}`}
        >
          {slot ? SATURDAY_SLOT_LABELS[slot] : "—"}
        </Link>

        <Link
          href={href}
          onClick={handleOpen}
          className={`hidden flex-wrap gap-1 md:flex ${rowLinkClass ?? ""}`}
        >
          <ProgrammeFeePill lane={feeLane} />
        </Link>

        <Link
          href={href}
          onClick={handleOpen}
          className={`hidden md:block ${rowLinkClass ?? ""}`}
        >
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
          onClick={handleOpen}
          className={`ml-auto flex shrink-0 items-center justify-end text-pine/50 group-hover:text-pine md:ml-0 ${rowLinkClass ?? ""}`}
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
        {!student.is_active ? (
          <span className="border border-ink/15 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.1em] text-ink/40">
            Paused
          </span>
        ) : null}
        <ProgrammeFeePill lane={feeLane} />
      </div>
    </li>
  );
}

function ProgrammeFeePill({ lane }: { lane: ReturnType<typeof studentProgrammeFeeLane> }) {
  const label =
    lane === "paid_full"
      ? "Paid in full"
      : lane === "paid_part"
        ? "Part paid"
        : "Not paid";
  const tone =
    lane === "paid_full"
      ? "border-pine/30 bg-pine/5 text-pine"
      : lane === "paid_part"
        ? "border-[#8c3b2f]/30 bg-[#8c3b2f]/5 text-[#8c3b2f]"
        : "border-stone text-ink/40";

  return (
    <span
      className={`border px-1.5 py-0.5 text-[0.6rem] uppercase tracking-[0.08em] ${tone}`}
    >
      {label}
    </span>
  );
}

function StudentsInsightGuide({ national }: { national: boolean }) {
  return (
    <section className="space-y-4 border border-stone bg-mist/40 px-4 py-5 sm:px-6 sm:py-6">
      <div>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          How this desk works
        </p>
        <h2 className="mt-1 font-display text-xl text-pine sm:text-2xl">
          Students insight
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/65">
          One filter panel covers intake (Cohort 1–3), parish batch, Saturday,
          roster status, and fees. Select rows for bulk updates, or open a file
          for full placement
          {national ? " across all regions" : ""}.
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {[
          {
            title: "Programme intakes",
            body: "Programme intake is Cohort 1 (November), Cohort 2 (January), or Cohort 3 (February). Use the dropdown — leave blank for the full roster.",
          },
          {
            title: "Batches & years",
            body: "Batches are parish year groups created on Parishes. Batch year filters everyone tagged with that calendar year across intakes and parishes.",
          },
          {
            title: "Roster status",
            body: "In review = not yet secured. On path = application payment confirmed. Paused = seat inactive.",
          },
          {
            title: "Programme fee",
            body: "Filter by paid in full, part paid, or not paid yet — one £350 programme fee, not separate tuition and graduation lines.",
          },
          {
            title: "Bulk & file",
            body: "Tick rows for enrolment or payment status, pause/reactivate, manuals send 1, or CSV. Open a name for full placement edits.",
          },
        ].map((item) => (
          <li
            key={item.title}
            className="border border-stone bg-white/50 px-4 py-3"
          >
            <p className="text-sm font-medium text-pine">{item.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink/60">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
