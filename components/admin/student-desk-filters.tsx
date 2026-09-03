"use client";

import { useMemo, useState } from "react";
import {
  ENROLMENT_STATUS_META,
  ENROLMENT_STATUSES,
  isEnrolmentStatus,
} from "@/lib/admin/students";
import { SATURDAY_SLOT_LABELS } from "@/lib/cohorts/saturday";
import type { EnrolmentStatus } from "@/lib/student/types";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";

export type ManualsLane = "all" | "not_sent" | "sent";
export type ProgrammeFeeFilter = "all" | "paid_full" | "paid_part" | "not_paid";
export type IntakeFilter = "" | "november" | "january" | "february";
export type EnrolmentStatusFilter = "" | EnrolmentStatus;

export type StudentDeskFilterState = {
  intake: IntakeFilter;
  parish: string;
  batch: string;
  /** Calendar year on the parish batch (e.g. 2025), not programme Year 1–10. */
  batchYear: string;
  saturday: string;
  manuals: ManualsLane;
  programmeFee: ProgrammeFeeFilter;
  /** Application / enrolment status (Submitted, Accepted, …). */
  enrolmentStatus: EnrolmentStatusFilter;
};

export function defaultStudentDeskFilters(
  parishId: string | null,
  national: boolean,
): StudentDeskFilterState {
  return {
    intake: "",
    parish: national ? "" : parishId ?? "",
    batch: "",
    batchYear: "",
    saturday: "",
    manuals: "all",
    programmeFee: "all",
    enrolmentStatus: "",
  };
}

export type StudentDeskLane = "all" | "review" | "secured" | "paused";

/** Serialize list desk state for return navigation (?from= on detail page). */
export function studentDeskListQuery(input: {
  lane: StudentDeskLane;
  query: string;
  filters: StudentDeskFilterState;
  page?: number;
}): string {
  const params = new URLSearchParams();
  if (input.lane !== "all") params.set("lane", input.lane);
  const q = input.query.trim();
  if (q) params.set("q", q);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  if (input.filters.intake) params.set("intake", input.filters.intake);
  if (input.filters.parish) params.set("parish", input.filters.parish);
  if (input.filters.batch) params.set("batch", input.filters.batch);
  if (input.filters.batchYear) params.set("byear", input.filters.batchYear);
  if (input.filters.saturday) params.set("sat", input.filters.saturday);
  if (input.filters.manuals !== "all") params.set("manuals", input.filters.manuals);
  if (input.filters.programmeFee !== "all") {
    params.set("pfee", input.filters.programmeFee);
  }
  if (input.filters.enrolmentStatus) {
    params.set("estatus", input.filters.enrolmentStatus);
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Compare list URLs regardless of query-string parameter order. */
export function studentDeskListQueriesEqual(
  a: string,
  b: string,
  parishId: string | null,
  national: boolean,
): boolean {
  const left = parseStudentDeskListQuery(a, parishId, national);
  const right = parseStudentDeskListQuery(b, parishId, national);
  return (
    left.lane === right.lane &&
    left.query === right.query &&
    left.page === right.page &&
    left.filters.intake === right.filters.intake &&
    left.filters.parish === right.filters.parish &&
    left.filters.batch === right.filters.batch &&
    left.filters.batchYear === right.filters.batchYear &&
    left.filters.saturday === right.filters.saturday &&
    left.filters.manuals === right.filters.manuals &&
    left.filters.programmeFee === right.filters.programmeFee &&
    left.filters.enrolmentStatus === right.filters.enrolmentStatus
  );
}

export function parseStudentDeskListQuery(
  search: string,
  parishId: string | null,
  national: boolean,
): {
  lane: StudentDeskLane;
  query: string;
  page: number;
  filters: StudentDeskFilterState;
} {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const laneRaw = params.get("lane");
  const lane: StudentDeskLane =
    laneRaw === "review" ||
    laneRaw === "secured" ||
    laneRaw === "paused" ||
    laneRaw === "all"
      ? laneRaw
      : "all";
  const manualsRaw = params.get("manuals");
  const pfeeRaw = params.get("pfee");
  const estatusRaw = params.get("estatus");
  const pageRaw = params.get("page");
  const page = pageRaw ? Math.max(1, Number(pageRaw) || 1) : 1;
  const intakeRaw = params.get("intake");
  const intake: IntakeFilter =
    intakeRaw === "november" ||
    intakeRaw === "january" ||
    intakeRaw === "february"
      ? intakeRaw
      : "";
  return {
    lane,
    query: params.get("q") ?? "",
    page,
    filters: {
      ...defaultStudentDeskFilters(parishId, national),
      intake,
      parish: national ? params.get("parish") ?? "" : parishId ?? "",
      batch: params.get("batch") ?? "",
      batchYear: params.get("byear") ?? "",
      saturday: params.get("sat") ?? "",
      manuals:
        manualsRaw === "sent" || manualsRaw === "not_sent" ? manualsRaw : "all",
      programmeFee:
        pfeeRaw === "paid_full" ||
        pfeeRaw === "paid_part" ||
        pfeeRaw === "not_paid"
          ? pfeeRaw
          : "all",
      enrolmentStatus:
        estatusRaw && isEnrolmentStatus(estatusRaw) ? estatusRaw : "",
    },
  };
}

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/80 px-2.5 py-1.5 text-sm outline-none focus:border-pine";

const segmentClass = (active: boolean) =>
  `min-w-0 flex-1 px-2 py-1.5 text-xs font-medium transition-colors ${
    active
      ? "bg-pine text-mist"
      : "bg-white/60 text-ink/55 hover:bg-white hover:text-ink/80"
  }`;

type Preset = {
  id: string;
  label: string;
  apply: (current: StudentDeskFilterState) => StudentDeskFilterState;
};

const QUICK_PRESETS: Preset[] = [
  {
    id: "fee-paid-full",
    label: "Paid in full",
    apply: (current) => ({ ...current, programmeFee: "paid_full" }),
  },
  {
    id: "fee-part",
    label: "Part paid",
    apply: (current) => ({ ...current, programmeFee: "paid_part" }),
  },
  {
    id: "fee-not-paid",
    label: "Not paid yet",
    apply: (current) => ({ ...current, programmeFee: "not_paid" }),
  },
  {
    id: "manuals-pending",
    label: "Manuals not sent",
    apply: (current) => ({ ...current, manuals: "not_sent" }),
  },
  ...([1, 2, 3, 4] as const).map(
    (slot): Preset => ({
      id: `sat-${slot}`,
      label: SATURDAY_SLOT_LABELS[slot],
      apply: (current) => ({ ...current, saturday: String(slot) }),
    }),
  ),
];

type ActiveChip = {
  key: string;
  label: string;
  reset: Partial<StudentDeskFilterState>;
  clearLane?: true;
};

function countActiveFilters(
  filters: StudentDeskFilterState,
  national: boolean,
): number {
  let count = 0;
  if (filters.intake) count += 1;
  if (national && filters.parish) count += 1;
  if (filters.batch) count += 1;
  if (filters.batchYear) count += 1;
  if (filters.saturday) count += 1;
  if (filters.manuals !== "all") count += 1;
  if (filters.programmeFee !== "all") count += 1;
  if (filters.enrolmentStatus) count += 1;
  return count;
}

function buildActiveChips(
  filters: StudentDeskFilterState,
  parishes: Pick<Parish, "id" | "name">[],
  batches: Pick<Batch, "id" | "name" | "year" | "parish_id">[],
  national: boolean,
  lane: StudentDeskLane,
): ActiveChip[] {
  const chips: ActiveChip[] = [];

  if (lane !== "all") {
    chips.push({
      key: "lane",
      label:
        lane === "review"
          ? "In review"
          : lane === "secured"
            ? "On path"
            : "Paused",
      reset: {},
      clearLane: true,
    });
  }
  if (filters.intake) {
    chips.push({
      key: "intake",
      label:
        filters.intake === "november"
          ? "Cohort 1 · November"
          : filters.intake === "january"
            ? "Cohort 2 · January"
            : "Cohort 3 · February",
      reset: { intake: "" },
    });
  }
  if (national && filters.parish) {
    const parish = parishes.find((p) => p.id === filters.parish);
    chips.push({
      key: "parish",
      label: parish ? `Parish · ${parish.name}` : "Parish",
      reset: { parish: "", batch: "" },
    });
  }
  if (filters.batchYear) {
    chips.push({
      key: "batchYear",
      label: `Batch year · ${filters.batchYear}`,
      reset: { batchYear: "" },
    });
  }
  if (filters.batch) {
    const batch = batches.find((b) => b.id === filters.batch);
    chips.push({
      key: "batch",
      label: batch ? `Batch · ${formatBatchLabel(batch)}` : "Batch",
      reset: { batch: "" },
    });
  }
  if (filters.saturday) {
    const slot = Number(filters.saturday) as 1 | 2 | 3 | 4;
    chips.push({
      key: "saturday",
      label: SATURDAY_SLOT_LABELS[slot] ?? "Saturday",
      reset: { saturday: "" },
    });
  }
  if (filters.manuals !== "all") {
    chips.push({
      key: "manuals",
      label: filters.manuals === "sent" ? "Manuals sent" : "Manuals not sent",
      reset: { manuals: "all" },
    });
  }
  if (filters.programmeFee !== "all") {
    chips.push({
      key: "programmeFee",
      label:
        filters.programmeFee === "paid_full"
          ? "Paid in full"
          : filters.programmeFee === "paid_part"
            ? "Part paid"
            : "Not paid yet",
      reset: { programmeFee: "all" },
    });
  }
  if (filters.enrolmentStatus) {
    chips.push({
      key: "enrolmentStatus",
      label: `Status · ${ENROLMENT_STATUS_META[filters.enrolmentStatus].label}`,
      reset: { enrolmentStatus: "" },
    });
  }

  return chips;
}

const PROGRAMME_FEE_FILTER_LABELS: Record<
  Exclude<ProgrammeFeeFilter, "all">,
  string
> = {
  paid_full: "Paid in full",
  paid_part: "Part paid",
  not_paid: "Not paid",
};

export function StudentDeskFilters({
  query,
  onQueryChange,
  lane,
  onLaneChange,
  filters,
  onFiltersChange,
  parishes,
  batches,
  national,
  resultCount,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  lane: StudentDeskLane;
  onLaneChange: (lane: StudentDeskLane) => void;
  filters: StudentDeskFilterState;
  onFiltersChange: (next: StudentDeskFilterState) => void;
  parishes: Pick<Parish, "id" | "name">[];
  batches: Pick<
    Batch,
    "id" | "parish_id" | "name" | "year" | "enrolment_open" | "is_active"
  >[];
  national: boolean;
  resultCount: number;
  totalCount: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const filterBatches = useMemo(
    () =>
      batches.filter((b) => {
        if (filters.parish && b.parish_id !== filters.parish) return false;
        if (filters.batchYear && String(b.year) !== filters.batchYear) {
          return false;
        }
        return true;
      }),
    [batches, filters.parish, filters.batchYear],
  );

  const batchYears = useMemo(() => {
    const years = new Set<number>();
    for (const b of batches) {
      if (filters.parish && b.parish_id !== filters.parish) continue;
      years.add(b.year);
    }
    return [...years].sort((a, b) => b - a);
  }, [batches, filters.parish]);

  const activeCount =
    countActiveFilters(filters, national) + (lane !== "all" ? 1 : 0);
  const chips = buildActiveChips(filters, parishes, batches, national, lane);

  function patch(next: Partial<StudentDeskFilterState>) {
    onFiltersChange({ ...filters, ...next });
  }

  function clearAll() {
    onLaneChange("all");
    onFiltersChange(
      defaultStudentDeskFilters(national ? "" : filters.parish, national),
    );
  }

  return (
    <section
      data-tour="students-filters"
      className="border border-stone bg-mist/35"
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-stone px-3 py-2.5 sm:px-4">
        <div>
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Refine list
          </p>
          <p className="mt-0.5 text-xs text-ink/55">
            {resultCount === totalCount
              ? `All ${totalCount} students — combine filters below`
              : `${resultCount} of ${totalCount} students match`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs font-medium text-pine underline-offset-2 hover:underline"
            >
              Clear filters ({activeCount})
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            className="border border-stone bg-white/70 px-2.5 py-1 text-xs text-ink/70"
            aria-expanded={expanded}
          >
            {expanded
              ? "Hide advanced filters"
              : `Show advanced filters${activeCount ? ` (${activeCount})` : ""}`}
          </button>
        </div>
      </header>

      <div className="border-b border-stone px-3 py-2.5 sm:px-4">
        <label className="block">
          <span className="sr-only">Search students</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search name, email, parish, ref…"
            className="w-full border border-stone bg-white/80 px-3 py-2 text-sm outline-none placeholder:text-ink/35 focus:border-pine focus:bg-mist"
          />
        </label>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-stone px-3 py-2 sm:px-4">
          <span className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
            Active
          </span>
          {chips.map((chip) => (
            <button
              key={`${chip.key}-${chip.label}`}
              type="button"
              onClick={() => {
                if (chip.clearLane) {
                  onLaneChange("all");
                  return;
                }
                onFiltersChange({ ...filters, ...chip.reset });
              }}
              className="inline-flex items-center gap-1 border border-pine/25 bg-pine/5 px-2 py-0.5 text-xs text-pine hover:bg-pine/10"
              title="Remove filter"
            >
              {chip.label}
              <span aria-hidden className="text-pine/60">
                ×
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5 border-b border-stone px-3 py-2 sm:px-4">
        <span className="w-full text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40 sm:w-auto sm:py-1">
          Quick
        </span>
        {QUICK_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onFiltersChange(preset.apply(filters))}
            className="border border-stone bg-white/60 px-2 py-1 text-xs text-ink/70 hover:border-pine/30 hover:text-pine"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {expanded ? (
        <div className="grid gap-4 px-3 py-3 sm:grid-cols-3 sm:px-4 sm:py-4">
          <fieldset className="min-w-0 space-y-2">
            <legend className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
              Placement
            </legend>
            <label className="block text-xs text-ink/50">
              Programme intake
              <select
                value={filters.intake}
                onChange={(event) =>
                  patch({ intake: event.target.value as IntakeFilter })
                }
                className={`mt-1 ${fieldClass}`}
              >
                <option value="">All intakes</option>
                <option value="november">Cohort 1 · November</option>
                <option value="january">Cohort 2 · January</option>
                <option value="february">Cohort 3 · February</option>
              </select>
            </label>
            {national ? (
              <label className="block text-xs text-ink/50">
                Parish
                <select
                  value={filters.parish}
                  onChange={(event) =>
                    patch({ parish: event.target.value, batch: "" })
                  }
                  className={`mt-1 ${fieldClass}`}
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
            <label className="block text-xs text-ink/50">
              Batch year
              <select
                value={filters.batchYear}
                onChange={(event) =>
                  patch({ batchYear: event.target.value, batch: "" })
                }
                className={`mt-1 ${fieldClass}`}
              >
                <option value="">All years</option>
                {batchYears.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-ink/50">
              Batch
              <select
                value={filters.batch}
                onChange={(event) => patch({ batch: event.target.value })}
                className={`mt-1 ${fieldClass}`}
              >
                <option value="">All batches</option>
                {filterBatches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {formatBatchLabel(b)}
                    {national && !filters.parish
                      ? ` · ${parishes.find((p) => p.id === b.parish_id)?.name ?? ""}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-ink/50">
              Saturday cohort
              <select
                value={filters.saturday}
                onChange={(event) => patch({ saturday: event.target.value })}
                className={`mt-1 ${fieldClass}`}
              >
                <option value="">All Saturdays</option>
                {([1, 2, 3, 4] as const).map((slot) => (
                  <option key={slot} value={String(slot)}>
                    {SATURDAY_SLOT_LABELS[slot]}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>

          <fieldset className="min-w-0 space-y-2">
            <legend className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
              Desk
            </legend>
            <label className="block text-xs text-ink/50">
              Enrolment status
              <select
                value={filters.enrolmentStatus}
                onChange={(event) =>
                  patch({
                    enrolmentStatus: event.target
                      .value as EnrolmentStatusFilter,
                  })
                }
                className={`mt-1 ${fieldClass}`}
              >
                <option value="">All statuses</option>
                {ENROLMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ENROLMENT_STATUS_META[status].label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-ink/50">
              Roster status
              <select
                value={lane}
                onChange={(event) =>
                  onLaneChange(event.target.value as StudentDeskLane)
                }
                className={`mt-1 ${fieldClass}`}
              >
                <option value="all">All</option>
                <option value="review">In review</option>
                <option value="secured">On path</option>
                <option value="paused">Paused</option>
              </select>
            </label>
            <label className="block text-xs text-ink/50">
              Manuals
              <select
                value={filters.manuals}
                onChange={(event) =>
                  patch({ manuals: event.target.value as ManualsLane })
                }
                className={`mt-1 ${fieldClass}`}
              >
                <option value="all">All</option>
                <option value="not_sent">Not sent</option>
                <option value="sent">Sent</option>
              </select>
            </label>
          </fieldset>

          <fieldset className="min-w-0 space-y-3">
            <legend className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
              Fees
            </legend>
            <div>
              <p className="mb-1 text-[0.65rem] font-medium text-ink/50">
                Programme fee (£350)
              </p>
              <div
                className="flex overflow-hidden border border-stone"
                role="group"
                aria-label="Programme fee payment"
              >
                {(
                  [
                    ["all", "All"],
                    ["paid_full", PROGRAMME_FEE_FILTER_LABELS.paid_full],
                    ["paid_part", PROGRAMME_FEE_FILTER_LABELS.paid_part],
                    ["not_paid", PROGRAMME_FEE_FILTER_LABELS.not_paid],
                  ] as const
                ).map(([id, text]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      patch({ programmeFee: id as ProgrammeFeeFilter })
                    }
                    className={segmentClass(filters.programmeFee === id)}
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>
        </div>
      ) : null}
    </section>
  );
}
