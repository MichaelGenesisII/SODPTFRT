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
  commitAlumniImport,
  previewAlumniImport,
  type AlumniActionResult,
} from "@/app/admin/alumni/actions";
import { AlumniListRow } from "@/components/admin/alumni-portrait-card";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  ALUMNI_PAGE_SIZE,
  alumniListQuery,
  parseAlumniListQuery,
} from "@/lib/admin/alumni-desk";
import {
  SHEET_COHORT_HINTS,
  type AlumniImportPreview,
  type AlumniLegacyPerson,
  type AlumniPortalFilter,
} from "@/lib/alumni/types";
import type { Cohort } from "@/lib/cohorts";
import { DeskPagination } from "@/lib/ui/desk-pagination";

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50";

type DeskTab = "register" | "import";

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
  const busy = pending || Boolean(busyLabel);

  const parsed = parseAlumniListQuery(searchParams.toString());

  const [tab, setTab] = useState<DeskTab>("register");
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState(parsed.query);
  const [batchYear, setBatchYear] = useState<number | null>(parsed.batchYear);
  const [portal, setPortal] = useState<AlumniPortalFilter>(parsed.portal);
  const [page, setPage] = useState(parsed.page);

  const [preview, setPreview] = useState<AlumniImportPreview | null>(null);
  const [cohortBySheet, setCohortBySheet] = useState<
    Record<string, string | null>
  >({});
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryDebounceReady = useRef(false);
  const skipInitialFetch = useRef(true);

  useEffect(() => {
    if (!confirmImport) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) setConfirmImport(false);
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [confirmImport, busy]);

  const listQuery = useMemo(
    () => alumniListQuery({ query, batchYear, portal, page }),
    [query, batchYear, portal, page],
  );

  const totalPages = Math.max(1, Math.ceil(total / ALUMNI_PAGE_SIZE));
  const pageStart = (page - 1) * ALUMNI_PAGE_SIZE;
  const rangeFrom = total === 0 ? 0 : pageStart + 1;
  const rangeTo = Math.min(pageStart + ALUMNI_PAGE_SIZE, total);

  useEffect(() => {
    const next = listQuery;
    const current = searchParams.toString();
    const normalizedCurrent = current ? `?${current}` : "";
    if (next !== normalizedCurrent) {
      router.replace(next ? `${pathname}${next}` : pathname, { scroll: false });
    }
  }, [listQuery, pathname, router, searchParams]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function refresh(next?: {
    query?: string;
    batchYear?: number | null;
    portal?: AlumniPortalFilter;
    page?: number;
  }) {
    const q = next?.query ?? query;
    const year = next?.batchYear === undefined ? batchYear : next.batchYear;
    const status = next?.portal ?? portal;
    const pageNum = next?.page ?? page;
    setBusyLabel("Searching…");
    startTransition(async () => {
      try {
        const result = await onSearch({
          query: q,
          batchYear: year,
          portal: status,
          page: pageNum,
        });
        setRows(result.rows);
        setTotal(result.total);
        setPage(result.page);
      } catch (err) {
        console.error("[alumni] search", err);
        error("Could not search the alumni register.");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false;
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchYear, portal, page]);

  useEffect(() => {
    if (!queryDebounceReady.current) {
      queryDebounceReady.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      setPage(1);
      refresh({ query, page: 1 });
    }, 350);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function run(
    action: () => Promise<AlumniActionResult | { ok: boolean; message: string }>,
    label: string,
    onOk?: () => void,
  ) {
    setBusyLabel(label);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          success(result.message);
          setConfirmImport(false);
          onOk?.();
        } else {
          error(result.message);
        }
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function commitImport() {
    if (!preview || busy) return;
    run(
      async () =>
        commitAlumniImport({
          rows: preview.rows,
          cohortBySheet,
        }),
      "Importing alumni…",
      () => {
        setPreview(null);
        setTab("register");
        refresh({ page: 1 });
      },
    );
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
    setPage(Math.min(totalPages, Math.max(1, next)));
  }

  return (
    <div className="relative space-y-5 sm:space-y-6" aria-busy={busy}>
      <DeskLoaderOverlay
        active={busy && !confirmImport}
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
                <p className="mt-1 text-sm text-ink/60">
                  {total === 0
                    ? "No alumni match."
                    : `Showing ${rangeFrom}–${rangeTo} of ${total}`}
                  {batchYear ? ` · batch ${batchYear}` : ""}
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_8rem_9.5rem] lg:w-auto lg:min-w-[32rem]">
                <label className="block text-sm">
                  <span className="sr-only">Search</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search name, centre, ID, email…"
                    disabled={busy}
                    className={fieldClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="sr-only">Batch year</span>
                  <select
                    value={batchYear ?? ""}
                    disabled={busy}
                    onChange={(e) => {
                      const next = e.target.value
                        ? Number(e.target.value)
                        : null;
                      setBatchYear(next);
                      setPage(1);
                    }}
                    className={fieldClass}
                  >
                    <option value="">All years</option>
                    {batchYears.map((year) => (
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
                    disabled={busy}
                    onChange={(e) => {
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

          <section className="border border-stone bg-mist/30">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone px-3 py-2.5 text-sm text-ink/55 sm:px-4 sm:py-3">
              <p>
                {total === 0
                  ? "No alumni match."
                  : `${total} in register`}
              </p>
              <div className="flex items-center gap-3">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
                  View only — open a row to manage portal access
                </p>
                <button
                  type="button"
                  onClick={() => setTab("import")}
                  className="text-xs font-medium text-pine underline decoration-pine/25 underline-offset-2"
                >
                  Import
                </button>
              </div>
            </div>

            <div className="hidden border-b border-stone bg-white/50 px-4 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/45 md:grid md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_5rem_7rem_5rem_2rem] md:gap-3">
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
                    setQuery("");
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
              This writes the previewed people into the alumni register
              {preview.skipped.length
                ? ` (${preview.skipped.length} preview note${
                    preview.skipped.length === 1 ? "" : "s"
                  } will not be imported)`
                : ""}
              . You can still assign portal emails afterward.
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
    </div>
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
