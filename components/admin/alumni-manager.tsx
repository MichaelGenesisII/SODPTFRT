"use client";

import { useMemo, useState, useTransition } from "react";
import {
  assignAlumniEmail,
  commitAlumniImport,
  previewAlumniImport,
  type AlumniActionResult,
} from "@/app/admin/alumni/actions";
import { upgradeAlumniToStudent } from "@/app/admin/students/actions";
import { AlumniPortraitCard } from "@/components/admin/alumni-portrait-card";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  SHEET_COHORT_HINTS,
  type AlumniImportPreview,
  type AlumniLegacyPerson,
  type AlumniPortalFilter,
} from "@/lib/alumni/types";
import type { Cohort } from "@/lib/cohorts";

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

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
  }) => Promise<{
    rows: AlumniLegacyPerson[];
    total: number;
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
  const { success, error, info } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);

  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [batchYear, setBatchYear] = useState<number | null>(null);
  const [portal, setPortal] = useState<AlumniPortalFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [sendMail, setSendMail] = useState(true);

  const [preview, setPreview] = useState<AlumniImportPreview | null>(null);
  const [cohortBySheet, setCohortBySheet] = useState<
    Record<string, string | null>
  >({});

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

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
          onOk?.();
        } else error(result.message);
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function refresh(next?: {
    query?: string;
    batchYear?: number | null;
    portal?: AlumniPortalFilter;
  }) {
    const q = next?.query ?? query;
    const year = next?.batchYear === undefined ? batchYear : next.batchYear;
    const status = next?.portal ?? portal;
    setBusyLabel("Searching…");
    startTransition(async () => {
      try {
        const result = await onSearch({
          query: q,
          batchYear: year,
          portal: status,
        });
        setRows(result.rows);
        setTotal(result.total);
      } catch (err) {
        console.error("[alumni] search", err);
        error("Could not search the alumni register.");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  async function onPreview(formData: FormData) {
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
        info(
          `Found ${result.preview.rows.length} people (${result.preview.skipped.length} notes in preview).`,
          "Import preview",
        );
      } finally {
        setBusyLabel(null);
      }
    });
  }

  function openPerson(person: AlumniLegacyPerson) {
    setSelectedId(person.id);
    setEmailDraft(person.email ?? "");
  }

  return (
    <div className="relative space-y-8" aria-busy={busy}>
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "In register", value: stats.total },
          { label: "Awaiting email", value: stats.awaitingEmail },
          { label: "Portal ready", value: stats.portalReady },
        ].map((stat) => (
          <div
            key={stat.label}
            className="border border-stone/80 bg-white/50 px-4 py-4"
          >
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
              {stat.label}
            </p>
            <p className="mt-2 font-display text-3xl text-pine">{stat.value}</p>
          </div>
        ))}
      </section>

      <section className="border border-stone/80 bg-white/50 p-5">
        <h2 className="font-display text-xl text-pine">
          Import graduating lists
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink/60">
          Upload a Batch Excel file. Names without emails are stored in the
          register. Portal login is only possible after you assign an email on a
          portrait below.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onPreview(new FormData(e.currentTarget));
          }}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <label className="block text-sm">
            Excel file
            <input
              type="file"
              name="file"
              accept=".xlsx,.xls"
              disabled={busy}
              className={`mt-1 block ${fieldClass} disabled:opacity-50`}
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-[2.5rem] min-w-[8.5rem] items-center justify-center border border-pine px-4 py-2.5 text-sm font-medium text-pine hover:bg-pine hover:text-mist disabled:opacity-50"
          >
            {busy && busyLabel?.startsWith("Parsing") ? (
              <DeskLoader label={busyLabel} />
            ) : (
              "Preview import"
            )}
          </button>
        </form>

        {preview ? (
          <div className="mt-6 space-y-4 border-t border-stone/60 pt-4">
            <p className="text-sm text-ink/70">
              {preview.rows.length} people ready
              {preview.batchLabel ? ` · ${preview.batchLabel}` : ""} ·{" "}
              {preview.skipped.length} preview notes
            </p>
            {preview.sheetCounts.map((sheet) => (
              <label key={sheet.sheet} className="block max-w-md text-sm">
                Cohort for “{sheet.sheet}” ({sheet.valid} rows)
                <select
                  value={cohortBySheet[sheet.sheet] ?? ""}
                  disabled={busy}
                  onChange={(e) =>
                    setCohortBySheet((prev) => ({
                      ...prev,
                      [sheet.sheet]: e.target.value || null,
                    }))
                  }
                  className={`mt-1 ${fieldClass} disabled:opacity-50`}
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
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-ink/70">
                  {preview.skipped.slice(0, 50).map((row, i) => (
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
              onClick={() =>
                run(
                  async () =>
                    commitAlumniImport({
                      rows: preview.rows,
                      cohortBySheet,
                    }),
                  "Importing alumni…",
                  () => {
                    setPreview(null);
                    refresh();
                  },
                )
              }
              className="inline-flex min-h-[2.5rem] min-w-[10rem] items-center justify-center border border-pine bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-pine/90 disabled:opacity-50"
            >
              {busy && busyLabel?.startsWith("Importing") ? (
                <DeskLoader label={busyLabel} tone="mist" />
              ) : (
                `Save ${preview.rows.length} to register`
              )}
            </button>
          </div>
        ) : null}
      </section>

      <section className="space-y-5">
        <div className="flex flex-col gap-4 border border-stone/80 bg-white/50 p-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-xl text-pine">Alumni portraits</h2>
            <p className="mt-1 text-sm text-ink/60">
              Showing {rows.length} of {total}. Search by name, email, centre,
              or student ID — then assign email to open the alumni portal.
            </p>
          </div>
          <form
            className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end lg:w-auto"
            onSubmit={(e) => {
              e.preventDefault();
              refresh();
            }}
          >
            <label className="block min-w-[14rem] flex-1 text-sm">
              Search
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, email, centre, ID…"
                disabled={busy}
                className={`mt-1 ${fieldClass} disabled:opacity-50`}
              />
            </label>
            <label className="block text-sm">
              Batch
              <select
                value={batchYear ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value ? Number(e.target.value) : null;
                  setBatchYear(next);
                  refresh({ batchYear: next });
                }}
                className={`mt-1 ${fieldClass} disabled:opacity-50`}
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
              Portal
              <select
                value={portal}
                disabled={busy}
                onChange={(e) => {
                  const next = e.target.value as AlumniPortalFilter;
                  setPortal(next);
                  refresh({ portal: next });
                }}
                className={`mt-1 ${fieldClass} disabled:opacity-50`}
              >
                <option value="all">All</option>
                <option value="awaiting_email">Awaiting email</option>
                <option value="portal_ready">Portal ready</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-[2.5rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-50"
            >
              Search
            </button>
          </form>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
            {rows.map((person) => (
              <AlumniPortraitCard
                key={person.id}
                person={person}
                selected={person.id === selectedId}
                onSelect={() => openPerson(person)}
              />
            ))}
            {rows.length === 0 ? (
              <p className="col-span-full border border-dashed border-stone px-4 py-12 text-center text-sm text-ink/50">
                No alumni match this search. Import a batch file or clear
                filters.
              </p>
            ) : null}
          </div>

          <aside className="border border-stone/80 bg-white/60 p-5 xl:sticky xl:top-4 xl:self-start">
            {selected ? (
              <div className="space-y-4">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
                  Selected portrait
                </p>
                <h3 className="font-display text-2xl leading-tight text-pine">
                  {selected.display_name}
                </h3>
                <p className="text-sm text-ink/60">
                  {selected.batch_label}
                  {selected.centre ? ` · ${selected.centre}` : ""}
                </p>

                <dl className="space-y-2 border-y border-stone/70 py-3 text-sm">
                  {[
                    ["Mobile", selected.mobile],
                    ["Address", selected.address_text],
                    ["Student ID", selected.student_id || selected.legacy_ref],
                    [
                      "Tuition",
                      selected.tuition_covered
                        ? selected.tuition_note || "Covered"
                        : selected.tuition_paid_gbp > 0
                          ? `£${Number(selected.tuition_paid_gbp).toFixed(2)}`
                          : null,
                    ],
                    ["Comments", selected.comments || selected.certificate_note],
                  ].map(([label, value]) =>
                    value ? (
                      <div key={String(label)}>
                        <dt className="text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
                          {label}
                        </dt>
                        <dd className="mt-0.5 break-words text-ink/80">
                          {value}
                        </dd>
                      </div>
                    ) : null,
                  )}
                </dl>

                {selected.exams.some((e) => e.percent != null) ? (
                  <div>
                    <p className="text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
                      Exam marks
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-ink/75">
                      {selected.exams
                        .filter((e) => e.percent != null)
                        .map((exam) => (
                          <li
                            key={exam.label}
                            className="flex justify-between gap-3 border-b border-stone/50 py-1"
                          >
                            <span className="min-w-0 truncate">{exam.label}</span>
                            <span className="font-medium text-pine">
                              {exam.percent}%
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}

                {selected.activated_user_id ? (
                  <div className="space-y-3">
                    <p className="border border-pine/20 bg-stone/40 px-3 py-2 text-sm text-ink/75">
                      Portal ready for{" "}
                      <span className="break-all font-medium text-ink">
                        {selected.email}
                      </span>
                      . They sign in at Alumni login (forgot password if needed).
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            upgradeAlumniToStudent(selected.activated_user_id!),
                          "Upgrading to student…",
                          () => refresh(),
                        )
                      }
                      className="inline-flex w-full min-h-[2.5rem] items-center justify-center border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-50"
                    >
                      {busy && busyLabel?.startsWith("Upgrading") ? (
                        <DeskLoader label={busyLabel} />
                      ) : (
                        "Upgrade to student portal"
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="block text-sm">
                      Assign email for portal access
                      <input
                        type="email"
                        value={emailDraft}
                        onChange={(e) => setEmailDraft(e.target.value)}
                        placeholder="alumni@example.com"
                        disabled={busy}
                        className={`mt-1 ${fieldClass} disabled:opacity-50`}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm text-ink/70">
                      <input
                        type="checkbox"
                        checked={sendMail}
                        onChange={(e) => setSendMail(e.target.checked)}
                        disabled={busy}
                      />
                      Email temporary access details
                    </label>
                    <button
                      type="button"
                      disabled={busy || !emailDraft.trim()}
                      onClick={() =>
                        run(
                          () =>
                            assignAlumniEmail({
                              legacyId: selected.id,
                              email: emailDraft,
                              sendAccessEmail: sendMail,
                            }),
                          "Assigning email…",
                          () => {
                            setEmailDraft("");
                            refresh();
                          },
                        )
                      }
                      className="inline-flex w-full min-h-[2.5rem] items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon disabled:opacity-50"
                    >
                      {busy && busyLabel?.startsWith("Assigning") ? (
                        <DeskLoader label={busyLabel} tone="mist" />
                      ) : (
                        "Save email & open portal"
                      )}
                    </button>
                    <p className="text-xs leading-relaxed text-ink/50">
                      Without an email this alumni cannot sign in. Assigning an
                      email creates their alumni portal account.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-10 text-center">
                <p className="font-display text-xl text-pine">Select a portrait</p>
                <p className="mt-2 text-sm text-ink/55">
                  Choose an alumni card to review details and assign an email.
                </p>
              </div>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
