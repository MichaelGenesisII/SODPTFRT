"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import {
  assignBatchToCohort,
  getCohortInsightSummary,
  searchCohortInsightStudents,
  updateCohort,
  type CohortActionResult,
} from "@/app/admin/cohorts/actions";
import { CohortsInsight } from "@/components/admin/cohorts-insight";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  COHORT_INSIGHT_PAGE_SIZE,
  type CohortInsightStudentRow,
  type CohortInsightSummary,
} from "@/lib/admin/cohort-insight";
import {
  formatCohortLabel,
  DEFAULT_PROGRAMME_TYPE,
  type Cohort,
} from "@/lib/cohorts";
import { INTAKE_LABELS, type IntakeKey } from "@/lib/cohorts/intake";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50";

type PageView = "desk" | "manage" | "insight";
type ManageFocus = "default" | "create" | "link";

type CohortsManagerProps = {
  cohorts: Cohort[];
  batches: Batch[];
  parishes: Pick<Parish, "id" | "name">[];
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? "")
    .join("")
    .toUpperCase();
}

export function CohortsManager({
  cohorts,
  batches,
  parishes,
}: CohortsManagerProps) {
  const [pageView, setPageView] = useState<PageView>("desk");
  const [selectedId, setSelectedId] = useState<string | null>(
    cohorts[0]?.id ?? null,
  );
  const [manageFocus, setManageFocus] = useState<ManageFocus>("default");

  function openManage(focus: ManageFocus = "default") {
    setManageFocus(focus);
    setPageView("manage");
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
        data-tour="cohorts-tabs"
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
        aria-label="Cohorts page"
      >
        {(
          [
            { id: "desk" as const, label: "Desk" },
            { id: "manage" as const, label: "Manage" },
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
        <CohortsInsight />
      ) : pageView === "manage" ? (
        <CohortsManage
          cohorts={cohorts}
          batches={batches}
          parishes={parishes}
          selectedId={selectedId}
          onSelectId={setSelectedId}
          initialFocus={manageFocus}
          onFocusHandled={() => setManageFocus("default")}
        />
      ) : (
        <CohortsDesk
          cohorts={cohorts}
          batches={batches}
          selectedId={selectedId}
          onSelectId={setSelectedId}
          onOpenManage={openManage}
        />
      )}
    </div>
  );
}

type DeskProps = {
  cohorts: Cohort[];
  batches: Batch[];
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  onOpenManage: (focus?: ManageFocus) => void;
};

function CohortsDesk({
  cohorts,
  batches,
  selectedId,
  onSelectId,
  onOpenManage,
}: DeskProps) {
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const rosterBusy = pending || Boolean(busyLabel);

  const [summary, setSummary] = useState<CohortInsightSummary | null>(null);
  const [rows, setRows] = useState<CohortInsightStudentRow[]>([]);
  const [rosterTotal, setRosterTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [saturdaySlot, setSaturdaySlot] = useState<number | null>(null);
  const queryDebounceReady = useRef(false);

  const selected = cohorts.find((c) => c.id === selectedId) ?? null;

  const cohortBatches = useMemo(
    () => batches.filter((b) => b.cohort_id === selectedId),
    [batches, selectedId],
  );

  const unlinkedBatchCount = useMemo(
    () => batches.filter((b) => !b.cohort_id).length,
    [batches],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(rosterTotal / COHORT_INSIGHT_PAGE_SIZE),
  );
  const pageStart = (page - 1) * COHORT_INSIGHT_PAGE_SIZE;
  const rangeFrom = rosterTotal === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + COHORT_INSIGHT_PAGE_SIZE, rosterTotal);

  const loadRoster = useCallback(
    (next?: {
      cohortId?: string | null;
      query?: string;
      saturdaySlot?: number | null;
      page?: number;
    }) => {
      const id = next?.cohortId === undefined ? selectedId : next.cohortId;
      if (!id) {
        setSummary(null);
        setRows([]);
        setRosterTotal(0);
        return;
      }
      const q = next?.query ?? query;
      const slot =
        next?.saturdaySlot === undefined ? saturdaySlot : next.saturdaySlot;
      const pageNum = next?.page ?? page;

      setBusyLabel("Loading roster…");
      startTransition(async () => {
        try {
          const [summaryResult, studentsResult] = await Promise.all([
            getCohortInsightSummary(id),
            searchCohortInsightStudents({
              cohortId: id,
              query: q,
              saturdaySlot: slot,
              page: pageNum,
            }),
          ]);
          setSummary(summaryResult);
          setRows(studentsResult.rows);
          setRosterTotal(studentsResult.total);
          setPage(studentsResult.page);
        } finally {
          setBusyLabel(null);
        }
      });
    },
    [selectedId, query, saturdaySlot, page],
  );

  useEffect(() => {
    loadRoster({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!queryDebounceReady.current) {
      queryDebounceReady.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      setPage(1);
      loadRoster({ query, page: 1 });
    }, 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function selectCohort(cohort: Cohort) {
    onSelectId(cohort.id);
    setSaturdaySlot(null);
    setPage(1);
    setQuery("");
  }

  function selectSaturday(slot: number | null) {
    setSaturdaySlot(slot);
    setPage(1);
    loadRoster({ saturdaySlot: slot, page: 1 });
  }

  function goToPage(next: number) {
    const clamped = Math.min(totalPages, Math.max(1, next));
    setPage(clamped);
    loadRoster({ page: clamped });
  }

  const activeCohortCount = cohorts.filter((c) => c.is_active).length;

  return (
    <div className="relative space-y-3 sm:space-y-4" aria-busy={rosterBusy}>
      <DeskLoaderOverlay active={rosterBusy} label={busyLabel ?? "Loading…"} />

      <section
        data-tour="cohorts-stats"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3.5"
      >
        <CohortStatTile
          label="Programmes"
          value={cohorts.length}
          hint="UK intake cycles"
        />
        <CohortStatTile
          label="In cohort"
          shortLabel="Roster"
          value={summary?.studentTotal ?? 0}
          hint={selected ? formatCohortLabel(selected) : "Pick a cohort"}
        />
        <CohortStatTile
          label="Linked batches"
          value={summary?.linkedBatches ?? cohortBatches.length}
          hint="Parish year groups"
        />
        <CohortStatTile
          label="Active"
          value={activeCohortCount}
          hint="Open for enrolment"
        />
      </section>

      {unlinkedBatchCount > 0 ? (
        <button
          type="button"
          onClick={() => onOpenManage("link")}
          className="flex w-full items-center justify-between gap-3 border border-celadon/40 bg-white px-3 py-2.5 text-left text-sm shadow-[0_8px_20px_-12px_rgba(20,53,44,0.28)] transition hover:border-pine"
        >
          <span>
            <span className="font-medium text-pine">
              {unlinkedBatchCount} batch
              {unlinkedBatchCount === 1 ? "" : "es"}
            </span>{" "}
            <span className="text-ink/60">not linked to a programme cohort</span>
          </span>
          <span className="shrink-0 text-xs font-medium text-celadon">
            Manage →
          </span>
        </button>
      ) : null}

      <div className="flex flex-col gap-2">
        <nav
          data-tour="cohorts-lanes"
          className="flex gap-1 overflow-x-auto border-b border-stone pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="Programme cohorts"
        >
          {cohorts.map((cohort) => {
            const active = selectedId === cohort.id;
            return (
              <button
                key={cohort.id}
                type="button"
                onClick={() => selectCohort(cohort)}
                className={`relative shrink-0 px-3 py-1.5 text-sm font-medium tracking-wide transition-colors ${
                  active ? "text-pine" : "text-ink/50 hover:text-ink/80"
                }`}
              >
                {cohort.name}
                {!cohort.is_active ? (
                  <span className="ml-1 text-[0.6rem] text-ink/35">· off</span>
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

        <div className="border border-stone bg-mist/40 px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                Roster
              </p>
              <p className="mt-1 text-sm text-ink/60">
                {selected
                  ? formatCohortLabel(selected)
                  : "Select a programme cohort"}
                {summary?.saturdaySlots.length
                  ? ` · ${summary.saturdaySlots.length} Saturday slots`
                  : ""}
              </p>
            </div>
            <label className="block w-full text-sm lg:max-w-md">
              <span className="sr-only">Search roster</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or email…"
                disabled={!selectedId || rosterBusy}
                className={fieldClass}
              />
            </label>
          </div>

          {summary && summary.saturdaySlots.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <SaturdayChip
                active={saturdaySlot == null}
                onClick={() => selectSaturday(null)}
                label="All Saturdays"
              />
              {summary.saturdaySlots.map((slot) => (
                <SaturdayChip
                  key={slot.slot}
                  active={saturdaySlot === slot.slot}
                  onClick={() => selectSaturday(slot.slot)}
                  label={slot.label}
                  count={slot.count}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <section className="border border-stone bg-mist/30">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone px-3 py-2.5 text-sm text-ink/55 sm:px-4 sm:py-3">
          <p>
            {!selectedId
              ? "No cohort selected."
              : rosterTotal === 0
                ? "No students in this cohort."
                : `Showing ${rangeFrom}–${rangeTo} of ${rosterTotal}`}
          </p>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
            View only — open a row for the student file
          </p>
        </div>

        <div className="hidden border-b border-stone bg-white/50 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45 md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_6rem_7rem_2rem] md:gap-3">
          <span>Student</span>
          <span>Placement</span>
          <span>Saturday</span>
          <span>Status</span>
          <span />
        </div>

        <ul className="divide-y divide-stone">
          {rows.map((student) => (
            <CohortStudentRow key={student.profileId} student={student} />
          ))}
        </ul>

        {rows.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="font-display text-lg text-pine">
              {!selectedId ? "Pick a programme cohort" : "No students yet"}
            </p>
            <p className="mt-2 text-sm text-ink/55">
              {!selectedId
                ? "Choose a cohort above, or create one under Manage."
                : "Students appear once enrolments are tied to this programme cohort."}
            </p>
          </div>
        ) : null}

        <DeskPagination
          page={page}
          totalItems={rosterTotal}
          pageSize={COHORT_INSIGHT_PAGE_SIZE}
          onPageChange={goToPage}
          className="px-3 pb-2.5 sm:px-4 sm:pb-3"
          itemLabel="students"
        />
      </section>
    </div>
  );
}

type ManageProps = CohortsManagerProps & {
  selectedId: string | null;
  onSelectId: (id: string | null) => void;
  initialFocus: ManageFocus;
  onFocusHandled: () => void;
};

function CohortsManage({
  cohorts,
  batches,
  parishes,
  selectedId,
  onSelectId,
  initialFocus,
  onFocusHandled,
}: ManageProps) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [adminBusy, setAdminBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<
    | { kind: "unlink"; batch: Batch }
    | {
        kind: "deactivate";
        payload: {
          name: string;
          yearStart: number;
          yearEnd: number;
          isActive: boolean;
        };
      }
    | null
  >(null);
  const linkSectionRef = useRef<HTMLElement>(null);

  const [creatingNew, setCreatingNew] = useState(initialFocus === "create");
  const [name, setName] = useState("");
  const [yearStart, setYearStart] = useState(
    String(new Date().getFullYear()),
  );
  const [yearEnd, setYearEnd] = useState(
    String(new Date().getFullYear() + 1),
  );
  const [isActive, setIsActive] = useState(true);
  const [batchFilter, setBatchFilter] = useState("");
  const [cohortQuery, setCohortQuery] = useState("");

  const selected = cohorts.find((c) => c.id === selectedId) ?? null;

  const parishName = useMemo(
    () => new Map(parishes.map((p) => [p.id, p.name])),
    [parishes],
  );

  const cohortBatches = useMemo(
    () => batches.filter((b) => b.cohort_id === selectedId),
    [batches, selectedId],
  );

  const unlinkedBatchCount = useMemo(
    () => batches.filter((b) => !b.cohort_id).length,
    [batches],
  );

  const unlinkedBatches = useMemo(() => {
    const q = batchFilter.trim().toLowerCase();
    return batches.filter((b) => {
      if (b.cohort_id) return false;
      if (!q) return true;
      const parish = parishName.get(b.parish_id) ?? "";
      return `${b.name} ${b.year} ${parish}`.toLowerCase().includes(q);
    });
  }, [batches, batchFilter, parishName]);

  const filteredCohorts = useMemo(() => {
    const q = cohortQuery.trim().toLowerCase();
    if (!q) return cohorts;
    return cohorts.filter((c) =>
      `${c.name} ${c.year_start} ${c.year_end}`.toLowerCase().includes(q),
    );
  }, [cohorts, cohortQuery]);

  useEffect(() => {
    if (initialFocus === "create") {
      // Create is disabled for fixed intakes — open link section instead.
      onFocusHandled();
      return;
    }
    if (initialFocus === "link" && linkSectionRef.current) {
      linkSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      onFocusHandled();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocus]);

  useEffect(() => {
    if (creatingNew) return;
    if (selected) {
      setName(selected.name);
      setYearStart(String(selected.year_start));
      setYearEnd(String(selected.year_end));
      setIsActive(selected.is_active);
    }
  }, [selected, creatingNew]);

  function selectCohort(cohort: Cohort) {
    onSelectId(cohort.id);
    setCreatingNew(false);
    setName(cohort.name);
    setYearStart(String(cohort.year_start));
    setYearEnd(String(cohort.year_end));
    setIsActive(cohort.is_active);
  }

  function startCreate() {
    onSelectId(null);
    setCreatingNew(true);
    setName("");
    setYearStart(String(new Date().getFullYear()));
    setYearEnd(String(new Date().getFullYear() + 1));
    setIsActive(true);
  }

  function runAdmin(
    action: () => Promise<CohortActionResult>,
    onOk?: () => void,
  ) {
    setAdminBusy(true);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          success(result.message);
          setPendingConfirm(null);
          onOk?.();
        } else {
          error(result.message);
        }
      } finally {
        setAdminBusy(false);
      }
    });
  }

  const busy = adminBusy || pending;

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    if (pendingConfirm.kind === "unlink") {
      runAdmin(() => assignBatchToCohort(pendingConfirm.batch.id, null));
      return;
    }
    if (!selected) return;
    runAdmin(() =>
      updateCohort(selected.id, {
        name: pendingConfirm.payload.name,
        yearStart: pendingConfirm.payload.yearStart,
        yearEnd: pendingConfirm.payload.yearEnd,
        programmeType: DEFAULT_PROGRAMME_TYPE,
        isActive: pendingConfirm.payload.isActive,
      }),
    );
  }

  useEffect(() => {
    if (!pendingConfirm) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setPendingConfirm(null);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [pendingConfirm, busy]);

  return (
    <div className="relative space-y-3 sm:space-y-4" aria-busy={busy}>
      <DeskLoaderOverlay
        active={busy && !pendingConfirm}
        label="Working…"
      />
      <header className="border border-stone bg-mist/50 px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Programme cohorts
        </p>
        <h2 className="mt-1 font-display text-xl tracking-[-0.02em] text-pine sm:text-2xl">
          Manage
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
          Three fixed programme intakes (November, January, February). Link
          parish batches and control which intakes stay open for enrolment.
        </p>
        {unlinkedBatchCount > 0 ? (
          <p className="mt-3 text-sm text-ink/70">
            <span className="font-medium text-pine">{unlinkedBatchCount}</span>{" "}
            unlinked batch{unlinkedBatchCount === 1 ? "" : "es"} waiting to be
            assigned.
          </p>
        ) : null}
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] lg:gap-4">
        <aside className="flex flex-col border border-stone bg-white/60">
          <div className="border-b border-stone px-3 py-3 sm:px-4">
            <label className="block text-sm">
              <span className="sr-only">Search cohorts</span>
              <input
                value={cohortQuery}
                onChange={(e) => setCohortQuery(e.target.value)}
                placeholder="Search programmes…"
                disabled={busy}
                className={fieldClass}
              />
            </label>
          </div>
          <ul className="max-h-[min(24rem,50vh)] divide-y divide-stone overflow-y-auto lg:max-h-none lg:flex-1">
            {filteredCohorts.map((cohort) => {
              const active = selectedId === cohort.id && !creatingNew;
              const linked = batches.filter((b) => b.cohort_id === cohort.id)
                .length;
              return (
                <li key={cohort.id}>
                  <button
                    type="button"
                    onClick={() => selectCohort(cohort)}
                    disabled={busy}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-3 text-left transition sm:px-4 ${
                      active
                        ? "bg-pine/5 ring-1 ring-inset ring-pine/25"
                        : "hover:bg-stone/30"
                    } disabled:opacity-50`}
                  >
                    <span className="text-sm font-medium text-pine">
                      {cohort.name}
                      {!cohort.is_active ? (
                        <span className="ml-1.5 text-[0.65rem] font-normal uppercase tracking-[0.08em] text-ink/40">
                          Inactive
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-ink/50">
                      {cohort.year_start}/{cohort.year_end} · {linked} batch
                      {linked === 1 ? "" : "es"}
                    </span>
                  </button>
                </li>
              );
            })}
            {filteredCohorts.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-ink/50">
                No programmes match your search.
              </li>
            ) : null}
          </ul>
        </aside>

        <div className="min-w-0 space-y-4">
          <section className="border border-stone bg-white/70 px-4 py-5 sm:px-6 sm:py-6">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              {creatingNew ? "New programme" : "Cohort details"}
            </p>
            <h3 className="mt-1 font-display text-lg text-pine">
              {selected
                ? selected.intake_key
                  ? INTAKE_LABELS[selected.intake_key as IntakeKey]
                  : formatCohortLabel(selected)
                : "Select a cohort"}
            </h3>
            {selected?.is_fixed_intake ? (
              <p className="mt-2 text-sm text-ink/55">
                Fixed intake — manage students on the Desk; link parish batches
                below.
              </p>
            ) : null}

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="SP 2022/23"
                  disabled={busy || Boolean(selected?.is_fixed_intake)}
                  className={`mt-1.5 ${fieldClass}`}
                />
              </label>
              <label className="block text-sm">
                Start year
                <input
                  type="number"
                  value={yearStart}
                  onChange={(e) => setYearStart(e.target.value)}
                  disabled={busy || Boolean(selected?.is_fixed_intake)}
                  className={`mt-1.5 ${fieldClass}`}
                />
              </label>
              <label className="block text-sm">
                End year
                <input
                  type="number"
                  value={yearEnd}
                  onChange={(e) => setYearEnd(e.target.value)}
                  disabled={busy || Boolean(selected?.is_fixed_intake)}
                  className={`mt-1.5 ${fieldClass}`}
                />
              </label>
              {selected && !creatingNew ? (
                <label className="flex items-center gap-2 self-end text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={busy}
                  />
                  Active cohort — open for enrolment
                </label>
              ) : null}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {selected && !creatingNew ? (
                <button
                  type="button"
                  disabled={busy || !name.trim()}
                  onClick={() => {
                    const payload = {
                      name,
                      yearStart: Number(yearStart),
                      yearEnd: Number(yearEnd),
                      isActive,
                    };
                    if (selected.is_active && !isActive) {
                      setPendingConfirm({ kind: "deactivate", payload });
                      return;
                    }
                    runAdmin(() =>
                      updateCohort(selected.id, {
                        ...payload,
                        programmeType: DEFAULT_PROGRAMME_TYPE,
                      }),
                    );
                  }}
                  className="inline-flex min-h-[2.75rem] items-center justify-center border border-pine px-5 py-2.5 text-sm font-medium text-pine hover:bg-pine hover:text-mist disabled:opacity-50"
                >
                  {busy ? (
                    <DeskLoader label="Saving cohort…" />
                  ) : (
                    "Save cohort"
                  )}
                </button>
              ) : null}
            </div>
          </section>

          {selected && !creatingNew ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="border border-stone bg-mist/40 px-4 py-5 sm:px-5">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Linked batches
                </p>
                <p className="mt-1 text-sm text-ink/55">
                  Parish year groups on this programme intake.
                </p>
                <ul className="mt-4 space-y-2">
                  {cohortBatches.map((batch) => (
                    <li
                      key={batch.id}
                      className="flex flex-wrap items-center justify-between gap-2 border border-stone/70 bg-white/80 px-3 py-2.5 text-sm"
                    >
                      <span>
                        <span className="font-medium text-ink">
                          {formatBatchLabel(batch)}
                        </span>
                        <span className="text-ink/50">
                          {" "}
                          · {parishName.get(batch.parish_id) ?? "Parish"}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setPendingConfirm({ kind: "unlink", batch })
                        }
                        className="text-xs font-medium text-pine underline disabled:opacity-50"
                      >
                        Unlink
                      </button>
                    </li>
                  ))}
                  {cohortBatches.length === 0 ? (
                    <li className="border border-dashed border-stone px-3 py-6 text-center text-sm text-ink/50">
                      No batches linked yet. Assign unlinked batches from the
                      panel beside.
                    </li>
                  ) : null}
                </ul>
              </section>

              <section
                ref={linkSectionRef}
                className="border border-stone bg-white/70 px-4 py-5 sm:px-5"
              >
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Link a batch
                </p>
                <p className="mt-1 text-sm text-ink/55">
                  Search parish batches not yet on a programme cohort.
                </p>
                <input
                  value={batchFilter}
                  onChange={(e) => setBatchFilter(e.target.value)}
                  placeholder="Search by batch, year, or parish…"
                  disabled={busy}
                  className={`mt-4 ${fieldClass}`}
                />
                <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
                  {unlinkedBatches.slice(0, 30).map((batch) => (
                    <li key={batch.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          runAdmin(() =>
                            assignBatchToCohort(batch.id, selected.id),
                          )
                        }
                        className="flex w-full items-center justify-between gap-3 border border-stone/60 px-3 py-2.5 text-left text-sm transition hover:border-pine/40 hover:bg-pine/5 disabled:opacity-50"
                      >
                        <span>
                          <span className="font-medium text-ink">
                            {formatBatchLabel(batch)}
                          </span>
                          <span className="text-ink/50">
                            {" "}
                            · {parishName.get(batch.parish_id)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-medium text-pine">
                          Link
                        </span>
                      </button>
                    </li>
                  ))}
                  {unlinkedBatches.length === 0 ? (
                    <li className="py-6 text-center text-sm text-ink/50">
                      {batchFilter.trim()
                        ? "No unlinked batches match your search."
                        : "All batches are linked to a programme."}
                    </li>
                  ) : null}
                </ul>
              </section>
            </div>
          ) : creatingNew ? null : (
            <div className="border border-dashed border-stone px-4 py-12 text-center">
              <p className="font-display text-lg text-pine">
                Select a programme cohort
              </p>
              <p className="mt-2 text-sm text-ink/55">
                Pick one from the list, or start a new programme cohort.
              </p>
            </div>
          )}
        </div>
      </div>

      {pendingConfirm ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setPendingConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cohort-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay active={busy} label="Working…" />
            {(() => {
              const copy =
                pendingConfirm.kind === "unlink"
                  ? {
                      eyebrow: "Unlink batch",
                      title: `Unlink ${formatBatchLabel(pendingConfirm.batch)}?`,
                      body: (
                        <>
                          Removes this parish batch from{" "}
                          <span className="font-medium text-ink">
                            {selected ? formatCohortLabel(selected) : "the cohort"}
                          </span>
                          . Students stay enrolled; the batch becomes available
                          to link elsewhere.
                        </>
                      ),
                      confirmLabel: "Unlink batch",
                      destructive: false,
                    }
                  : {
                      eyebrow: "Close cohort",
                      title: "Close this programme for enrolment?",
                      body: (
                        <>
                          <span className="font-medium text-ink">
                            {selected
                              ? formatCohortLabel(selected)
                              : pendingConfirm.payload.name}
                          </span>{" "}
                          will no longer be open for new enrolment. Linked
                          batches and existing students are unchanged.
                        </>
                      ),
                      confirmLabel: "Save & close",
                      destructive: false,
                    };
              return (
                <>
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                    {copy.eyebrow}
                  </p>
                  <h3
                    id="cohort-confirm-title"
                    className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
                  >
                    {copy.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink/70">
                    {copy.body}
                  </p>
                  <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingConfirm(null)}
                      className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={confirmPendingAction}
                      className="inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60"
                    >
                      {busy ? (
                        <DeskLoader label="Working…" tone="mist" />
                      ) : (
                        copy.confirmLabel
                      )}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CohortStatTile({
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
    <div className="border border-stone bg-mist/90 px-3 py-3.5 sm:px-4 sm:py-4">
      <p className="truncate text-[0.58rem] font-medium uppercase tracking-[0.12em] text-ink/40 sm:text-[0.65rem] sm:tracking-[0.16em]">
        <span className="sm:hidden">{shortLabel ?? label}</span>
        <span className="hidden sm:inline">{label}</span>
      </p>
      <p className="mt-1 font-display text-2xl tabular-nums text-pine sm:text-3xl">
        {value}
      </p>
      <p className="mt-1 truncate text-[0.65rem] text-ink/45">{hint}</p>
    </div>
  );
}

function SaturdayChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-pine bg-pine text-mist"
          : "border-stone text-ink/55 hover:border-pine/40"
      }`}
    >
      {label}
      {count != null ? (
        <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
      ) : null}
    </button>
  );
}

function CohortStudentRow({ student }: { student: CohortInsightStudentRow }) {
  const href = `/admin/students/${student.profileId}`;

  return (
    <li>
      <div className="group grid items-center gap-3 px-3 py-3 transition-colors hover:bg-white/70 sm:px-4 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_6rem_7rem_2rem]">
        <Link href={href} className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center bg-stone/70 text-xs font-medium text-pine group-hover:bg-pine group-hover:text-mist">
            {initials(student.displayName)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink group-hover:text-pine">
              {student.displayName}
              {!student.isActive ? (
                <span className="ml-2 text-[0.65rem] font-normal uppercase tracking-[0.08em] text-ink/40">
                  Paused
                </span>
              ) : null}
            </span>
            <span className="mt-0.5 block truncate text-xs text-ink/50">
              {student.email}
            </span>
          </span>
        </Link>

        <Link href={href} className="hidden min-w-0 md:block">
          <p className="truncate text-sm text-ink/75">
            {student.parishName ?? "—"}
          </p>
          <p className="truncate text-xs text-ink/45">
            {student.batchLabel ?? "No batch"}
          </p>
        </Link>

        <Link
          href={href}
          className="hidden text-sm text-ink/60 md:block"
        >
          {student.saturdayLabel ?? "—"}
        </Link>

        <Link href={href} className="hidden md:block">
          <span className="inline-block border border-pine/20 px-2 py-0.5 text-[0.65rem] uppercase tracking-[0.1em] text-pine">
            {student.status}
          </span>
        </Link>

        <Link
          href={href}
          className="hidden justify-self-end text-pine/40 group-hover:text-pine md:flex"
          aria-label={`Open ${student.displayName}`}
        >
          →
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-stone/60 px-3 pb-3 pt-0 md:hidden">
        <span className="text-xs text-ink/50">
          {student.parishName ?? "No parish"}
          {student.batchLabel ? ` · ${student.batchLabel}` : ""}
        </span>
        {student.saturdayLabel ? (
          <span className="text-xs text-ink/50">{student.saturdayLabel}</span>
        ) : null}
      </div>
    </li>
  );
}
