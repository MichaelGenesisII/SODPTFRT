"use client";

import { useMemo, useState } from "react";
import { formatCohortLabel, type Cohort } from "@/lib/cohorts";
import { SATURDAY_SLOT_LABELS } from "@/lib/cohorts/saturday";
import type { CampaignPaymentLane } from "@/lib/email/campaigns";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";

export type { CampaignPaymentLane };

export type CampaignDeskFilterState = {
  parish: string;
  cohort: string;
  batch: string;
  saturday: string;
  payment: CampaignPaymentLane;
};

export function defaultCampaignDeskFilters(
  parishId: string | null,
  national: boolean,
): CampaignDeskFilterState {
  return {
    parish: national ? "" : parishId ?? "",
    cohort: "",
    batch: "",
    saturday: "",
    payment: "all",
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
  apply: (current: CampaignDeskFilterState) => CampaignDeskFilterState;
};

const QUICK_PRESETS: Preset[] = [
  {
    id: "tuition-outstanding",
    label: "Tuition unpaid",
    apply: (current) => ({ ...current, payment: "unpaid" }),
  },
  {
    id: "proof-review",
    label: "Proof in review",
    apply: (current) => ({ ...current, payment: "pending_review" }),
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
  key: keyof CampaignDeskFilterState;
  label: string;
  reset: Partial<CampaignDeskFilterState>;
};

function countActiveFilters(
  filters: CampaignDeskFilterState,
  national: boolean,
): number {
  let count = 0;
  if (national && filters.parish) count += 1;
  if (filters.cohort) count += 1;
  if (filters.batch) count += 1;
  if (filters.saturday) count += 1;
  if (filters.payment !== "all") count += 1;
  return count;
}

function buildActiveChips(
  filters: CampaignDeskFilterState,
  parishes: Pick<Parish, "id" | "name">[],
  cohorts: Pick<Cohort, "id" | "name" | "year_start" | "year_end">[],
  batches: Pick<Batch, "id" | "name" | "year" | "parish_id" | "cohort_id">[],
  national: boolean,
): ActiveChip[] {
  const chips: ActiveChip[] = [];

  if (national && filters.parish) {
    const parish = parishes.find((p) => p.id === filters.parish);
    chips.push({
      key: "parish",
      label: parish ? `Parish · ${parish.name}` : "Parish",
      reset: { parish: "", batch: "" },
    });
  }
  if (filters.cohort) {
    const cohort = cohorts.find((c) => c.id === filters.cohort);
    chips.push({
      key: "cohort",
      label: cohort ? `Cohort · ${formatCohortLabel(cohort)}` : "Cohort",
      reset: { cohort: "", batch: "" },
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
  if (filters.payment !== "all") {
    const paymentLabel =
      filters.payment === "unpaid"
        ? "Tuition unpaid"
        : filters.payment === "pending_review"
          ? "Proof in review"
          : "Tuition paid";
    chips.push({
      key: "payment",
      label: paymentLabel,
      reset: { payment: "all" },
    });
  }

  return chips;
}

export function CampaignDeskFilters({
  query,
  onQueryChange,
  filters,
  onFiltersChange,
  parishes,
  cohorts,
  batches,
  national,
  resultCount,
  totalCount,
  disabled = false,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filters: CampaignDeskFilterState;
  onFiltersChange: (next: CampaignDeskFilterState) => void;
  parishes: Pick<Parish, "id" | "name">[];
  cohorts: Pick<Cohort, "id" | "name" | "year_start" | "year_end">[];
  batches: Pick<
    Batch,
    "id" | "parish_id" | "cohort_id" | "name" | "year"
  >[];
  national: boolean;
  resultCount: number;
  totalCount: number;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  const filterBatches = useMemo(
    () =>
      batches.filter((b) => {
        if (filters.parish && b.parish_id !== filters.parish) return false;
        if (filters.cohort && b.cohort_id !== filters.cohort) return false;
        return true;
      }),
    [batches, filters.parish, filters.cohort],
  );

  const activeCount = countActiveFilters(filters, national);
  const chips = buildActiveChips(
    filters,
    parishes,
    cohorts,
    batches,
    national,
  );

  function patch(next: Partial<CampaignDeskFilterState>) {
    onFiltersChange({ ...filters, ...next });
  }

  function clearAll() {
    onFiltersChange(
      defaultCampaignDeskFilters(national ? "" : filters.parish, national),
    );
  }

  function clearChip(reset: Partial<CampaignDeskFilterState>) {
    onFiltersChange({ ...filters, ...reset });
  }

  return (
    <section className="border border-stone bg-mist/35">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-stone px-3 py-2.5 sm:px-4">
        <div>
          <p className="text-[0.6rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Refine audience
          </p>
          <p className="mt-0.5 text-xs text-ink/55">
            {resultCount === totalCount
              ? `All ${totalCount} recipients — combine filters below`
              : `${resultCount} of ${totalCount} recipients match`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeCount > 0 ? (
            <button
              type="button"
              onClick={clearAll}
              disabled={disabled}
              className="text-xs font-medium text-pine underline-offset-2 hover:underline disabled:opacity-50"
            >
              Clear filters ({activeCount})
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            disabled={disabled}
            className="border border-stone bg-white/70 px-2.5 py-1 text-xs text-ink/70 disabled:opacity-50"
            aria-expanded={expanded}
          >
            {expanded
              ? "Hide filters"
              : `Show filters${activeCount ? ` (${activeCount})` : ""}`}
          </button>
        </div>
      </header>

      <div className="border-b border-stone px-3 py-2.5 sm:px-4">
        <label className="block">
          <span className="sr-only">Search recipients</span>
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search name, email, parish, cohort…"
            disabled={disabled}
            className="w-full border border-stone bg-white/80 px-3 py-2 text-sm outline-none placeholder:text-ink/35 focus:border-pine focus:bg-mist disabled:opacity-50"
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
              onClick={() => clearChip(chip.reset)}
              disabled={disabled}
              className="inline-flex items-center gap-1 border border-pine/25 bg-pine/5 px-2 py-0.5 text-xs text-pine hover:bg-pine/10 disabled:opacity-50"
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
            disabled={disabled}
            className="border border-stone bg-white/60 px-2 py-1 text-xs text-ink/70 hover:border-pine/30 hover:text-pine disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {expanded ? (
        <div className="grid gap-4 px-3 py-3 sm:grid-cols-2 sm:px-4 sm:py-4 lg:grid-cols-3">
          <fieldset className="min-w-0 space-y-2" disabled={disabled}>
            <legend className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
              Placement
            </legend>
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
              Programme cohort
              <select
                value={filters.cohort}
                onChange={(event) =>
                  patch({ cohort: event.target.value, batch: "" })
                }
                className={`mt-1 ${fieldClass}`}
              >
                <option value="">All cohorts</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {formatCohortLabel(c)}
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

          <fieldset className="min-w-0 space-y-2 lg:col-span-2" disabled={disabled}>
            <legend className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
              Tuition payment
            </legend>
            <div
              className="flex overflow-hidden border border-stone"
              role="group"
              aria-label="Tuition payment"
            >
              {(
                [
                  ["all", "All"],
                  ["unpaid", "Unpaid"],
                  ["pending_review", "In review"],
                  ["paid", "Paid"],
                ] as const
              ).map(([id, text]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => patch({ payment: id })}
                  className={segmentClass(filters.payment === id)}
                >
                  {text}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      ) : null}
    </section>
  );
}
