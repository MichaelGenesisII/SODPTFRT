"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createBatch,
  createParish,
  deleteBatch,
  deleteParish,
  retireBatch,
  setBatchEnrolmentOpen,
  updateBatch,
  updateParish,
  type ParishActionResult,
} from "@/app/admin/parishes/actions";
import {
  syncParishesFromBundledFile,
  syncParishesFromUpload,
} from "@/app/admin/parishes/sync-actions";
import { ParishesInsight } from "@/components/admin/parishes-insight";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import { isNationalAdmin, type AdminProfile } from "@/lib/admin/profile";
import { formatBatchLabel, type Batch, type Parish } from "@/lib/parishes";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50";

const PARISHES_PAGE_SIZE = 10;
const BATCHES_PAGE_SIZE = 12;

type PageView = "desk" | "manage" | "insight";
type ManageFocus = "default" | "create-parish" | "sync" | "batches";
type ManagePanel = "parish" | "batches" | "add-parish";

type ParishPendingConfirm =
  | { kind: "retireBatch"; batch: Batch }
  | { kind: "deleteBatch"; batch: Batch }
  | { kind: "deleteParish"; parish: Parish; nextParishId: string }
  | { kind: "openEnrol"; batch: Batch }
  | { kind: "closeEnrol"; batch: Batch }
  | { kind: "syncBundled" }
  | { kind: "syncUpload"; formData: FormData };

type ParishesManagerProps = {
  profile: AdminProfile;
  parishes: Parish[];
  batches: Batch[];
};

function ParishStatTile({
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

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 11V8a4 4 0 1 1 8 0v3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="6"
        y="11"
        width="12"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function UnlockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 11V8a4 4 0 0 1 7.5-1.9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect
        x="6"
        y="11"
        width="12"
        height="10"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
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
    </button>
  );
}

export function ParishesManager({
  profile,
  parishes,
  batches,
}: ParishesManagerProps) {
  const national = isNationalAdmin(profile);
  const [pageView, setPageView] = useState<PageView>("desk");
  const [selectedParishId, setSelectedParishId] = useState(
    profile.parish_id || parishes[0]?.id || "",
  );
  const [manageFocus, setManageFocus] = useState<ManageFocus>("default");

  useEffect(() => {
    if (selectedParishId && parishes.some((p) => p.id === selectedParishId)) {
      return;
    }
    setSelectedParishId(profile.parish_id || parishes[0]?.id || "");
  }, [parishes, selectedParishId, profile.parish_id]);

  function openManage(focus: ManageFocus = "default") {
    setManageFocus(focus);
    setPageView("manage");
  }

  const openBatchCount = useMemo(
    () => batches.filter((b) => b.enrolment_open && b.is_active).length,
    [batches],
  );

  const unlinkedBatchCount = useMemo(
    () => batches.filter((b) => b.is_active && !b.cohort_id).length,
    [batches],
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      <nav
        data-tour="parishes-tabs"
        className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
        aria-label="Parishes page"
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
        <ParishesInsight national={national} />
      ) : pageView === "manage" ? (
        <ParishesManage
          profile={profile}
          parishes={parishes}
          batches={batches}
          national={national}
          selectedParishId={selectedParishId}
          onSelectParishId={setSelectedParishId}
          initialFocus={manageFocus}
          onFocusHandled={() => setManageFocus("default")}
        />
      ) : (
        <ParishesDesk
          profile={profile}
          parishes={parishes}
          batches={batches}
          national={national}
          selectedParishId={selectedParishId}
          onSelectParishId={setSelectedParishId}
          openBatchCount={openBatchCount}
          unlinkedBatchCount={unlinkedBatchCount}
          onOpenManage={openManage}
        />
      )}
    </div>
  );
}

type SharedProps = ParishesManagerProps & {
  national: boolean;
  selectedParishId: string;
  onSelectParishId: (id: string) => void;
};

function useParishRun(onSelectParishId: (id: string) => void) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] =
    useState<ParishPendingConfirm | null>(null);
  const busy = pending || Boolean(busyLabel);

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

  function run(
    action: () => Promise<ParishActionResult>,
    label = "Working…",
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const next = await action();
        if (next.ok) {
          success(next.message, "Parishes");
          setPendingConfirm(null);
          if (next.parishId) onSelectParishId(next.parishId);
          router.refresh();
        } else {
          error(next.message, "Parishes");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function confirmPendingAction() {
    if (!pendingConfirm || busy) return;
    switch (pendingConfirm.kind) {
      case "retireBatch":
        run(() => retireBatch(pendingConfirm.batch.id), "Retiring batch…");
        return;
      case "deleteBatch":
        run(() => deleteBatch(pendingConfirm.batch.id), "Deleting batch…");
        return;
      case "deleteParish":
        run(async () => {
          const result = await deleteParish(pendingConfirm.parish.id);
          if (result.ok) {
            onSelectParishId(pendingConfirm.nextParishId);
          }
          return result;
        }, "Deleting parish…");
        return;
      case "openEnrol":
        run(
          () => setBatchEnrolmentOpen(pendingConfirm.batch.id, true),
          "Opening enrolment…",
        );
        return;
      case "closeEnrol":
        run(
          () => setBatchEnrolmentOpen(pendingConfirm.batch.id, false),
          "Closing enrolment…",
        );
        return;
      case "syncBundled":
        run(() => syncParishesFromBundledFile(), "Syncing centres…");
        return;
      case "syncUpload":
        run(
          () => syncParishesFromUpload(pendingConfirm.formData),
          "Syncing centres…",
        );
    }
  }

  return {
    pending: busy,
    busyLabel,
    run,
    pendingConfirm,
    setPendingConfirm,
    confirmPendingAction,
  };
}

function ParishConfirmDialog({
  confirm,
  busy,
  busyLabel,
  onCancel,
  onConfirm,
}: {
  confirm: ParishPendingConfirm;
  busy: boolean;
  busyLabel: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = (() => {
    switch (confirm.kind) {
      case "retireBatch":
        return {
          eyebrow: "Retire batch",
          title: `Retire ${formatBatchLabel(confirm.batch)}?`,
          body: "Closes enrolment and hides this batch from the enrol form. Students already enrolled keep portal access.",
          confirmLabel: "Retire batch",
          destructive: false,
        };
      case "deleteBatch":
        return {
          eyebrow: "Delete batch",
          title: `Delete ${formatBatchLabel(confirm.batch)}?`,
          body: "Only empty batches can be deleted. This cannot be undone.",
          confirmLabel: "Delete permanently",
          destructive: true,
        };
      case "deleteParish":
        return {
          eyebrow: "Delete parish",
          title: `Delete ${confirm.parish.name}?`,
          body: "Only empty parishes can be deleted. Batches and desk admins must be cleared first. This cannot be undone.",
          confirmLabel: "Delete permanently",
          destructive: true,
        };
      case "openEnrol":
        return {
          eyebrow: "Open enrolment",
          title: `Open enrolment for ${formatBatchLabel(confirm.batch)}?`,
          body: "Applicants will be able to choose this batch on the enrol form while it stays listed and open.",
          confirmLabel: "Open enrolment",
          destructive: false,
        };
      case "closeEnrol":
        return {
          eyebrow: "Close enrolment",
          title: `Close enrolment for ${formatBatchLabel(confirm.batch)}?`,
          body: "New applicants will no longer be able to choose this batch. Existing students keep access.",
          confirmLabel: "Close enrolment",
          destructive: false,
        };
      case "syncBundled":
        return {
          eyebrow: "Sync centres",
          title: "Sync from the bundled centres file?",
          body: "Updates parish listings from the packaged workbook. Existing student seats are not removed.",
          confirmLabel: "Sync centres",
          destructive: false,
        };
      case "syncUpload":
        return {
          eyebrow: "Sync centres",
          title: "Sync from the uploaded file?",
          body: "Updates parish listings from your spreadsheet. Existing student seats are not removed.",
          confirmLabel: "Sync centres",
          destructive: false,
        };
    }
  })();

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
      role="presentation"
      onClick={() => !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="parish-confirm-title"
        className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
        <p
          className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
            copy.destructive ? "text-red-800/80" : "text-celadon"
          }`}
        >
          {copy.eyebrow}
        </p>
        <h3
          id="parish-confirm-title"
          className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
        >
          {copy.title}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-ink/70">{copy.body}</p>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center px-4 py-2.5 text-sm font-medium text-mist transition-colors disabled:opacity-60 ${
              copy.destructive
                ? "bg-[#5c2a2a] hover:bg-red-900"
                : "bg-pine hover:bg-celadon"
            }`}
          >
            {busy ? (
              <DeskLoader label="Working…" tone="mist" />
            ) : (
              copy.confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ParishesDesk({
  parishes,
  batches,
  national,
  selectedParishId,
  onSelectParishId,
  openBatchCount,
  unlinkedBatchCount,
  onOpenManage,
}: SharedProps & {
  openBatchCount: number;
  unlinkedBatchCount: number;
  onOpenManage: (focus?: ManageFocus) => void;
}) {
  const {
    pending,
    busyLabel,
    pendingConfirm,
    setPendingConfirm,
    confirmPendingAction,
  } = useParishRun(onSelectParishId);
  const [query, setQuery] = useState("");
  const [filterOpenOnly, setFilterOpenOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [batchPage, setBatchPage] = useState(1);
  const [mobileSurface, setMobileSurface] = useState<
    "directory" | "workspace"
  >("directory");

  const selectedParish = parishes.find((p) => p.id === selectedParishId) ?? null;

  const batchesByParish = useMemo(() => {
    const map = new Map<string, { total: number; open: number }>();
    for (const batch of batches) {
      const current = map.get(batch.parish_id) ?? { total: 0, open: 0 };
      current.total += 1;
      if (batch.enrolment_open && batch.is_active) current.open += 1;
      map.set(batch.parish_id, current);
    }
    return map;
  }, [batches]);

  const filteredParishes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return parishes.filter((parish) => {
      if (!q) return true;
      return [parish.name, parish.region, parish.slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [parishes, query]);

  const parishTotalPages = Math.max(
    1,
    Math.ceil(filteredParishes.length / PARISHES_PAGE_SIZE),
  );
  const parishCurrentPage = Math.min(page, parishTotalPages);
  const parishPageStart = (parishCurrentPage - 1) * PARISHES_PAGE_SIZE;
  const pageParishes = filteredParishes.slice(
    parishPageStart,
    parishPageStart + PARISHES_PAGE_SIZE,
  );

  const parishBatches = useMemo(() => {
    const rows = batches.filter((b) => b.parish_id === selectedParishId);
    if (!filterOpenOnly) return rows;
    return rows.filter((b) => b.enrolment_open && b.is_active);
  }, [batches, selectedParishId, filterOpenOnly]);

  const batchTotalPages = Math.max(
    1,
    Math.ceil(parishBatches.length / BATCHES_PAGE_SIZE),
  );
  const batchCurrentPage = Math.min(batchPage, batchTotalPages);
  const batchPageStart = (batchCurrentPage - 1) * BATCHES_PAGE_SIZE;
  const pageBatches = parishBatches.slice(
    batchPageStart,
    batchPageStart + BATCHES_PAGE_SIZE,
  );
  const batchRangeFrom =
    parishBatches.length === 0 ? 0 : batchPageStart + 1;
  const batchRangeTo = Math.min(
    batchPageStart + BATCHES_PAGE_SIZE,
    parishBatches.length,
  );

  useEffect(() => {
    setPage(1);
  }, [query]);

  useEffect(() => {
    if (page > parishTotalPages) setPage(parishTotalPages);
  }, [page, parishTotalPages]);

  useEffect(() => {
    setBatchPage(1);
  }, [selectedParishId, filterOpenOnly]);

  useEffect(() => {
    if (batchPage > batchTotalPages) setBatchPage(batchTotalPages);
  }, [batchPage, batchTotalPages]);

  const directoryClass =
    mobileSurface === "directory" ? "block" : "hidden lg:block";
  const workspaceClass =
    mobileSurface === "workspace" ? "block" : "hidden lg:block";

  return (
    <div className="relative space-y-3 sm:space-y-4" aria-busy={pending}>
      <DeskLoaderOverlay active={pending} label="Updating…" />

      <section
        data-tour="parishes-stats"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3.5"
      >
        <ParishStatTile
          label="Parishes"
          value={parishes.length}
          hint={national ? "UK network" : "Your desk"}
        />
        <ParishStatTile
          label="Open batches"
          shortLabel="Open"
          value={openBatchCount}
          hint="On enrol form"
        />
        <ParishStatTile
          label="All batches"
          shortLabel="Batches"
          value={batches.length}
          hint="Every course run"
        />
        <ParishStatTile
          label="Unlinked"
          shortLabel="Link"
          value={unlinkedBatchCount}
          hint="No programme cohort"
        />
      </section>

      {national && unlinkedBatchCount > 0 ? (
        <button
          type="button"
          onClick={() => onOpenManage("batches")}
          className="flex w-full items-center justify-between gap-3 border border-celadon/40 bg-white px-3 py-2.5 text-left text-sm shadow-[0_8px_20px_-12px_rgba(20,53,44,0.28)] transition hover:border-pine"
        >
          <span>
            <span className="font-medium text-pine">
              {unlinkedBatchCount} batch
              {unlinkedBatchCount === 1 ? "" : "es"}
            </span>{" "}
            <span className="text-ink/60">
              not linked to a programme cohort
            </span>
          </span>
          <span className="shrink-0 text-xs font-medium text-celadon">
            Manage →
          </span>
        </button>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] lg:gap-4">
        <aside
          data-tour="parishes-directory"
          className={`${directoryClass} flex flex-col border border-stone bg-white/60`}
        >
          <div className="border-b border-stone px-3 py-3 sm:px-4">
            <label className="block text-sm">
              <span className="sr-only">Search parishes</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search parish or region…"
                className={fieldClass}
              />
            </label>
            {national ? (
              <button
                type="button"
                onClick={() => onOpenManage("create-parish")}
                className="mt-2 w-full border border-celadon/50 px-3 py-2 text-sm font-medium text-pine transition hover:border-pine hover:bg-pine/5"
              >
                + New parish
              </button>
            ) : null}
          </div>
          <ul className="max-h-[min(24rem,50vh)] divide-y divide-stone overflow-y-auto lg:max-h-none lg:flex-1">
            {pageParishes.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-ink/50">
                {parishes.length === 0
                  ? "No parishes yet."
                  : "No match for that search."}
              </li>
            ) : (
              pageParishes.map((parish) => {
                const active = parish.id === selectedParishId;
                const counts = batchesByParish.get(parish.id) ?? {
                  total: 0,
                  open: 0,
                };
                return (
                  <li key={parish.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectParishId(parish.id);
                        setMobileSurface("workspace");
                      }}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-3 text-left transition sm:px-4 ${
                        active
                          ? "bg-pine/5 ring-1 ring-inset ring-pine/25"
                          : "hover:bg-stone/30"
                      }`}
                    >
                      <span className="flex w-full items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-pine">
                          {parish.name}
                        </span>
                        <span className="shrink-0 text-[0.65rem] tabular-nums text-ink/45">
                          {counts.open}/{counts.total}
                        </span>
                      </span>
                      <span className="truncate text-xs text-ink/50">
                        {parish.region || "No region"}
                        {!parish.is_active ? " · retired" : ""}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <DeskPagination
            page={parishCurrentPage}
            totalItems={filteredParishes.length}
            pageSize={PARISHES_PAGE_SIZE}
            onPageChange={(next) => setPage(next)}
            className="px-3 pb-2.5"
            itemLabel="parishes"
          />
        </aside>

        <section className={`${workspaceClass} min-w-0 border border-stone bg-mist/30`}>
          {!selectedParish ? (
            <div className="flex min-h-[16rem] flex-col items-center justify-center px-4 py-12 text-center">
              <p className="font-display text-xl text-pine">Choose a parish</p>
              <p className="mt-2 max-w-sm text-sm text-ink/55">
                {national
                  ? "Pick one from the directory to see batches, or create a parish under Manage."
                  : "Your parish will appear here once assigned."}
              </p>
            </div>
          ) : (
            <>
              <header className="flex flex-wrap items-start justify-between gap-3 border-b border-stone bg-white/50 px-3 py-3 sm:px-4 sm:py-4">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setMobileSurface("directory")}
                    className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
                  >
                    <span aria-hidden>←</span> Directory
                  </button>
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                    {selectedParish.region || "No region"}
                  </p>
                  <h2 className="mt-0.5 font-display text-xl tracking-[-0.02em] text-pine">
                    {selectedParish.name}
                  </h2>
                  <p className="mt-1 text-sm text-ink/55">
                    {selectedParish.is_active
                      ? "Listed on enrol"
                      : "Retired from enrol"}
                    {" · "}
                    {batchesByParish.get(selectedParish.id)?.open ?? 0} open /{" "}
                    {batchesByParish.get(selectedParish.id)?.total ?? 0} batches
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenManage("batches")}
                  className="shrink-0 border border-stone px-3 py-2 text-xs font-medium text-pine transition hover:border-pine hover:bg-pine/5"
                >
                  Manage →
                </button>
              </header>

              <div className="border-b border-stone bg-mist/40 px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                    Batches
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <FilterChip
                      label="All"
                      active={!filterOpenOnly}
                      onClick={() => setFilterOpenOnly(false)}
                    />
                    <FilterChip
                      label="Open only"
                      active={filterOpenOnly}
                      onClick={() => setFilterOpenOnly(true)}
                    />
                  </div>
                </div>
              </div>

              <div className="hidden border-b border-stone bg-white/50 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45 md:grid md:grid-cols-[minmax(0,1.2fr)_5rem_5rem_5rem_2.5rem] md:gap-3">
                <span>Batch</span>
                <span>Listed</span>
                <span>Programme</span>
                <span>Enrol</span>
                <span />
              </div>

              <ul className="divide-y divide-stone">
                {pageBatches.map((batch) => (
                  <li
                    key={batch.id}
                    className="grid items-center gap-2 px-3 py-3 sm:px-4 md:grid-cols-[minmax(0,1.2fr)_5rem_5rem_5rem_2.5rem] md:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {formatBatchLabel(batch)}
                      </p>
                      <p className="mt-0.5 text-xs text-ink/45 md:hidden">
                        {batch.is_active ? "Listed" : "Retired"}
                        {" · "}
                        {batch.cohort_id ? "Linked" : "Unlinked"}
                      </p>
                    </div>
                    <span className="hidden text-xs text-ink/55 md:block">
                      {batch.is_active ? "Yes" : "Retired"}
                    </span>
                    <span className="hidden text-xs md:block">
                      {batch.cohort_id ? (
                        <span className="text-celadon">Linked</span>
                      ) : (
                        <span className="text-ink/45">—</span>
                      )}
                    </span>
                    <span className="hidden text-xs md:block">
                      {batch.enrolment_open && batch.is_active ? (
                        <span className="text-pine">Open</span>
                      ) : (
                        <span className="text-ink/45">Closed</span>
                      )}
                    </span>
                    <button
                      type="button"
                      disabled={pending || !batch.is_active}
                      title={
                        batch.enrolment_open
                          ? "Close enrolment"
                          : "Open enrolment"
                      }
                      aria-label={
                        batch.enrolment_open
                          ? "Close enrolment"
                          : "Open enrolment"
                      }
                      onClick={() =>
                        setPendingConfirm({
                          kind: batch.enrolment_open
                            ? "closeEnrol"
                            : "openEnrol",
                          batch,
                        })
                      }
                      className={`flex h-8 w-8 items-center justify-center border transition disabled:opacity-50 md:justify-self-end ${
                        batch.enrolment_open
                          ? "border-pine bg-pine text-mist"
                          : "border-stone text-ink/45 hover:border-pine hover:text-pine"
                      }`}
                    >
                      {batch.enrolment_open ? (
                        <UnlockIcon className="h-3.5 w-3.5" />
                      ) : (
                        <LockIcon className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              {parishBatches.length === 0 ? (
                <div className="px-4 py-12 text-center">
                  <p className="font-display text-lg text-pine">No batches yet</p>
                  <p className="mt-2 text-sm text-ink/55">
                    Add the first course run under Manage.
                  </p>
                  <button
                    type="button"
                    onClick={() => onOpenManage("batches")}
                    className="mt-4 border border-pine px-4 py-2 text-sm font-medium text-pine hover:bg-pine hover:text-mist"
                  >
                    Manage batches
                  </button>
                </div>
              ) : (
                <>
                  <div className="border-t border-stone px-3 py-2 text-sm text-ink/55 sm:px-4">
                    Showing {batchRangeFrom}–{batchRangeTo} of{" "}
                    {parishBatches.length}
                  </div>
                  <DeskPagination
                    page={batchCurrentPage}
                    totalItems={parishBatches.length}
                    pageSize={BATCHES_PAGE_SIZE}
                    onPageChange={setBatchPage}
                    className="px-3 pb-2.5 sm:px-4 sm:pb-3"
                    itemLabel="batches"
                  />
                </>
              )}
            </>
          )}
        </section>
      </div>

      {pendingConfirm ? (
        <ParishConfirmDialog
          confirm={pendingConfirm}
          busy={pending}
          busyLabel={busyLabel}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={confirmPendingAction}
        />
      ) : null}
    </div>
  );
}

function ParishesManage({
  parishes,
  batches,
  national,
  selectedParishId,
  onSelectParishId,
  initialFocus,
  onFocusHandled,
}: SharedProps & {
  initialFocus: ManageFocus;
  onFocusHandled: () => void;
}) {
  const { pending, busyLabel, run, pendingConfirm, setPendingConfirm, confirmPendingAction } =
    useParishRun(onSelectParishId);
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<ManagePanel>("batches");
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [addingBatch, setAddingBatch] = useState(false);
  const syncSectionRef = useRef<HTMLElement>(null);

  const selectedParish = parishes.find((p) => p.id === selectedParishId) ?? null;

  const filteredParishes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return parishes;
    return parishes.filter((parish) =>
      [parish.name, parish.region, parish.slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [parishes, query]);

  const parishBatches = useMemo(
    () => batches.filter((b) => b.parish_id === selectedParishId),
    [batches, selectedParishId],
  );

  useEffect(() => {
    if (initialFocus === "create-parish") {
      setPanel("add-parish");
      onFocusHandled();
      return;
    }
    if (initialFocus === "batches") {
      setPanel("batches");
      onFocusHandled();
      return;
    }
    if (initialFocus === "sync" && syncSectionRef.current) {
      setPanel("parish");
      syncSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      onFocusHandled();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFocus]);

  useEffect(() => {
    setExpandedBatchId(null);
    setAddingBatch(false);
    if (panel === "add-parish") return;
    setPanel(selectedParish ? "batches" : "parish");
  }, [selectedParishId]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectParish(id: string) {
    onSelectParishId(id);
    setPanel("batches");
  }

  return (
    <div className="relative space-y-3 sm:space-y-4" aria-busy={pending}>
      <DeskLoaderOverlay active={pending} label="Saving…" />

      <header className="border border-stone bg-mist/50 px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          {national ? "UK network" : "Your parish"}
        </p>
        <h2 className="mt-1 font-display text-xl tracking-[-0.02em] text-pine sm:text-2xl">
          Manage
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
          {national
            ? "Import churches, edit parish settings, and create or retire course runs."
            : "Add batches and control enrolment listing for your parish."}
        </p>
      </header>

      {national ? (
        <section
          ref={syncSectionRef}
          className="border border-stone bg-white/70 px-4 py-5 sm:px-5"
        >
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Master import
          </p>
          <h3 className="mt-1 font-display text-lg text-pine">
            Parish directory sync
          </h3>
          <p className="mt-1.5 text-sm text-ink/55">
            Import RCCG UK churches from spreadsheet — existing names update,
            new ones are added.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setPendingConfirm({ kind: "syncUpload", formData: fd });
              }}
              className="flex flex-wrap items-end gap-2"
            >
              <label className="block text-sm">
                Upload Excel
                <input
                  type="file"
                  name="file"
                  accept=".xlsx,.xls"
                  disabled={pending}
                  className={`mt-1.5 block ${fieldClass} disabled:opacity-50`}
                  required
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="inline-flex min-h-[2.75rem] items-center justify-center border border-pine px-4 py-2.5 text-sm font-medium text-pine hover:bg-pine hover:text-mist disabled:opacity-50"
              >
                {pending ? <DeskLoader label="Syncing…" /> : "Sync upload"}
              </button>
            </form>
            <button
              type="button"
              disabled={pending}
              onClick={() => setPendingConfirm({ kind: "syncBundled" })}
              className="inline-flex min-h-[2.75rem] items-center justify-center border border-stone px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-50"
            >
              Sync bundled file
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)] lg:gap-4">
        <aside className="flex flex-col border border-stone bg-white/60">
          <div className="border-b border-stone px-3 py-3 sm:px-4">
            <label className="block text-sm">
              <span className="sr-only">Search parishes</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search parishes…"
                disabled={pending}
                className={fieldClass}
              />
            </label>
            {national ? (
              <button
                type="button"
                onClick={() => setPanel("add-parish")}
                disabled={pending}
                className="mt-2 w-full border border-celadon/50 px-3 py-2 text-sm font-medium text-pine transition hover:border-pine hover:bg-pine/5 disabled:opacity-50"
              >
                + New parish
              </button>
            ) : null}
          </div>
          <ul className="max-h-[min(24rem,50vh)] divide-y divide-stone overflow-y-auto lg:max-h-none lg:flex-1">
            {filteredParishes.map((parish) => {
              const active =
                parish.id === selectedParishId && panel !== "add-parish";
              const batchCount = batches.filter(
                (b) => b.parish_id === parish.id,
              ).length;
              return (
                <li key={parish.id}>
                  <button
                    type="button"
                    onClick={() => selectParish(parish.id)}
                    disabled={pending}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-3 text-left transition sm:px-4 ${
                      active
                        ? "bg-pine/5 ring-1 ring-inset ring-pine/25"
                        : "hover:bg-stone/30"
                    } disabled:opacity-50`}
                  >
                    <span className="text-sm font-medium text-pine">
                      {parish.name}
                    </span>
                    <span className="text-xs text-ink/50">
                      {parish.region || "No region"} · {batchCount} batch
                      {batchCount === 1 ? "" : "es"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="min-w-0 space-y-4">
          {panel === "add-parish" && national ? (
            <section className="border border-stone bg-white/70 px-4 py-5 sm:px-6">
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                New parish
              </p>
              <h3 className="mt-1 font-display text-lg text-pine">
                Add a church
              </h3>
              <form
                className="mt-5 grid max-w-lg gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const fd = new FormData(form);
                  run(async () => {
                    const result = await createParish(fd);
                    if (result.ok) {
                      form.reset();
                      setPanel("batches");
                    }
                    return result;
                  });
                }}
              >
                <label className="block text-sm sm:col-span-2">
                  Parish name
                  <input
                    name="name"
                    required
                    placeholder="e.g. London Central"
                    className={`mt-1.5 ${fieldClass}`}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  Region
                  <input
                    name="region"
                    placeholder="Optional — London, North West…"
                    className={`mt-1.5 ${fieldClass}`}
                  />
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="inline-flex min-h-[2.75rem] items-center justify-center bg-pine px-5 py-2.5 text-sm font-medium text-mist disabled:opacity-60"
                  >
                    Create parish
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      selectedParish ? setPanel("batches") : setPanel("parish")
                    }
                    className="inline-flex min-h-[2.75rem] items-center justify-center border border-stone px-5 py-2.5 text-sm text-ink/70"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </section>
          ) : !selectedParish ? (
            <div className="border border-dashed border-stone px-4 py-12 text-center">
              <p className="font-display text-lg text-pine">Select a parish</p>
              <p className="mt-2 text-sm text-ink/55">
                Pick one from the list to manage settings and batches.
              </p>
            </div>
          ) : (
            <>
              <nav
                className="flex gap-1 overflow-x-auto border-b border-stone pb-px"
                aria-label="Manage sections"
              >
                {(
                  [
                    { id: "batches" as const, label: "Batches" },
                    { id: "parish" as const, label: "Parish settings" },
                  ] as const
                ).map((tab) => {
                  const active = panel === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPanel(tab.id)}
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

              {panel === "batches" ? (
                <section className="border border-stone bg-white/70 px-4 py-5 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                        Course runs
                      </p>
                      <h3 className="mt-1 font-display text-lg text-pine">
                        {selectedParish.name}
                      </h3>
                      <p className="mt-1 text-sm text-ink/55">
                        Batches stay local for parish placement. Programme intake
                        is assigned at enrolment — filter by Cohort 1–3 on{" "}
                        <Link
                          href="/admin/students"
                          className="font-medium text-pine underline decoration-pine/25"
                        >
                          Students
                        </Link>
                        .
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingBatch((v) => !v);
                        setExpandedBatchId(null);
                      }}
                      className={`border px-3 py-2 text-sm font-medium transition ${
                        addingBatch
                          ? "border-pine bg-pine text-mist"
                          : "border-pine/35 text-pine hover:border-pine"
                      }`}
                    >
                      {addingBatch ? "Close" : "+ Add batch"}
                    </button>
                  </div>

                  {addingBatch ? (
                    <form
                      className="mt-5 border border-stone bg-mist/40 p-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const fd = new FormData(form);
                        run(async () => {
                          const result = await createBatch(fd);
                          if (result.ok) {
                            form.reset();
                            setAddingBatch(false);
                          }
                          return result;
                        });
                      }}
                    >
                      <input
                        type="hidden"
                        name="parishId"
                        value={selectedParish.id}
                      />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <input
                          name="name"
                          required
                          placeholder="Batch name (e.g. Year 1)"
                          className={`${fieldClass} sm:col-span-2`}
                        />
                        <input
                          name="year"
                          type="number"
                          required
                          min={2000}
                          max={2100}
                          defaultValue={new Date().getFullYear()}
                          className={fieldClass}
                        />
                      </div>
                      <label className="mt-3 flex items-center gap-2 text-sm text-ink/70">
                        <input
                          type="checkbox"
                          name="enrolmentOpen"
                          value="1"
                          defaultChecked
                        />
                        Open enrolment now
                      </label>
                      <button
                        type="submit"
                        disabled={pending}
                        className="mt-4 bg-pine px-4 py-2.5 text-sm font-medium text-mist disabled:opacity-60"
                      >
                        Create batch
                      </button>
                    </form>
                  ) : null}

                  <ul className="mt-5 divide-y divide-stone border-y border-stone">
                    {parishBatches.length === 0 ? (
                      <li className="py-10 text-center text-sm text-ink/50">
                        No batches yet. Add the first course run above.
                      </li>
                    ) : (
                      parishBatches.map((batch) => {
                        const open = expandedBatchId === batch.id;
                        return (
                          <li key={batch.id} className="py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedBatchId(open ? null : batch.id)
                              }
                              className="flex w-full items-center justify-between gap-2 text-left"
                            >
                              <span>
                                <span className="text-sm font-medium text-ink">
                                  {formatBatchLabel(batch)}
                                </span>
                                <span className="mt-0.5 block text-xs text-ink/45">
                                  {batch.enrolment_open
                                    ? "Enrolment open"
                                    : "Enrolment closed"}
                                  {" · "}
                                  {batch.cohort_id
                                    ? "Programme linked"
                                    : "Not linked"}
                                </span>
                              </span>
                              <span className="text-xs text-pine">
                                {open ? "Hide" : "Edit"}
                              </span>
                            </button>
                            {open ? (
                              <form
                                className="mt-4 border border-stone/80 bg-mist/30 p-4"
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  const fd = new FormData(event.currentTarget);
                                  run(async () => {
                                    const result = await updateBatch(fd);
                                    if (result.ok) setExpandedBatchId(null);
                                    return result;
                                  });
                                }}
                              >
                                <input type="hidden" name="id" value={batch.id} />
                                <input
                                  type="hidden"
                                  name="enrolmentOpen"
                                  value={batch.enrolment_open ? "1" : "0"}
                                />
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="block text-sm">
                                    Name
                                    <input
                                      name="name"
                                      defaultValue={batch.name}
                                      required
                                      className={`mt-1.5 ${fieldClass}`}
                                    />
                                  </label>
                                  <label className="block text-sm">
                                    Year
                                    <input
                                      name="year"
                                      type="number"
                                      defaultValue={batch.year}
                                      required
                                      min={2000}
                                      max={2100}
                                      className={`mt-1.5 ${fieldClass}`}
                                    />
                                  </label>
                                  <label className="block text-sm sm:col-span-2">
                                    Listing
                                    <select
                                      name="isActive"
                                      defaultValue={batch.is_active ? "1" : "0"}
                                      className={`mt-1.5 ${fieldClass}`}
                                    >
                                      <option value="1">
                                        Listed — can appear on enrol when open
                                      </option>
                                      <option value="0">
                                        Retired — hidden from enrol
                                      </option>
                                    </select>
                                  </label>
                                </div>
                                <div className="mt-4 flex flex-wrap gap-2">
                                  <button
                                    type="submit"
                                    disabled={pending}
                                    className="border border-pine px-4 py-2 text-sm font-medium text-pine hover:bg-pine hover:text-mist disabled:opacity-60"
                                  >
                                    Save batch
                                  </button>
                                  {batch.enrolment_open || batch.is_active ? (
                                    <button
                                      type="button"
                                      disabled={pending}
                                      onClick={() =>
                                        setPendingConfirm({
                                          kind: "retireBatch",
                                          batch,
                                        })
                                      }
                                      className="border border-pine/30 px-4 py-2 text-sm font-medium text-pine disabled:opacity-60"
                                    >
                                      Retire
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    disabled={pending}
                                    onClick={() =>
                                      setPendingConfirm({
                                        kind: "deleteBatch",
                                        batch,
                                      })
                                    }
                                    className="border border-red-800/25 px-4 py-2 text-sm text-red-900 disabled:opacity-60"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </form>
                            ) : null}
                          </li>
                        );
                      })
                    )}
                  </ul>
                </section>
              ) : null}

              {panel === "parish" ? (
                <section className="border border-stone bg-white/70 px-4 py-5 sm:px-6">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                    Parish settings
                  </p>
                  <h3 className="mt-1 font-display text-lg text-pine">
                    {selectedParish.name}
                  </h3>
                  {national ? (
                    <form
                      className="mt-5 grid max-w-xl gap-4 sm:grid-cols-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        run(() =>
                          updateParish(new FormData(event.currentTarget)),
                        );
                      }}
                    >
                      <input type="hidden" name="id" value={selectedParish.id} />
                      <label className="block text-sm sm:col-span-2">
                        Display name
                        <input
                          name="name"
                          defaultValue={selectedParish.name}
                          required
                          className={`mt-1.5 ${fieldClass}`}
                        />
                      </label>
                      <label className="block text-sm">
                        Region
                        <input
                          name="region"
                          defaultValue={selectedParish.region ?? ""}
                          placeholder="e.g. London"
                          className={`mt-1.5 ${fieldClass}`}
                        />
                      </label>
                      <label className="block text-sm">
                        Show on enrol form
                        <select
                          name="isActive"
                          defaultValue={selectedParish.is_active ? "1" : "0"}
                          className={`mt-1.5 ${fieldClass}`}
                        >
                          <option value="1">Listed for applicants</option>
                          <option value="0">
                            Retired — hidden from enrol
                          </option>
                        </select>
                      </label>
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button
                          type="submit"
                          disabled={pending}
                          className="border border-pine px-4 py-2.5 text-sm font-medium text-pine hover:bg-pine hover:text-mist disabled:opacity-60"
                        >
                          Save parish
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            setPendingConfirm({
                              kind: "deleteParish",
                              parish: selectedParish,
                              nextParishId:
                                parishes.find(
                                  (p) => p.id !== selectedParish.id,
                                )?.id ?? "",
                            })
                          }
                          className="border border-red-800/30 px-4 py-2.5 text-sm text-red-900 disabled:opacity-60"
                        >
                          Delete parish
                        </button>
                      </div>
                    </form>
                  ) : (
                    <dl className="mt-5 max-w-md divide-y divide-stone border-y border-stone">
                      {[
                        ["Display name", selectedParish.name],
                        ["Region", selectedParish.region || "—"],
                        [
                          "On enrol form",
                          selectedParish.is_active
                            ? "Listed for applicants"
                            : "Retired from enrol",
                        ],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          className="grid gap-1 py-3.5 sm:grid-cols-[8rem_1fr]"
                        >
                          <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
                            {label}
                          </dt>
                          <dd className="text-sm text-ink">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>

      {pendingConfirm ? (
        <ParishConfirmDialog
          confirm={pendingConfirm}
          busy={pending}
          busyLabel={busyLabel}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={confirmPendingAction}
        />
      ) : null}
    </div>
  );
}
