"use client";

import { useMemo, useState, useTransition } from "react";
import {
  commitAlumniImport,
  previewAlumniImport,
  type AlumniActionResult,
} from "@/app/admin/alumni/actions";
import { upgradeAlumniToStudent } from "@/app/admin/students/actions";
import { DeskLoader, DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import { studentFullName, type AdminStudentRecord } from "@/lib/admin/students";
import { SHEET_COHORT_HINTS, type AlumniImportPreview } from "@/lib/alumni/types";
import type { Cohort } from "@/lib/cohorts";
import { MANUALS_STATUS_LABELS } from "@/lib/student/account";

const fieldClass =
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine";

type AlumniManagerProps = {
  alumni: AdminStudentRecord[];
  cohorts: Cohort[];
};

export function AlumniManager({ alumni, cohorts }: AlumniManagerProps) {
  const { success, error, info } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const busy = pending || Boolean(busyLabel);
  const [preview, setPreview] = useState<AlumniImportPreview | null>(null);
  const [cohortBySheet, setCohortBySheet] = useState<
    Record<string, string | null>
  >({});
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return alumni;
    return alumni.filter((row) => {
      const hay = [
        studentFullName(row),
        row.email,
        row.enrolment?.legacy_app_com_no,
        row.enrolment?.cohort_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [alumni, query]);

  function run(
    action: () => Promise<
      AlumniActionResult | { ok: boolean; message: string }
    >,
    label: string,
  ) {
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
          `Found ${result.preview.rows.length} valid rows (${result.preview.skipped.length} skipped in preview).`,
          "Import preview",
        );
      } finally {
        setBusyLabel(null);
      }
    });
  }

  return (
    <div className="relative space-y-8" aria-busy={busy}>
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />
      <section className="border border-stone/80 bg-white/50 p-5">
        <h2 className="font-display text-xl text-pine">
          Import legacy spreadsheet
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink/60">
          Upload the Excel workbook (~526 rows). Invalid or duplicate emails are
          skipped with a report. Alumni sign in via forgot password — no
          temporary passwords are emailed on import.
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
              {preview.rows.length} rows ready · {preview.skipped.length}{" "}
              skipped in file
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
                  Skipped rows ({preview.skipped.length})
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
                )
              }
              className="inline-flex min-h-[2.5rem] min-w-[10rem] items-center justify-center border border-pine bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-pine/90 disabled:opacity-50"
            >
              {busy && busyLabel?.startsWith("Importing") ? (
                <DeskLoader label={busyLabel} tone="mist" />
              ) : (
                `Import ${preview.rows.length} alumni`
              )}
            </button>
          </div>
        ) : null}
      </section>

      <section className="border border-stone/80 bg-white/50 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-pine">Alumni directory</h2>
            <p className="mt-1 text-sm text-ink/60">
              {alumni.length} imported alumni awaiting re-entry or tuition
              completion.
            </p>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, legacy ref…"
            disabled={busy}
            className={`max-w-xs ${fieldClass} disabled:opacity-50`}
          />
        </div>

        <ul className="mt-4 divide-y divide-stone/60">
          {filtered.map((row) => {
            const tuition = row.fees.find((f) => f.fee_type === "tuition");
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-pine">{studentFullName(row)}</p>
                  <p className="text-ink/60">{row.email}</p>
                  <p className="text-xs text-ink/45">
                    {row.enrolment?.cohort_name ?? "No cohort"} · Manuals:{" "}
                    {MANUALS_STATUS_LABELS[row.manuals_status ?? "not_sent"]} ·
                    Tuition £{tuition?.amount_paid_gbp ?? 0} / £
                    {tuition?.amount_due_gbp ?? 300}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => upgradeAlumniToStudent(row.id),
                      "Upgrading to student…",
                    )
                  }
                  className="inline-flex min-h-[2rem] min-w-[8.5rem] items-center justify-center border border-pine/25 px-3 py-2 text-xs font-medium text-pine hover:border-pine disabled:opacity-50"
                >
                  {busy && busyLabel?.startsWith("Upgrading") ? (
                    <DeskLoader label={busyLabel} />
                  ) : (
                    "Upgrade to student"
                  )}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 ? (
            <li className="py-6 text-sm text-ink/50">No alumni yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
