"use client";

import { useMemo, useState, useTransition } from "react";
import {
  assignBatchToCohort,
  createCohort,
  updateCohort,
  type CohortActionResult,
} from "@/app/admin/cohorts/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  formatCohortLabel,
  DEFAULT_PROGRAMME_TYPE,
  type Cohort,
} from "@/lib/cohorts";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

type CohortsManagerProps = {
  cohorts: Cohort[];
  batches: Batch[];
  parishes: Pick<Parish, "id" | "name">[];
};

export function CohortsManager({
  cohorts,
  batches,
  parishes,
}: CohortsManagerProps) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [selectedId, setSelectedId] = useState<string | null>(
    cohorts[0]?.id ?? null,
  );
  const [name, setName] = useState("");
  const [yearStart, setYearStart] = useState(String(new Date().getFullYear()));
  const [yearEnd, setYearEnd] = useState(String(new Date().getFullYear() + 1));
  const [isActive, setIsActive] = useState(true);
  const [batchFilter, setBatchFilter] = useState("");

  const selected = cohorts.find((c) => c.id === selectedId) ?? null;

  const parishName = useMemo(
    () => new Map(parishes.map((p) => [p.id, p.name])),
    [parishes],
  );

  const cohortBatches = useMemo(
    () => batches.filter((b) => b.cohort_id === selectedId),
    [batches, selectedId],
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

  function loadCohort(cohort: Cohort) {
    setSelectedId(cohort.id);
    setName(cohort.name);
    setYearStart(String(cohort.year_start));
    setYearEnd(String(cohort.year_end));
    setIsActive(cohort.is_active);
  }

  function resetCreateForm() {
    setSelectedId(null);
    setName("");
    setYearStart(String(new Date().getFullYear()));
    setYearEnd(String(new Date().getFullYear() + 1));
    setIsActive(true);
  }

  function run(action: () => Promise<CohortActionResult>, label: string) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) success(result.message);
        else error(result.message);
      } finally {
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="relative grid gap-6 lg:grid-cols-[280px_1fr]" aria-busy={busy}>
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
      <aside className="border border-stone/80 bg-white/50 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Cohorts
          </p>
          <button
            type="button"
            onClick={resetCreateForm}
            className="text-xs font-medium text-pine underline"
          >
            New
          </button>
        </div>
        <ul className="mt-3 space-y-1">
          {cohorts.map((cohort) => (
            <li key={cohort.id}>
              <button
                type="button"
                onClick={() => loadCohort(cohort)}
                className={`w-full px-3 py-2 text-left text-sm ${
                  selectedId === cohort.id
                    ? "bg-pine text-mist"
                    : "hover:bg-stone/40 text-ink/80"
                }`}
              >
                {formatCohortLabel(cohort)}
                {!cohort.is_active ? (
                  <span className="ml-1 text-xs opacity-70">· retired</span>
                ) : null}
              </button>
            </li>
          ))}
          {cohorts.length === 0 ? (
            <li className="px-3 py-4 text-sm text-ink/50">
              No cohorts yet. Create your first programme cohort.
            </li>
          ) : null}
        </ul>
      </aside>

      <div className="space-y-6">
        <section className="border border-stone/80 bg-white/50 p-5">
          <h2 className="font-display text-xl text-pine">
            {selected ? "Edit cohort" : "Create cohort"}
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="SP 2022/23"
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <label className="block text-sm">
              Start year
              <input
                type="number"
                value={yearStart}
                onChange={(e) => setYearStart(e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            <label className="block text-sm">
              End year
              <input
                type="number"
                value={yearEnd}
                onChange={(e) => setYearEnd(e.target.value)}
                className={`mt-1 ${fieldClass}`}
              />
            </label>
            {selected ? (
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                Active cohort
              </label>
            ) : null}
          </div>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() =>
              run(
                () =>
                  selected
                    ? updateCohort(selected.id, {
                        name,
                        yearStart: Number(yearStart),
                        yearEnd: Number(yearEnd),
                        programmeType: DEFAULT_PROGRAMME_TYPE,
                        isActive,
                      })
                    : createCohort({
                        name,
                        yearStart: Number(yearStart),
                        yearEnd: Number(yearEnd),
                        programmeType: DEFAULT_PROGRAMME_TYPE,
                      }),
                selected ? "Saving cohort…" : "Creating cohort…",
              )
            }
            className="mt-4 inline-flex min-h-[2.5rem] min-w-[8.5rem] items-center justify-center border border-pine px-4 py-2.5 text-sm font-medium text-pine hover:bg-pine hover:text-mist disabled:opacity-50"
          >
            {busy &&
            (busyLabel?.startsWith("Saving cohort") ||
              busyLabel?.startsWith("Creating cohort")) ? (
              <DeskLoader label={busyLabel} />
            ) : selected ? (
              "Save cohort"
            ) : (
              "Create cohort"
            )}
          </button>
        </section>

        {selected ? (
          <>
            <section className="border border-stone/80 bg-white/50 p-5">
              <h2 className="font-display text-xl text-pine">Linked batches</h2>
              <p className="mt-1 text-sm text-ink/60">
                Batches in this cohort appear on enrolment and desk filters.
              </p>
              <ul className="mt-4 space-y-2">
                {cohortBatches.map((batch) => (
                  <li
                    key={batch.id}
                    className="flex flex-wrap items-center justify-between gap-2 border border-stone/60 px-3 py-2 text-sm"
                  >
                    <span>
                      {formatBatchLabel(batch)} ·{" "}
                      {parishName.get(batch.parish_id) ?? "Parish"}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => assignBatchToCohort(batch.id, null),
                          "Unlinking batch…",
                        )
                      }
                      className="text-xs font-medium text-pine underline disabled:opacity-50"
                    >
                      Unlink
                    </button>
                  </li>
                ))}
                {cohortBatches.length === 0 ? (
                  <li className="text-sm text-ink/50">
                    No batches linked yet.
                  </li>
                ) : null}
              </ul>
            </section>

            <section className="border border-stone/80 bg-white/50 p-5">
              <h2 className="font-display text-xl text-pine">Link a batch</h2>
              <input
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                placeholder="Search batches…"
                className={`mt-3 ${fieldClass}`}
              />
              <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                {unlinkedBatches.slice(0, 20).map((batch) => (
                  <li key={batch.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () => assignBatchToCohort(batch.id, selected.id),
                          "Linking batch…",
                        )
                      }
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-stone/40 disabled:opacity-50"
                    >
                      <span>
                        {formatBatchLabel(batch)} ·{" "}
                        {parishName.get(batch.parish_id)}
                      </span>
                      <span className="text-xs text-pine">Link</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
