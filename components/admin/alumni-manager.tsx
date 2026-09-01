"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  bulkDeleteLegacyAlumni,
  bulkOpenAlumniPortal,
  bulkSetLegacyAlumniCohort,
  bulkSetLegacyManualsSent,
  bulkUpgradeAlumniToStudent,
  commitAlumniImport,
  listLegacyAlumniIds,
  previewAlumniImport,
  type AlumniActionResult,
} from "@/app/admin/alumni/actions";
import { AlumniListRow } from "@/components/admin/alumni-portrait-card";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useDebouncedValue } from "@/lib/ui/use-debounced-value";
import { useToast } from "@/components/ui/toast";
import {
  ALUMNI_PAGE_SIZE,
  alumniListQueriesEqual,
  alumniListQuery,
  parseAlumniListQuery,
} from "@/lib/admin/alumni-desk";
import {
  SHEET_COHORT_HINTS,
  type AlumniImportPreview,
  type AlumniImportResult,
  type AlumniLegacyPerson,
  type AlumniPortalFilter,
} from "@/lib/alumni/types";
import type { Cohort } from "@/lib/cohorts";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50";

type DeskTab = "register" | "import";

type ImportMetrics = Pick<
  AlumniImportResult,
  "imported" | "updated" | "skipped" | "matchedExisting" | "previewTotal" | "message"
>;

type BulkConfirm =
  | { kind: "delete" }
  | { kind: "cohort"; cohortId: string | null }
  | { kind: "manuals" }
  | { kind: "portal"; sendMail: boolean }
  | { kind: "upgrade" };

function downloadAlumniCsv(rows: AlumniLegacyPerson[], filename: string) {
  const header = [
    "name",
    "email",
    "batch_year",
    "batch_label",
    "centre",
    "student_id",
    "portal_ready",
    "tuition_paid",
    "manuals_sent",
    "cohort",
  ];
  const lines = [
    header.join(","),
    ...rows.map((person) => {
      const cells = [
        person.display_name,
        person.email ?? "",
        person.batch_year,
        person.batch_label,
        person.centre ?? "",
        person.student_id ?? "",
        person.activated_user_id ? "yes" : "no",
        person.tuition_covered
          ? "covered"
          : person.tuition_paid_gbp > 0
            ? String(person.tuition_paid_gbp)
            : "",
        person.manuals_sent ? "yes" : "no",
        person.cohort_label ?? "",
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

type AlumniManagerProps = {
  initialRows: AlumniLegacyPerson[];
  initialTotal: number;
  batchYears: number[];
  stats: {
    total: number;
    awaitingEmail: number;
    portalReady: number;
  };
  cohorts: Cohort[];
  onSearch: (input: {
    query: string;
    batchYear: number | null;
    portal: AlumniPortalFilter;
    page?: number;
  }) => Promise<{
    rows: AlumniLegacyPerson[];
    total: number;
    page: number;
    pageSize: number;
  }>;
};

export function AlumniManager({
  initialRows,
  initialTotal,
  batchYears,
  stats,
  cohorts,
  onSearch,
}: AlumniManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { success, error, info } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [importMetrics, setImportMetrics] = useState<ImportMetrics | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingConfirm, setPendingConfirm] = useState<BulkConfirm | null>(
    null,
  );
  const [bulkCohortId, setBulkCohortId] = useState<string>("");
  const [bulkSendMail, setBulkSendMail] = useState(true);
  const [searching, setSearching] = useState(false);
  const [listPending, startListTransition] = useTransition();
  const registerLoading = searching || listPending;
  const deskBusy = Boolean(busyLabel);
  const busy = pending || deskBusy;
  const searchRequestId = useRef(0);

  const parsed = parseAlumniListQuery(searchParams.toString());

  const [tab, setTab] = useState<DeskTab>("register");
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [queryInput, setQueryInput] = useState(parsed.query);
  const debouncedQuery = useDebouncedValue(queryInput, 450);
  const [batchYear, setBatchYear] = useState<number | null>(parsed.batchYear);
  const [portal, setPortal] = useState<AlumniPortalFilter>(parsed.portal);
  const [page, setPage] = useState(parsed.page);

  const [preview, setPreview] = useState<AlumniImportPreview | null>(null);
  const [cohortBySheet, setCohortBySheet] = useState<
    Record<string, string | null>
  >({});
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const skipInitialFetch = useRef(true);
  const skipInitialDebouncedSearch = useRef(true);

  useEffect(() => {
    if (!confirmImport && !importMetrics) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        setConfirmImport(false);
        setImportMetrics(null);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [confirmImport, importMetrics, busy]);

  const selectedPeople = useMemo(
    () => rows.filter((person) => selected.has(person.id)),
    [rows, selected],
  );

  const pageAllSelected =
    rows.length > 0 && rows.every((person) => selected.has(person.id));
  const pageSomeSelected =
    rows.some((person) => selected.has(person.id)) && !pageAllSelected;

  const yearOptions = useMemo(() => {
    const years = new Set(batchYears);
    if (batchYear != null && Number.isFinite(batchYear)) {
      years.add(batchYear);
    }
    return [...years].sort((a, b) => b - a);
  }, [batchYears, batchYear]);

  useEffect(() => {
    setSelected(new Set());
  }, [debouncedQuery, batchYear, portal, page]);

  const listQuery = useMemo(
    () => alumniListQuery({ query: debouncedQuery, batchYear, portal, page }),
    [debouncedQuery, batchYear, portal, page],
  );

  const totalPages = Math.max(1, Math.ceil(total / ALUMNI_PAGE_SIZE));
  const pageStart = (page - 1) * ALUMNI_PAGE_SIZE;
  const rangeFrom = total === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + ALUMNI_PAGE_SIZE, total);

  useEffect(() => {
    const next = listQuery;
    const current = searchParams.toString();
    const normalizedCurrent = current ? `?${current}` : "";
    if (!alumniListQueriesEqual(next, normalizedCurrent)) {
      router.replace(next ? `${pathname}${next}` : pathname, { scroll: false });
    }
  }, [listQuery, pathname, router, searchParams]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const fromUrl = parseAlumniListQuery(searchParams.toString());
    setPage(fromUrl.page);
    setBatchYear(fromUrl.batchYear);
    setPortal(fromUrl.portal);
    setQueryInput(fromUrl.query);
  }, [searchParams]);

  function refreshList(next?: {
    query?: string;
    batchYear?: number | null;
    portal?: AlumniPortalFilter;
    page?: number;
  }) {
    const q = next?.query ?? debouncedQuery;
    const year = next?.batchYear === undefined ? batchYear : next.batchYear;
    const status = next?.portal ?? portal;
    const pageNum = next?.page ?? page;
    const requestId = ++searchRequestId.current;
    setSearching(true);
    startListTransition(async () => {
      try {
        const result = await onSearch({
          query: q,
          batchYear: year,
          portal: status,
          page: pageNum,
        });
        if (requestId !== searchRequestId.current) return;
        setRows(result.rows);
        setTotal(result.total);
        setPage(result.page);
      } catch (err) {
        if (requestId !== searchRequestId.current) return;
        console.error("[alumni] search", err);
        error("Could not search the alumni register.");
      } finally {
        if (requestId === searchRequestId.current) {
          setSearching(false);
        }
      }
    });
  }

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    refreshList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchYear, portal, page]);

  useEffect(() => {
    if (skipInitialDebouncedSearch.current) {
      skipInitialDebouncedSearch.current = false;
      return;
    }
    setPage(1);
    refreshList({ query: debouncedQuery, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  function commitImport() {
    if (!preview || busy) return;
    setBusyLabel("Importing alumni…");
    startTransition(async () => {
      try {
        const result = await commitAlumniImport({
          rows: preview.rows,
          cohortBySheet,
        });
        if (!result.ok) {
          error(result.message);
          return;
        }
        setConfirmImport(false);
        setPreview(null);
        setImportMetrics({
          imported: result.imported,
          updated: result.updated,
          skipped: result.skipped,
          matchedExisting: result.matchedExisting,
          previewTotal: result.previewTotal,
          message: result.message,
        });
        setTab("register");
        refreshList({ page: 1 });
        router.refresh();
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function parseFile(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    setBusyLabel("Parsing spreadsheet…");
    startTransition(async () => {
      try {
        const result = await previewAlumniImport(formData);
        if (!result.ok || !("preview" in result)) {
          error(result.message);
          return;
        }
        setPreview(result.preview);
        const initial: Record<string, string | null> = {};
        for (const sheet of result.preview.sheetCounts) {
          const hint = SHEET_COHORT_HINTS[sheet.sheet.trim().toLowerCase()];
          const match = hint
            ? cohorts.find((c) =>
                c.name.toLowerCase().includes(hint.toLowerCase()),
              )
            : null;
          initial[sheet.sheet] = match?.id ?? null;
        }
        setCohortBySheet(initial);
        setTab("import");
        info(
          `${result.preview.rows.length} people ready · ${result.preview.skipped.length} notes`,
          "Import preview",
        );
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function alumniDetailHref(personId: string) {
    const from = listQuery.startsWith("?") ? listQuery.slice(1) : "";
    return from
      ? `/admin/alumni/${personId}?from=${encodeURIComponent(from)}`
      : `/admin/alumni/${personId}`;
  }

  function goToPage(next: number) {
    setSearching(true);
    setPage(Math.min(totalPages, Math.max(1, next)));
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
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
        for (const person of rows) next.delete(person.id);
      } else {
        for (const person of rows) next.add(person.id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function selectAllMatching() {
    setBusyLabel("Selecting matches…");
    startTransition(async () => {
      try {
        const result = await listLegacyAlumniIds({
          query: debouncedQuery,
          batchYear,
          portal,
        });
        if (!result.ok || !("ids" in result)) {
          error("message" in result ? result.message : "Could not select all.");
          return;
        }
        setSelected(new Set(result.ids));
        if (result.ids.length < result.total) {
          info(
            `Selected ${result.ids.length} of ${result.total} (desk limit). Narrow filters to select more.`,
            "Alumni",
          );
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function runBulk(
    action: () => Promise<AlumniActionResult>,
    label: string,
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          success(result.message, "Alumni");
          setPendingConfirm(null);
          clearSelection();
          refreshList();
          router.refresh();
        } else {
          error(result.message, "Alumni");
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function confirmBulk() {
    if (!pendingConfirm || busy) return;
    const ids = [...selected];
    switch (pendingConfirm.kind) {
      case "delete":
        runBulk(() => bulkDeleteLegacyAlumni(ids), "Removing rows…");
        return;
      case "cohort":
        runBulk(
          () =>
            bulkSetLegacyAlumniCohort(
              ids,
              pendingConfirm.cohortId || null,
            ),
          "Updating cohort…",
        );
        return;
      case "manuals":
        runBulk(() => bulkSetLegacyManualsSent(ids, true), "Updating manuals…");
        return;
      case "portal":
        runBulk(
          () =>
            bulkOpenAlumniPortal(ids, pendingConfirm.sendMail),
          "Opening portal access…",
        );
        return;
      case "upgrade":
        runBulk(
          () => bulkUpgradeAlumniToStudent(ids),
          "Upgrading to student…",
        );
        return;
    }
  }

  const confirmCopy = ((): {
    eyebrow: string;
    title: string;
    body: ReactNode;
    confirmLabel: string;
    destructive?: boolean;
  } | null => {
    if (!pendingConfirm) return null;
    const count = selected.size;
    const who = `${count} alumn${count === 1 ? "us" : "i"}`;
    switch (pendingConfirm.kind) {
      case "delete":
        return {
          eyebrow: "Remove from register",
          title: `Delete ${who}?`,
          body: (
            <>
              Removes legacy register rows only. People with portal access are
              skipped — remove their portal seat from the student file first if
              needed.
            </>
          ),
          confirmLabel: count === 1 ? "Delete row" : "Delete rows",
          destructive: true,
        };
      case "cohort":
        return {
          eyebrow: "Link cohort",
          title: pendingConfirm.cohortId
            ? `Set cohort on ${who}?`
            : `Clear cohort on ${who}?`,
          body: (
            <>
              Updates the programme cohort label on the selected register rows.
            </>
          ),
          confirmLabel: "Update cohort",
        };
      case "manuals":
        return {
          eyebrow: "Manuals",
          title: `Mark manuals sent for ${who}?`,
          body: <>Updates the manuals flag on the selected register rows.</>,
          confirmLabel: "Mark sent",
        };
      case "portal":
        return {
          eyebrow: "Portal access",
          title: `Open alumni portal for ${who}?`,
          body: (
            <>
              Only rows with an email and no portal yet are processed. Others
              are skipped.
              {pendingConfirm.sendMail
                ? " Access details are emailed where possible."
                : " No access emails will be sent."}
            </>
          ),
          confirmLabel: pendingConfirm.sendMail
            ? "Open & email access"
            : "Open portal",
        };
      case "upgrade":
        return {
          eyebrow: "Upgrade seat",
          title: `Upgrade ${who} to student portal?`,
          body: (
            <>
              Only rows that already have portal access are upgraded. Others are
              skipped.
            </>
          ),
          confirmLabel: "Upgrade",
        };
    }
  })();

  return (
    <div className="relative space-y-5 sm:space-y-6" aria-busy={busy || registerLoading}>
      <DeskLoaderOverlay
        active={deskBusy && !confirmImport && !importMetrics && !pendingConfirm}
        label={busyLabel ?? "Working…"}
      />

      <section
        data-tour="alumni-stats"
        className="grid grid-cols-3 gap-px border border-stone bg-stone"
      >
        {[
          { label: "In register", value: stats.total },
          { label: "Needs email", value: stats.awaitingEmail },
          { label: "Portal ready", value: stats.portalReady },
        ].map((stat) => (
          <div key={stat.label} className="bg-mist/90 px-3 py-3.5 sm:px-5 sm:py-4">
            <p className="truncate text-[0.58rem] font-medium uppercase tracking-[0.12em] text-ink/40 sm:text-[0.65rem] sm:tracking-[0.16em]">
              {stat.label}
            </p>
            <p className="mt-1 font-display text-2xl tabular-nums text-pine sm:text-3xl">
              {stat.value}
            </p>
          </div>
        ))}
      </section>

      <nav
        data-tour="alumni-tabs"
        className="flex gap-1 border-b border-stone"
        aria-label="Alumni desk sections"
      >
        {(
          [
            { id: "register" as const, label: "Register" },
            { id: "import" as const, label: "Import batches" },
          ] as const
        ).map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "text-pine" : "text-ink/45 hover:text-ink/70"
              }`}
            >
              {item.label}
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

      {tab === "import" ? (
        <ImportPane
          busy={busy}
          busyLabel={busyLabel}
          preview={preview}
          cohorts={cohorts}
          cohortBySheet={cohortBySheet}
          dragOver={dragOver}
          fileRef={fileRef}
          fieldClass={fieldClass}
          onDragOver={setDragOver}
          onFile={parseFile}
          onCohortChange={(sheet, value) =>
            setCohortBySheet((prev) => ({ ...prev, [sheet]: value }))
          }
          onClearPreview={() => {
            setPreview(null);
            setConfirmImport(false);
          }}
          onCommit={() => {
            if (!preview || preview.rows.length === 0) return;
            setConfirmImport(true);
          }}
        />
      ) : (
        <div className="space-y-3">
          <div
            data-tour="alumni-register"
            className="border border-stone bg-mist/40 px-3 py-3 sm:px-4"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Graduating lists
                </p>
                <div className="mt-1 text-sm text-ink/60">
                  {registerLoading ? (
                    <DeskLoader label="Updating register…" />
                  ) : total === 0 ? (
                    "No alumni match."
                  ) : (
                    <>
                      Showing {rangeFrom}–{rangeTo} of {total}
                      {batchYear ? ` · batch ${batchYear}` : ""}
                    </>
                  )}
                </div>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_9.5rem] lg:w-auto lg:min-w-[32rem]">
                <label className="block text-sm">
                  <span className="sr-only">Search</span>
                  <input
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    placeholder="Search name, centre, ID, email…"
                    disabled={deskBusy}
                    className={fieldClass}
                  />
                  {registerLoading ? (
                    <span className="mt-1 block text-xs text-ink/45">
                      Updating…
                    </span>
                  ) : null}
                </label>
                <label className="block text-sm">
                  <span className="sr-only">Batch year</span>
                  <select
                    value={batchYear ?? ""}
                    disabled={deskBusy || registerLoading}
                    onChange={(e) => {
                      const next = e.target.value
                        ? Number(e.target.value)
                        : null;
                      setSearching(true);
                      setBatchYear(next);
                      setPage(1);
                    }}
                    className={fieldClass}
                  >
                    <option value="">All years</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="sr-only">Portal status</span>
                  <select
                    value={portal}
                    disabled={deskBusy || registerLoading}
                    onChange={(e) => {
                      setSearching(true);
                      setPortal(e.target.value as AlumniPortalFilter);
                      setPage(1);
                    }}
                    className={fieldClass}
                  >
                    <option value="all">All statuses</option>
                    <option value="awaiting_email">Needs email</option>
                    <option value="portal_ready">Portal ready</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <section className="relative border border-stone bg-mist/30">
            <DeskLoaderOverlay
              active={registerLoading}
              label="Updating register…"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone px-3 py-2.5 text-sm text-ink/55 sm:px-4 sm:py-3">
              <p>
                {total === 0
                  ? "No alumni match."
                  : `${total} in register`}
              </p>
              <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                Select rows for bulk actions · open a name for the full file
              </p>
            </div>

            {total > 0 ? (
              <DeskPagination
                variant="header"
                page={page}
                totalItems={total}
                pageSize={ALUMNI_PAGE_SIZE}
                onPageChange={goToPage}
                className="px-3 sm:px-4"
                itemLabel="alumni"
              />
            ) : null}

            {selected.size > 0 ? (
              <section className="sticky top-0 z-20 space-y-3 border-b border-pine/25 bg-mist/95 px-3 py-3 shadow-[0_8px_24px_-16px_rgba(20,53,44,0.45)] backdrop-blur-sm sm:px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-ink/70">
                    <span className="font-medium text-pine">{selected.size}</span>{" "}
                    selected
                    {selected.size < total ? (
                      <>
                        {" "}
                        ·{" "}
                        <button
                          type="button"
                          onClick={selectAllMatching}
                          disabled={busy}
                          className="font-medium text-pine underline decoration-pine/30 underline-offset-2 disabled:opacity-50"
                        >
                          Select all {total} matching
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
                      Programme cohort
                    </span>
                    <span className="mt-1 flex gap-1">
                      <select
                        value={bulkCohortId}
                        disabled={busy}
                        onChange={(e) => setBulkCohortId(e.target.value)}
                        className="min-w-0 flex-1 border border-stone bg-white/80 px-2 py-2 text-sm outline-none focus:border-pine disabled:opacity-50"
                      >
                        <option value="">Clear cohort</option>
                        {cohorts.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setPendingConfirm({
                            kind: "cohort",
                            cohortId: bulkCohortId || null,
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
                      onClick={() => setPendingConfirm({ kind: "manuals" })}
                      className="border border-stone px-3 py-2 text-sm text-ink/75 hover:border-pine hover:text-pine disabled:opacity-50"
                    >
                      Manuals sent
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setPendingConfirm({
                          kind: "portal",
                          sendMail: bulkSendMail,
                        })
                      }
                      className="border border-stone px-3 py-2 text-sm text-ink/75 hover:border-pine hover:text-pine disabled:opacity-50"
                    >
                      Open portal
                    </button>
                    <label className="inline-flex items-center gap-1.5 border border-stone px-2 py-2 text-xs text-ink/60">
                      <input
                        type="checkbox"
                        checked={bulkSendMail}
                        disabled={busy}
                        onChange={(e) => setBulkSendMail(e.target.checked)}
                        className="accent-pine"
                      />
                      Email access
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingConfirm({ kind: "upgrade" })}
                      className="border border-stone px-3 py-2 text-sm text-ink/75 hover:border-pine hover:text-pine disabled:opacity-50"
                    >
                      Upgrade to student
                    </button>
                    <button
                      type="button"
                      disabled={busy || selectedPeople.length === 0}
                      onClick={() => {
                        downloadAlumniCsv(
                          selectedPeople,
                          `sod-alumni-${new Date().toISOString().slice(0, 10)}.csv`,
                        );
                        success(
                          `Exported ${selectedPeople.length} row${selectedPeople.length === 1 ? "" : "s"}.`,
                          "Alumni",
                        );
                      }}
                      className="border border-stone px-3 py-2 text-sm text-ink/75 hover:border-pine hover:text-pine disabled:opacity-50"
                    >
                      Export CSV
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPendingConfirm({ kind: "delete" })}
                      className="inline-flex items-center justify-center border border-red-800/35 px-2.5 py-2 text-red-900/85 hover:border-red-800/60 hover:bg-red-50 disabled:opacity-50"
                      aria-label={`Delete ${selected.size} selected`}
                      title="Delete selected"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            <div className="hidden border-b border-stone bg-white/50 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45 md:grid md:grid-cols-[2rem_minmax(0,1.5fr)_minmax(0,1fr)_5rem_7rem_5rem_2rem] md:items-center md:gap-3">
              <label className="flex items-center justify-center">
                <span className="sr-only">Select page</span>
                <input
                  type="checkbox"
                  checked={pageAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = pageSomeSelected;
                  }}
                  onChange={togglePage}
                  disabled={busy || rows.length === 0}
                  className="size-4 accent-pine"
                />
              </label>
              <span>Alumnus</span>
              <span>Centre / batch</span>
              <span>Year</span>
              <span>Portal</span>
              <span>Tuition</span>
              <span />
            </div>

            <ul className="divide-y divide-stone">
              {rows.map((person) => (
                <AlumniListRow
                  key={person.id}
                  person={person}
                  href={alumniDetailHref(person.id)}
                  checked={selected.has(person.id)}
                  onToggle={() => toggleOne(person.id)}
                  disabled={busy}
                />
              ))}
            </ul>

            {rows.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <p className="font-display text-lg text-pine">No matches</p>
                <p className="mt-2 text-sm text-ink/55">
                  Try clearing filters or import a batch workbook.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQueryInput("");
                    setBatchYear(null);
                    setPortal("all");
                    setPage(1);
                  }}
                  className="mt-4 border border-pine/30 px-4 py-2 text-sm font-medium text-pine hover:bg-pine hover:text-mist"
                >
                  Reset filters
                </button>
              </div>
            ) : null}

            <DeskPagination
              page={page}
              totalItems={total}
              pageSize={ALUMNI_PAGE_SIZE}
              onPageChange={goToPage}
              className="px-3 pb-2.5 sm:px-4 sm:pb-3"
              itemLabel="alumni"
            />
          </section>
        </div>
      )}

      {confirmImport && preview ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => !busy && setConfirmImport(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="alumni-import-confirm-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <DeskLoaderOverlay
              active={busy}
              label={busyLabel ?? "Working…"}
            />
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Import batches
            </p>
            <h3
              id="alumni-import-confirm-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              Save {preview.rows.length} to the register?
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-ink/70">
              Existing people (same email, student ID, or name + centre in the
              batch year) are updated — not duplicated
              {preview.skipped.length
                ? ` · ${preview.skipped.length} preview note${
                    preview.skipped.length === 1 ? "" : "s"
                  } will not be imported`
                : ""}
              .
            </p>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmImport(false)}
                className="border border-pine/25 px-4 py-2.5 text-sm font-medium text-pine transition-colors hover:border-pine disabled:opacity-60"
              >
                Back to preview
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={commitImport}
                className="inline-flex min-h-[2.5rem] min-w-[9rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist transition-colors hover:bg-celadon disabled:opacity-60"
              >
                {busy && busyLabel?.startsWith("Importing") ? (
                  <DeskLoader label="Importing…" tone="mist" />
                ) : (
                  "Save to register"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {importMetrics ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          role="presentation"
          onClick={() => setImportMetrics(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="alumni-import-metrics-title"
            className="relative w-full max-w-md border border-stone bg-mist p-6 text-ink shadow-[0_16px_48px_rgba(20,53,44,0.2)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              Import complete
            </p>
            <h3
              id="alumni-import-metrics-title"
              className="mt-3 font-display text-2xl tracking-[-0.02em] text-pine"
            >
              Register updated
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink/65">
              {importMetrics.message}
            </p>
            <dl className="mt-5 grid grid-cols-2 gap-2">
              {[
                {
                  label: "In this file",
                  value: importMetrics.previewTotal,
                },
                {
                  label: "New",
                  value: importMetrics.imported,
                },
                {
                  label: "Updated",
                  value: importMetrics.updated,
                },
                {
                  label: "Skipped",
                  value: importMetrics.skipped.length,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="border border-stone bg-white/60 px-3 py-2.5"
                >
                  <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45">
                    {item.label}
                  </dt>
                  <dd className="mt-1 font-display text-2xl tabular-nums text-pine">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            {importMetrics.skipped.length > 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-ink/55">
                Skipped rows could not be written (already matched awkwardly or
                blocked). Check the register before re-importing.
              </p>
            ) : (
              <p className="mt-3 text-xs leading-relaxed text-ink/55">
                No duplicate rows were added. Matches were merged into existing
                register people.
              </p>
            )}
            <div className="mt-7 flex justify-end">
              <button
                type="button"
                onClick={() => setImportMetrics(null)}
                className="bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <DeskConfirmModal
        open={Boolean(pendingConfirm && confirmCopy)}
        onClose={() => !busy && setPendingConfirm(null)}
        onConfirm={confirmBulk}
        eyebrow={confirmCopy?.eyebrow}
        title={confirmCopy?.title ?? ""}
        body={confirmCopy?.body}
        confirmLabel={confirmCopy?.confirmLabel ?? "Confirm"}
        destructive={confirmCopy?.destructive}
        busy={busy}
        busyLabel={busyLabel ?? "Working…"}
      />
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

function ImportPane({
  busy,
  busyLabel,
  preview,
  cohorts,
  cohortBySheet,
  dragOver,
  fileRef,
  fieldClass,
  onDragOver,
  onFile,
  onCohortChange,
  onClearPreview,
  onCommit,
}: {
  busy: boolean;
  busyLabel: string | null;
  preview: AlumniImportPreview | null;
  cohorts: Cohort[];
  cohortBySheet: Record<string, string | null>;
  dragOver: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  fieldClass: string;
  onDragOver: (value: boolean) => void;
  onFile: (file: File) => void;
  onCohortChange: (sheet: string, value: string | null) => void;
  onClearPreview: () => void;
  onCommit: () => void;
}) {
  return (
    <section className="border border-stone bg-mist">
      <div className="border-b border-stone px-4 py-4 sm:px-6 sm:py-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
          Batch workbooks
        </p>
        <h2 className="mt-1.5 font-display text-[clamp(1.35rem,4vw,1.85rem)] tracking-[-0.02em] text-pine">
          Import graduating lists
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/60">
          Drop a <span className="font-medium text-ink/80">Students – Batch</span>{" "}
          Excel file. Names without emails stay in the register until you assign
          one on their alumni file page.
        </p>
      </div>

      <div className="grid gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)]">
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              onDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              onDragOver(true);
            }}
            onDragLeave={() => onDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              onDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) onFile(file);
            }}
            onClick={() => fileRef.current?.click()}
            className={`flex min-h-[10rem] cursor-pointer flex-col items-center justify-center border border-dashed px-4 py-8 text-center transition-colors ${
              dragOver
                ? "border-pine bg-pine/5"
                : "border-stone bg-white/50 hover:border-pine/40"
            } ${busy ? "pointer-events-none opacity-60" : ""}`}
          >
            {busy && busyLabel?.startsWith("Parsing") ? (
              <DeskLoader label={busyLabel} />
            ) : (
              <>
                <p className="text-sm font-medium text-pine">
                  Drop Excel or browse
                </p>
                <p className="mt-1 text-[0.7rem] text-ink/45">
                  .xlsx · Batch 2012–2023 style sheets
                </p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFile(file);
                e.target.value = "";
              }}
            />
          </div>

          {preview ? (
            <div className="space-y-4 border border-stone bg-white/50 px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-pine">
                    {preview.rows.length} people ready
                    {preview.batchLabel ? ` · ${preview.batchLabel}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-ink/50">
                    {preview.skipped.length} preview notes ·{" "}
                    {preview.sheetCounts.length} sheet
                    {preview.sheetCounts.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClearPreview}
                  className="text-xs font-medium text-ink/50 hover:text-pine"
                >
                  Clear
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <PreviewStat
                  label="Ready"
                  value={String(preview.rows.length)}
                  tone="pine"
                />
                <PreviewStat
                  label="Notes"
                  value={String(preview.skipped.length)}
                  tone="muted"
                />
                <PreviewStat
                  label="Sheets"
                  value={String(preview.sheetCounts.length)}
                  tone="muted"
                />
              </div>

              {preview.sheetCounts.map((sheet) => (
                <label key={sheet.sheet} className="block text-sm">
                  Cohort for “{sheet.sheet}” ({sheet.valid} rows)
                  <select
                    value={cohortBySheet[sheet.sheet] ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      onCohortChange(sheet.sheet, e.target.value || null)
                    }
                    className={`mt-1 ${fieldClass}`}
                  >
                    <option value="">No cohort (assign later)</option>
                    {cohorts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}

              {preview.skipped.length ? (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-pine">
                    Preview notes ({preview.skipped.length})
                  </summary>
                  <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto text-xs text-ink/65">
                    {preview.skipped.slice(0, 40).map((row, i) => (
                      <li key={`${row.sheet}-${row.rowNumber}-${i}`}>
                        {row.sheet} row {row.rowNumber}: {row.detail}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <button
                type="button"
                disabled={busy || preview.rows.length === 0}
                onClick={onCommit}
                className="inline-flex min-h-[2.5rem] w-full items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-pine/90 disabled:opacity-50 sm:w-auto"
              >
                {busy && busyLabel?.startsWith("Importing") ? (
                  <DeskLoader label={busyLabel} tone="mist" />
                ) : (
                  `Save ${preview.rows.length} to register`
                )}
              </button>
            </div>
          ) : null}
        </div>

        <aside className="border border-stone bg-white/40 px-4 py-4 text-sm text-ink/60">
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            What we read
          </p>
          <ul className="mt-3 space-y-2 leading-relaxed">
            <li>Name, centre, student ID</li>
            <li>Email when present (optional)</li>
            <li>Tuition / graduation notes</li>
            <li>Session Y/N columns</li>
            <li>Exam % columns</li>
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-ink/45">
            Files like Batch 2012–2021 and 22/23 session sheets are supported.
            Nothing is stored until you confirm the preview.
          </p>
        </aside>
      </div>
    </section>
  );
}

function PreviewStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "pine" | "muted";
}) {
  return (
    <div className="border border-stone/80 bg-mist/60 px-3 py-2.5">
      <p className="text-[0.58rem] uppercase tracking-[0.12em] text-ink/40">
        {label}
      </p>
      <p
        className={`mt-0.5 font-display text-xl tabular-nums ${
          tone === "pine" ? "text-pine" : "text-ink/70"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
