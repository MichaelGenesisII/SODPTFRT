"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  createManualLedgerEntry,
  exportLedgerCsv,
  loadEntryAttachmentViews,
  reverseLedgerEntry,
} from "@/app/finance/ledger/actions";
import {
  lockFinancePeriod,
  unlockFinancePeriod,
} from "@/app/finance/books/period-actions";
import {
  FinanceAttachmentPicker,
  type PendingFinanceAttachment,
} from "@/components/finance/finance-attachment-picker";
import { FinanceBooksDateTools } from "@/components/finance/finance-books-date-tools";
import { FinanceCategoriesManager } from "@/components/finance/finance-categories-manager";
import { FinanceDeskFlow } from "@/components/finance/finance-desk-flow";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { DeskPortal } from "@/components/ui/desk-portal";
import { formatAttachmentSize } from "@/lib/finance/attachments";
import {
  dateSelectionIsActive,
  dateSelectionToSearchParams,
  emptyDateSelection,
  entryMatchesDateSelection,
  type DateSelection,
} from "@/lib/finance/date-selection";
import { deskConfirm, deskError, deskSuccess } from "@/lib/ui/desk-alert";
import type {
  FinanceCategory,
  FinanceLedgerEntry,
  FinanceLedgerListResult,
} from "@/lib/finance/ledger";
import {
  periodLabelFromKey,
  type FinancePeriodLock,
} from "@/lib/finance/periods-lock";
import { formatGbp, monthPeriodKey } from "@/lib/finance/types";
import { DeskPagination } from "@/lib/ui/desk-pagination";

export type FinanceBooksPanel = "browse" | "categories";

const PAGE_SIZE = 10;
const fieldClass =
  "mt-1.5 w-full border border-stone bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-pine";

function formatDay(isoDate: string) {
  return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Filters = {
  direction: "all" | "in" | "out";
  categoryId: string;
  proof: "all" | "with" | "without";
};

const emptyFilters: Filters = {
  direction: "all",
  categoryId: "",
  proof: "all",
};

export function FinanceBooksDesk({
  panel,
  ledger,
  categories,
  activeCategories,
  initialDateSelection,
  periodLocks,
}: {
  panel: FinanceBooksPanel;
  ledger: FinanceLedgerListResult;
  categories: FinanceCategory[];
  activeCategories: FinanceCategory[];
  initialDateSelection: DateSelection;
  periodLocks: FinancePeriodLock[];
}) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState("Working…");

  const [entries] = useState(ledger.entries);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(
    () => dateSelectionIsActive(initialDateSelection),
  );
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [dateSelection, setDateSelection] = useState<DateSelection>(
    initialDateSelection,
  );
  const [page, setPage] = useState(1);
  const [lockPeriodKey, setLockPeriodKey] = useState(() => {
    const now = new Date();
    return monthPeriodKey(now.getUTCFullYear(), now.getUTCMonth() + 1);
  });

  const [direction, setDirection] = useState<"out" | "in">("out");
  const [categoryId, setCategoryId] = useState(activeCategories[0]?.id ?? "");
  const [payee, setPayee] = useState("");
  const [amountGbp, setAmountGbp] = useState("");
  const [incurredOn, setIncurredOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [reason, setReason] = useState("");
  const [attachments, setAttachments] = useState<PendingFinanceAttachment[]>(
    [],
  );
  const [composeOpen, setComposeOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<FinanceLedgerEntry | null>(
    null,
  );
  const [reverseReason, setReverseReason] = useState("");
  const [proofEntry, setProofEntry] = useState<FinanceLedgerEntry | null>(null);
  const [proofFiles, setProofFiles] = useState<
    {
      id: string;
      name: string;
      mime: string;
      byteSize: number;
      url: string | null;
    }[]
  >([]);

  function go(next: FinanceBooksPanel) {
    const params = dateSelectionToSearchParams(dateSelection);
    if (next !== "browse") params.set("panel", next);
    else params.delete("panel");
    const qs = params.toString();
    startNav(() => {
      router.push(qs ? `/finance/books?${qs}` : "/finance/books");
    });
  }

  function applyDateSelection(next: DateSelection) {
    setDateSelection(next);
    setPage(1);
    const params = dateSelectionToSearchParams(next);
    if (panel !== "browse") params.set("panel", panel);
    const qs = params.toString();
    startNav(() => {
      router.replace(qs ? `/finance/books?${qs}` : "/finance/books");
    });
  }

  const lockedPeriodKeys = useMemo(
    () =>
      new Set(
        periodLocks.filter((row) => row.locked).map((row) => row.period_key),
      ),
    [periodLocks],
  );

  const monthSpend = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of entries) {
      if (entry.status === "reversed") continue;
      if (entry.direction !== "out") continue;
      const day = entry.incurred_on.slice(0, 10);
      map.set(day, (map.get(day) ?? 0) + entry.amount_gbp);
    }
    return map;
  }, [entries]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.direction !== "all") count += 1;
    if (filters.categoryId) count += 1;
    if (filters.proof !== "all") count += 1;
    if (dateSelectionIsActive(dateSelection)) count += 1;
    return count;
  }, [filters, dateSelection]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (filters.direction !== "all" && entry.direction !== filters.direction) {
        return false;
      }
      if (filters.categoryId && entry.category_id !== filters.categoryId) {
        return false;
      }
      if (filters.proof === "with" && !entry.has_proof) return false;
      if (filters.proof === "without" && entry.has_proof) return false;
      if (!entryMatchesDateSelection(entry.incurred_on, dateSelection)) {
        return false;
      }
      if (!q) return true;
      return (
        entry.payee.toLowerCase().includes(q) ||
        (entry.reason ?? "").toLowerCase().includes(q) ||
        (entry.category_name ?? "").toLowerCase().includes(q) ||
        formatGbp(entry.amount_gbp).toLowerCase().includes(q)
      );
    });
  }, [entries, filters, query, dateSelection]);

  function downloadCsv() {
    setBusyLabel("Preparing export…");
    startTransition(async () => {
      try {
        const result = await exportLedgerCsv(filtered.map((entry) => entry.id));
        if (!result.ok || !result.csv) {
          await deskError({
            title: "Export failed",
            text: result.message || "The file could not be prepared.",
          });
          return;
        }
        const blob = new Blob([result.csv], {
          type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename || "finance-ledger.csv";
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        setBusyLabel("Working…");
      }
    });
  }

  const lockRow = periodLocks.find((row) => row.period_key === lockPeriodKey);
  const lockIsLocked = Boolean(lockRow?.locked);

  const filteredSummary = useMemo(() => {
    let totalOutGbp = 0;
    let totalInGbp = 0;
    let withoutProofCount = 0;
    for (const entry of filtered) {
      if (entry.status === "reversed") continue;
      if (entry.direction === "out") totalOutGbp += entry.amount_gbp;
      else totalInGbp += entry.amount_gbp;
      if (!entry.has_proof) withoutProofCount += 1;
    }
    return { totalOutGbp, totalInGbp, withoutProofCount };
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const selectedCategory = activeCategories.find((c) => c.id === categoryId);
  const createAmount = Number(amountGbp);

  function resetCompose() {
    setDirection("out");
    setCategoryId(activeCategories[0]?.id ?? "");
    setPayee("");
    setAmountGbp("");
    setIncurredOn(new Date().toISOString().slice(0, 10));
    setReason("");
    setAttachments([]);
  }

  function openCompose() {
    resetCompose();
    setComposeOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("finance-books-add-entry")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  function closeCompose() {
    if (pending) return;
    setComposeOpen(false);
  }

  async function openCreateConfirm(event: FormEvent) {
    event.preventDefault();
    if (!categoryId) {
      await deskError({ text: "Choose a category." });
      return;
    }
    if (!payee.trim()) {
      await deskError({ text: "Enter who was paid, or who paid." });
      return;
    }
    if (!Number.isFinite(createAmount) || createAmount <= 0) {
      await deskError({ text: "Enter an amount greater than zero." });
      return;
    }

    const proofNote = attachments.length
      ? `${attachments.length} proof file${attachments.length === 1 ? "" : "s"} attached.`
      : "No proof attached — this will be flagged.";

    const ok = await deskConfirm({
      title: "Save this entry?",
      html: [
        `<p><strong>${direction === "out" ? "Money out" : "Money in"}</strong> · ${selectedCategory?.name ?? "Category"}</p>`,
        `<p><strong>${payee.trim()}</strong> · ${formatGbp(createAmount)}</p>`,
        `<p>${formatDay(incurredOn)}</p>`,
        reason.trim() ? `<p>${reason.trim()}</p>` : "",
        `<p style="opacity:0.7">${proofNote}</p>`,
      ]
        .filter(Boolean)
        .join(""),
      confirmLabel: "Save entry",
      cancelLabel: "Go back",
    });
    if (!ok) return;
    submitCreate();
  }

  function submitCreate() {
    setBusyLabel("Saving entry…");
    const form = new FormData();
    form.set("direction", direction);
    form.set("categoryId", categoryId);
    form.set("payee", payee.trim());
    form.set("amountGbp", amountGbp);
    form.set("incurredOn", incurredOn);
    form.set("reason", reason.trim());
    form.set(
      "attachmentIds",
      JSON.stringify(attachments.map((item) => item.id)),
    );
    startTransition(async () => {
      const result = await createManualLedgerEntry(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      window.location.href = "/finance/books";
    });
  }

  async function requestLock(key: string) {
    const ok = await deskConfirm({
      title: "Lock this month?",
      text: `No one can add or change entries for ${periodLabelFromKey(key)} until you unlock it.`,
      confirmLabel: "Lock month",
    });
    if (!ok) return;
    setBusyLabel("Locking month…");
    const form = new FormData();
    form.set("periodKey", key);
    startTransition(async () => {
      const result = await lockFinancePeriod(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      router.refresh();
    });
  }

  async function requestUnlock(key: string) {
    const ok = await deskConfirm({
      title: "Unlock this month?",
      text: `Entries for ${periodLabelFromKey(key)} can be added and changed again.`,
      confirmLabel: "Unlock month",
      danger: true,
    });
    if (!ok) return;
    setBusyLabel("Unlocking month…");
    const form = new FormData();
    form.set("periodKey", key);
    startTransition(async () => {
      const result = await unlockFinancePeriod(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      router.refresh();
    });
  }

  function submitReverse() {
    if (!reverseTarget) return;
    const target = reverseTarget;
    setReverseTarget(null);
    setBusyLabel("Saving reversal…");
    const form = new FormData();
    form.set("id", target.id);
    form.set("reason", reverseReason.trim());
    startTransition(async () => {
      const result = await reverseLedgerEntry(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      setReverseReason("");
      window.location.reload();
    });
  }

  function openProof(entry: FinanceLedgerEntry) {
    setProofEntry(entry);
    setProofFiles([]);
    setBusyLabel("Loading proof…");
    startTransition(async () => {
      try {
        const views = await loadEntryAttachmentViews(entry.id);
        setProofFiles(views);
      } catch {
        await deskError({ text: "Proof could not be loaded." });
        setProofEntry(null);
      }
    });
  }

  const busy = pending || navPending;

  return (
    <div className="relative">
      <DeskLoaderOverlay active={busy} label={busyLabel} />

      <FinanceDeskFlow
        kicker="Books"
        title="Money records"
        lead="See every entry, add new ones, and manage the categories that label them."
        activeId={panel}
        onStage={(id) => go(id as FinanceBooksPanel)}
        stages={[
          {
            id: "browse",
            label: "Records",
            hint: "Search, filter, lock months, and add money entries.",
            count: filtered.length,
          },
          {
            id: "categories",
            label: "Categories",
            hint: "Create and retire labels used on money entries.",
            count: activeCategories.length,
          },
        ]}
        aside={
          panel === "browse" ? (
            <button
              type="button"
              onClick={openCompose}
              className="bg-pine px-4 py-2.5 text-sm font-semibold text-mist hover:bg-celadon"
            >
              Add entry
            </button>
          ) : null
        }
      >
      {panel === "browse" ? (
        <div key="browse" className="space-y-6">
      {composeOpen ? (
        <section
          id="finance-books-add-entry"
          className="animate-fade-rise border border-pine/25 bg-white/70 px-5 py-6 sm:px-6"
        >
          <DeskLoaderOverlay active={pending} label="Saving entry…" />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                New entry
              </p>
              <h3
                id="finance-books-compose-title"
                className="mt-2 font-display text-2xl tracking-[-0.02em] text-pine"
              >
                Add a money entry
              </h3>
              <p className="mt-2 max-w-xl text-sm text-ink/60">
                Entries cannot be edited later. If something is wrong, add a
                reversing entry instead.
              </p>
            </div>
            <button
              type="button"
              onClick={closeCompose}
              disabled={pending}
              className="border border-pine/25 px-3 py-2 text-sm font-medium text-pine hover:border-pine disabled:opacity-60"
            >
              Close
            </button>
          </div>

          {activeCategories.length === 0 ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-ink/65">
                Add at least one category before you save an entry.
              </p>
              <button
                type="button"
                onClick={() => {
                  closeCompose();
                  go("categories");
                }}
                className="bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
              >
                Manage categories
              </button>
            </div>
          ) : (
            <form onSubmit={openCreateConfirm} className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-ink">
                Direction
                <select
                  value={direction}
                  onChange={(event) =>
                    setDirection(event.target.value as "out" | "in")
                  }
                  className={fieldClass}
                >
                  <option value="out">Money out</option>
                  <option value="in">Money in</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-ink">
                Category
                <select
                  required
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className={fieldClass}
                >
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-ink sm:col-span-2">
                Payee
                <input
                  required
                  maxLength={200}
                  value={payee}
                  onChange={(event) => setPayee(event.target.value)}
                  className={fieldClass}
                  placeholder="Who was paid, or who paid"
                />
              </label>
              <label className="block text-sm font-medium text-ink">
                Amount (GBP)
                <input
                  required
                  inputMode="decimal"
                  value={amountGbp}
                  onChange={(event) => setAmountGbp(event.target.value)}
                  className={fieldClass}
                  placeholder="0.00"
                />
              </label>
              <label className="block text-sm font-medium text-ink">
                Date
                <input
                  required
                  type="date"
                  value={incurredOn}
                  onChange={(event) => setIncurredOn(event.target.value)}
                  className={fieldClass}
                />
              </label>
              <label className="block text-sm font-medium text-ink sm:col-span-2">
                Comment / reason
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  className={fieldClass}
                  placeholder="Optional — what this was for"
                />
              </label>

              <div className="sm:col-span-2">
                <FinanceAttachmentPicker
                  value={attachments}
                  onChange={setAttachments}
                  disabled={pending}
                />
              </div>

              <div className="flex flex-col-reverse gap-3 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={pending}
                  onClick={closeCompose}
                  className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-60"
                >
                  Review and save
                </button>
              </div>
            </form>
          )}
        </section>
      ) : null}

          <section className="border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
              Summary
            </p>
            <h2 className="mt-1 font-display text-xl text-pine">
              {dateSelectionIsActive(dateSelection) ||
              filters.direction !== "all" ||
              filters.categoryId ||
              filters.proof !== "all" ||
              query.trim()
                ? "Matching entries"
                : "All loaded entries"}
            </h2>
            <dl className="mt-5 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-ink/40">
                  Out
                </dt>
                <dd className="mt-1 font-display text-2xl text-pine tabular-nums">
                  {formatGbp(filteredSummary.totalOutGbp)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-ink/40">
                  In
                </dt>
                <dd className="mt-1 font-display text-2xl text-pine tabular-nums">
                  {formatGbp(filteredSummary.totalInGbp)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-ink/40">
                  Without proof
                </dt>
                <dd className="mt-1 font-display text-2xl text-pine tabular-nums">
                  {filteredSummary.withoutProofCount}
                </dd>
              </div>
            </dl>
          </section>

          <section className="border border-stone/80 bg-white/55">
            <div className="flex flex-col gap-3 border-b border-stone/70 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search records</span>
                <span
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink/35"
                  aria-hidden
                >
                  <SearchIcon />
                </span>
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search payee, reason, category…"
                  className="w-full border border-stone bg-white/70 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-pine"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((open) => !open)}
                  className={`inline-flex items-center gap-2 border px-3 py-2.5 text-sm font-medium transition-colors ${
                    filtersOpen || activeFilterCount
                      ? "border-pine bg-pine/5 text-pine"
                      : "border-pine/25 text-pine hover:border-pine"
                  }`}
                  aria-expanded={filtersOpen}
                >
                  <FilterIcon />
                  {filtersOpen ? "Hide filters" : "Filters"}
                  {activeFilterCount ? (
                    <span className="bg-pine px-1.5 py-0.5 text-[0.65rem] tabular-nums text-mist">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={pending || filtered.length === 0}
                  className="inline-flex items-center border border-pine/25 px-3 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-50"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={openCompose}
                  className="inline-flex items-center gap-2 bg-pine px-3 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
                >
                  <PlusIcon />
                  Add entry
                </button>
              </div>
            </div>

            {filtersOpen ? (
              <div className="animate-fade-rise space-y-5 border-b border-stone/70 bg-mist/40 px-4 py-4 sm:px-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block text-sm font-medium text-ink">
                    Direction
                    <select
                      value={filters.direction}
                      onChange={(event) => {
                        setFilters((prev) => ({
                          ...prev,
                          direction: event.target.value as Filters["direction"],
                        }));
                        setPage(1);
                      }}
                      className={fieldClass}
                    >
                      <option value="all">All</option>
                      <option value="out">Money out</option>
                      <option value="in">Money in</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-ink">
                    Category
                    <select
                      value={filters.categoryId}
                      onChange={(event) => {
                        setFilters((prev) => ({
                          ...prev,
                          categoryId: event.target.value,
                        }));
                        setPage(1);
                      }}
                      className={fieldClass}
                    >
                      <option value="">All categories</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                          {category.retired_at ? " (retired)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm font-medium text-ink">
                    Proof
                    <select
                      value={filters.proof}
                      onChange={(event) => {
                        setFilters((prev) => ({
                          ...prev,
                          proof: event.target.value as Filters["proof"],
                        }));
                        setPage(1);
                      }}
                      className={fieldClass}
                    >
                      <option value="all">Any</option>
                      <option value="with">With proof</option>
                      <option value="without">Without proof</option>
                    </select>
                  </label>
                </div>

                <FinanceBooksDateTools
                  selection={dateSelection}
                  onChange={applyDateSelection}
                  monthSpend={monthSpend}
                  lockedPeriodKeys={lockedPeriodKeys}
                />

                <div className="border border-stone/70 bg-white/50 p-4">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
                    Close a month
                  </p>
                  <p className="mt-1 text-sm text-ink/55">
                    Locked months reject new entries. Corrections still use
                    reversing entries. Unlocking is recorded permanently.
                  </p>
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="block text-sm font-medium text-ink">
                      Month
                      <input
                        type="month"
                        value={lockPeriodKey}
                        onChange={(event) =>
                          setLockPeriodKey(event.target.value)
                        }
                        className={fieldClass}
                      />
                    </label>
                    {lockIsLocked ? (
                      <button
                        type="button"
                        onClick={() => void requestUnlock(lockPeriodKey)}
                        className="border border-red-800/25 px-3 py-2.5 text-sm font-medium text-red-900 hover:border-red-800/50"
                      >
                        Unlock {periodLabelFromKey(lockPeriodKey)}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void requestLock(lockPeriodKey)}
                        className="bg-pine px-3 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
                      >
                        Lock {periodLabelFromKey(lockPeriodKey)}
                      </button>
                    )}
                    {lockRow?.reopened_at ? (
                      <p className="text-xs text-ink/45">
                        Previously reopened{" "}
                        {lockRow.reopened_at.slice(0, 10)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => go("categories")}
                    className="text-sm font-medium text-pine underline decoration-pine/25 underline-offset-2"
                  >
                    Manage categories
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilters(emptyFilters);
                      applyDateSelection(emptyDateSelection());
                      setPage(1);
                    }}
                    className="text-sm font-medium text-ink/55 hover:text-pine"
                  >
                    Clear filters
                  </button>
                </div>
              </div>
            ) : null}

            {filtered.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="font-display text-lg text-pine">No records match</p>
                <p className="mt-2 text-sm text-ink/55">
                  Adjust search or filters, or add the first record.
                </p>
                <button
                  type="button"
                  onClick={openCompose}
                  className="mt-5 inline-flex bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
                >
                  Add entry
                </button>
              </div>
            ) : (
              <>
                <DeskPagination
                  page={currentPage}
                  totalItems={filtered.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                  itemLabel="records"
                  variant="header"
                  className="px-4 sm:px-5"
                />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <thead className="border-y border-stone/70 bg-mist/50 text-[0.65rem] uppercase tracking-[0.12em] text-ink/45">
                      <tr>
                        <th className="px-4 py-3 font-medium sm:px-5">Date</th>
                        <th className="px-4 py-3 font-medium sm:px-5">Payee</th>
                        <th className="px-4 py-3 font-medium sm:px-5">
                          Category
                        </th>
                        <th className="px-4 py-3 font-medium sm:px-5">Dir.</th>
                        <th className="px-4 py-3 font-medium sm:px-5 text-right">
                          Amount
                        </th>
                        <th className="px-4 py-3 font-medium sm:px-5"> </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone/60">
                      {pageRows.map((entry) => {
                        const isReversal = Boolean(entry.reverses_entry_id);
                        const isReversed = entry.status === "reversed";
                        return (
                          <tr
                            key={entry.id}
                            className="align-top transition-colors hover:bg-pine/[0.03]"
                          >
                            <td className="whitespace-nowrap px-4 py-3.5 text-ink/70 sm:px-5">
                              {formatDay(entry.incurred_on)}
                            </td>
                            <td className="px-4 py-3.5 sm:px-5">
                              <p className="font-medium text-ink">
                                {entry.payee}
                              </p>
                              {entry.reason ? (
                                <p className="mt-1 line-clamp-2 text-ink/50">
                                  {entry.reason}
                                </p>
                              ) : null}
                              <div className="mt-1.5 flex flex-wrap gap-2">
                                {isReversed ? (
                                  <span className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                                    Reversed
                                  </span>
                                ) : null}
                                {isReversal ? (
                                  <span className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-celadon">
                                    Reversal
                                  </span>
                                ) : null}
                                {!entry.has_proof &&
                                !isReversal &&
                                !isReversed ? (
                                  <span className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-amber-800/80">
                                    No proof
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-ink/60 sm:px-5">
                              {entry.category_name ?? "—"}
                            </td>
                            <td className="px-4 py-3.5 text-ink/60 sm:px-5">
                              {entry.direction === "out" ? "Out" : "In"}
                            </td>
                            <td
                              className={`whitespace-nowrap px-4 py-3.5 text-right font-medium tabular-nums sm:px-5 ${
                                entry.direction === "out"
                                  ? "text-pine"
                                  : "text-celadon"
                              }`}
                            >
                              {entry.direction === "out" ? "−" : "+"}
                              {formatGbp(entry.amount_gbp)}
                            </td>
                            <td className="px-4 py-3.5 sm:px-5">
                              <div className="flex flex-wrap justify-end gap-2">
                                {entry.has_proof ? (
                                  <button
                                    type="button"
                                    onClick={() => openProof(entry)}
                                    className="text-sm font-medium text-pine hover:underline"
                                  >
                                    Proof
                                  </button>
                                ) : null}
                                {!isReversed && !isReversal ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReverseTarget(entry);
                                      setReverseReason("");
                                    }}
                                    className="text-sm font-medium text-red-800 hover:underline"
                                  >
                                    Reverse
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <DeskPagination
                  page={currentPage}
                  totalItems={filtered.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                  itemLabel="records"
                  className="px-4 sm:px-5"
                />
              </>
            )}
          </section>
        </div>
      ) : null}

      {panel === "categories" ? (
        <FinanceCategoriesManager initialCategories={categories} />
      ) : null}
      </FinanceDeskFlow>

      <DeskConfirmModal
        open={Boolean(reverseTarget)}
        title="Reverse this entry?"
        body={
          reverseTarget ? (
            <div className="space-y-3">
              <p>
                A new reversing entry will be created for{" "}
                <span className="font-medium text-ink">
                  {reverseTarget.payee}
                </span>{" "}
                · {formatGbp(reverseTarget.amount_gbp)}. The original is not
                edited or deleted.
              </p>
              <label className="block text-sm font-medium text-ink">
                Reason (optional)
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={reverseReason}
                  onChange={(event) => setReverseReason(event.target.value)}
                  className={fieldClass}
                  placeholder="Why this is being reversed"
                />
              </label>
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Record reversal"
        destructive
        busy={pending}
        onClose={() => setReverseTarget(null)}
        onConfirm={submitReverse}
      />

      {proofEntry ? (
        <DeskPortal>
          <div
            className="fixed inset-0 z-[200] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
            role="presentation"
            onClick={() => !pending && setProofEntry(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="finance-proof-title"
              className="w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                Proof
              </p>
              <h3
                id="finance-proof-title"
                className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
              >
                {proofEntry.payee}
              </h3>
              <p className="mt-2 text-sm text-ink/65">
                {formatGbp(proofEntry.amount_gbp)} ·{" "}
                {formatDay(proofEntry.incurred_on)}
              </p>
              <div className="mt-5">
                {proofFiles.length === 0 ? (
                  <p className="text-sm text-ink/55">Loading…</p>
                ) : (
                  <ul className="space-y-2">
                    {proofFiles.map((file) => (
                      <li key={file.id} className="text-sm">
                        {file.url ? (
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-pine underline decoration-pine/25 underline-offset-2"
                          >
                            {file.name}
                          </a>
                        ) : (
                          <span>{file.name}</span>
                        )}
                        <span className="ml-2 text-ink/45">
                          {formatAttachmentSize(file.byteSize)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-7 flex justify-end">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setProofEntry(null)}
                  className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-60"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </DeskPortal>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m16 16 3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16M7 12h10M10 18h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
