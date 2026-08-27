"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
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
  "w-full min-w-0 border border-stone bg-white/70 px-3 py-2 text-sm outline-none focus:border-pine disabled:opacity-50";

type DeskTab = "register" | "import";
type MobileSurface = "directory" | "workspace";

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

function examAverage(person: AlumniLegacyPerson): number | null {
  const scored = person.exams.filter((e) => e.percent != null);
  if (!scored.length) return null;
  return (
    Math.round(
      (scored.reduce((sum, e) => sum + Number(e.percent), 0) / scored.length) *
        10,
    ) / 10
  );
}

function sessionsPresent(person: AlumniLegacyPerson): {
  present: number;
  total: number;
} {
  const total = person.sessions.length;
  const present = person.sessions.filter((s) => s.present).length;
  return { present, total };
}

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

  const [tab, setTab] = useState<DeskTab>("register");
  const [mobileSurface, setMobileSurface] =
    useState<MobileSurface>("directory");

  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [batchYear, setBatchYear] = useState<number | null>(null);
  const [portal, setPortal] = useState<AlumniPortalFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(
    initialRows[0]?.id ?? null,
  );
  const [emailDraft, setEmailDraft] = useState("");
  const [sendMail, setSendMail] = useState(true);

  const [preview, setPreview] = useState<AlumniImportPreview | null>(null);
  const [cohortBySheet, setCohortBySheet] = useState<
    Record<string, string | null>
  >({});
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryDebounceReady = useRef(false);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) ?? null,
    [rows, selectedId],
  );

  useEffect(() => {
    if (selected) setEmailDraft(selected.email ?? "");
  }, [selected?.id, selected?.email]);

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
        setSelectedId((prev) => {
          if (prev && result.rows.some((r) => r.id === prev)) return prev;
          return result.rows[0]?.id ?? null;
        });
      } catch (err) {
        console.error("[alumni] search", err);
        error("Could not search the alumni register.");
      } finally {
        setBusyLabel(null);
      }
    });
  }

  useEffect(() => {
    if (!queryDebounceReady.current) {
      queryDebounceReady.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      refresh({ query });
    }, 350);
    return () => window.clearTimeout(handle);
    // Intentionally debounce query only; year/portal refresh immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

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

  function openPerson(person: AlumniLegacyPerson) {
    setSelectedId(person.id);
    setMobileSurface("workspace");
  }

  const directoryClass =
    mobileSurface === "directory" ? "block" : "hidden lg:block";
  const workspaceClass =
    mobileSurface === "workspace" ? "block" : "hidden lg:block";

  const avg = selected ? examAverage(selected) : null;
  const attendance = selected ? sessionsPresent(selected) : null;

  return (
    <div className="relative space-y-5 sm:space-y-6" aria-busy={busy}>
      <DeskLoaderOverlay active={busy} label={busyLabel ?? "Working…"} />

      <section className="grid grid-cols-3 gap-px border border-stone bg-stone">
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
          onClearPreview={() => setPreview(null)}
          onCommit={() => {
            if (!preview) return;
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
                refresh();
              },
            );
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="border border-stone bg-mist/40 px-3 py-3 sm:px-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                  Graduating lists
                </p>
                <p className="mt-1 text-sm text-ink/60">
                  Showing {rows.length} of {total}
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
                      refresh({ batchYear: next });
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
                      const next = e.target.value as AlumniPortalFilter;
                      setPortal(next);
                      refresh({ portal: next });
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

          <div className="grid gap-3 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
            <aside
              className={`${directoryClass} border border-stone bg-mist/50`}
            >
              <div className="flex items-center justify-between gap-2 border-b border-stone px-3 py-2.5 text-sm text-ink/55 sm:px-4">
                <p>
                  {rows.length === 0
                    ? "No matches"
                    : `${rows.length} in view`}
                </p>
                <button
                  type="button"
                  onClick={() => setTab("import")}
                  className="text-xs font-medium text-pine underline decoration-pine/25 underline-offset-2"
                >
                  Import
                </button>
              </div>
              <ul className="max-h-[min(62vh,36rem)] divide-y divide-stone overflow-y-auto lg:max-h-[min(70vh,40rem)]">
                {rows.length === 0 ? (
                  <li className="px-4 py-12 text-center text-sm text-ink/50">
                    No alumni match. Import a batch workbook or clear filters.
                  </li>
                ) : (
                  rows.map((person) => (
                    <li key={person.id}>
                      <AlumniPortraitCard
                        person={person}
                        selected={person.id === selectedId}
                        onSelect={() => openPerson(person)}
                      />
                    </li>
                  ))
                )}
              </ul>
            </aside>

            <section
              className={`${workspaceClass} relative min-h-[18rem] border border-stone bg-mist`}
            >
              {selected ? (
                <div className="flex h-full flex-col">
                  <header className="border-b border-stone px-4 py-4 sm:px-6 sm:py-5">
                    <button
                      type="button"
                      onClick={() => setMobileSurface("directory")}
                      className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-pine lg:hidden"
                    >
                      <span aria-hidden>←</span> Register
                    </button>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.65rem] font-medium uppercase tracking-[0.16em] text-celadon">
                          {selected.batch_label}
                          {selected.centre ? ` · ${selected.centre}` : ""}
                        </p>
                        <h2 className="mt-1 font-display text-[clamp(1.4rem,4vw,2rem)] tracking-[-0.02em] text-pine">
                          {selected.display_name}
                        </h2>
                        <p className="mt-1.5 break-all text-sm text-ink/55">
                          {selected.email ?? "No email on file yet"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={`border px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] ${
                            selected.activated_user_id
                              ? "border-celadon/40 bg-celadon/10 text-pine"
                              : "border-pine/25 text-pine"
                          }`}
                        >
                          {selected.activated_user_id
                            ? "Portal ready"
                            : "Needs email"}
                        </span>
                        {selected.tuition_covered ||
                        selected.tuition_paid_gbp > 0 ? (
                          <span className="border border-stone px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/55">
                            {selected.tuition_covered
                              ? "Tuition covered"
                              : `£${Number(selected.tuition_paid_gbp).toFixed(0)} tuition`}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2 border border-stone/80 bg-white/40">
                      <MiniMetric
                        label="Exam avg"
                        value={avg != null ? `${avg}%` : "—"}
                      />
                      <MiniMetric
                        label="Sessions"
                        value={
                          attendance && attendance.total
                            ? `${attendance.present}/${attendance.total}`
                            : "—"
                        }
                      />
                      <MiniMetric
                        label="Batch"
                        value={String(selected.batch_year)}
                      />
                    </div>
                  </header>

                  <div className="grid flex-1 gap-0 lg:grid-cols-2">
                    <div className="space-y-5 border-b border-stone px-4 py-5 sm:px-6 lg:border-b-0 lg:border-r">
                      <DetailSection title="Contact & placement">
                        <InfoRow label="Mobile" value={selected.mobile} />
                        <InfoRow label="Address" value={selected.address_text} />
                        <InfoRow
                          label="Student ID"
                          value={
                            selected.student_id || selected.legacy_ref
                          }
                          mono
                        />
                        <InfoRow label="Centre" value={selected.centre} />
                        <InfoRow
                          label="Source"
                          value={
                            selected.source_file
                              ? `${selected.source_file}${
                                  selected.source_sheet
                                    ? ` · ${selected.source_sheet}`
                                    : ""
                                }`
                              : null
                          }
                        />
                      </DetailSection>

                      <DetailSection title="Fees & notes">
                        <InfoRow
                          label="Tuition"
                          value={
                            selected.tuition_covered
                              ? selected.tuition_note || "Covered"
                              : selected.tuition_paid_gbp > 0
                                ? `£${Number(selected.tuition_paid_gbp).toFixed(2)}`
                                : selected.tuition_note
                          }
                        />
                        <InfoRow
                          label="Graduation"
                          value={
                            selected.graduation_paid_gbp > 0
                              ? `£${Number(selected.graduation_paid_gbp).toFixed(2)}`
                              : selected.certificate_note
                          }
                        />
                        <InfoRow
                          label="Manuals"
                          value={selected.manuals_sent ? "Sent" : "Not marked"}
                        />
                        <InfoRow label="Comments" value={selected.comments} />
                      </DetailSection>
                    </div>

                    <div className="space-y-5 px-4 py-5 sm:px-6">
                      <DetailSection title="Exam marks">
                        {selected.exams.some((e) => e.percent != null) ? (
                          <ul className="space-y-2">
                            {selected.exams
                              .filter((e) => e.percent != null)
                              .map((exam) => {
                                const pct = Number(exam.percent);
                                const passed = pct >= 50;
                                return (
                                  <li key={exam.label} className="space-y-1">
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                      <span className="min-w-0 truncate text-ink/75">
                                        {exam.label}
                                      </span>
                                      <span
                                        className={`shrink-0 text-[0.65rem] font-medium uppercase tracking-[0.1em] ${
                                          passed ? "text-celadon" : "text-ink/45"
                                        }`}
                                      >
                                        {pct}% · {passed ? "Pass" : "Below"}
                                      </span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden bg-stone/60">
                                      <div
                                        className={`h-full ${
                                          passed ? "bg-celadon" : "bg-pine/40"
                                        }`}
                                        style={{
                                          width: `${Math.min(100, pct)}%`,
                                        }}
                                      />
                                    </div>
                                  </li>
                                );
                              })}
                          </ul>
                        ) : (
                          <p className="text-sm text-ink/45">
                            No exam marks in this import row.
                          </p>
                        )}
                      </DetailSection>

                      {selected.sessions.length ? (
                        <DetailSection title="Attendance">
                          <div className="flex flex-wrap gap-1.5">
                            {selected.sessions.map((session, i) => (
                              <span
                                key={`${session.label}-${i}`}
                                title={session.label}
                                className={`flex size-7 items-center justify-center text-[0.65rem] font-medium ${
                                  session.present
                                    ? "bg-celadon/20 text-pine"
                                    : "bg-stone/50 text-ink/35"
                                }`}
                              >
                                {session.present ? "Y" : "N"}
                              </span>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-ink/45">
                            {attendance?.present}/{attendance?.total} present
                            from the batch sheet
                          </p>
                        </DetailSection>
                      ) : null}

                      <div className="border border-stone bg-white/50 px-4 py-4">
                        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
                          Portal access
                        </p>
                        {selected.activated_user_id ? (
                          <div className="mt-3 space-y-3">
                            <p className="text-sm leading-relaxed text-ink/65">
                              Ready for{" "}
                              <span className="break-all font-medium text-pine">
                                {selected.email}
                              </span>
                              . They sign in via Alumni login.
                            </p>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                run(
                                  () =>
                                    upgradeAlumniToStudent(
                                      selected.activated_user_id!,
                                    ),
                                  "Upgrading to student…",
                                  () => refresh(),
                                )
                              }
                              className="inline-flex min-h-[2.5rem] w-full items-center justify-center border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine hover:border-pine disabled:opacity-50"
                            >
                              {busy && busyLabel?.startsWith("Upgrading") ? (
                                <DeskLoader label={busyLabel} />
                              ) : (
                                "Upgrade to student portal"
                              )}
                            </button>
                          </div>
                        ) : (
                          <form
                            className="mt-3 space-y-3"
                            onSubmit={(e: FormEvent) => {
                              e.preventDefault();
                              run(
                                () =>
                                  assignAlumniEmail({
                                    legacyId: selected.id,
                                    email: emailDraft,
                                    sendAccessEmail: sendMail,
                                  }),
                                "Assigning email…",
                                () => refresh(),
                              );
                            }}
                          >
                            <label className="block text-sm">
                              Email for portal access
                              <input
                                type="email"
                                required
                                value={emailDraft}
                                onChange={(e) => setEmailDraft(e.target.value)}
                                placeholder="alumni@example.com"
                                disabled={busy}
                                className={`mt-1 ${fieldClass}`}
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
                              type="submit"
                              disabled={busy || !emailDraft.trim()}
                              className="inline-flex min-h-[2.5rem] w-full items-center justify-center bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-pine/90 disabled:opacity-50"
                            >
                              {busy && busyLabel?.startsWith("Assigning") ? (
                                <DeskLoader label={busyLabel} tone="mist" />
                              ) : (
                                "Save email & open portal"
                              )}
                            </button>
                            <p className="text-xs leading-relaxed text-ink/50">
                              Batch sheets often have no email. Assign one here
                              when the alumnus is ready to sign in.
                            </p>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[18rem] flex-col items-center justify-center px-6 py-12 text-center">
                  <p className="font-display text-xl text-pine">
                    Select someone
                  </p>
                  <p className="mt-2 max-w-sm text-sm text-ink/55">
                    Open a name from the register to review marks, attendance,
                    and portal access.
                  </p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2.5">
      <p className="text-[0.58rem] uppercase tracking-[0.12em] text-ink/40">
        {label}
      </p>
      <p className="mt-0.5 font-display text-lg tabular-nums text-pine">
        {value}
      </p>
    </div>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="border-b border-stone pb-2 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
        {title}
      </p>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="grid gap-0.5 sm:grid-cols-[7rem_1fr] sm:gap-3">
      <dt className="text-[0.65rem] font-medium uppercase tracking-[0.12em] text-ink/40">
        {label}
      </dt>
      <dd
        className={`break-words text-sm text-ink/80 ${
          mono ? "font-mono text-[0.8rem]" : ""
        }`}
      >
        {value}
      </dd>
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
          one on their portrait.
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
