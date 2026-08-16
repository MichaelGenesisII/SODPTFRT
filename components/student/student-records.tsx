"use client";

import { useState, type ReactNode } from "react";
import type { RecordBundle } from "@/lib/exams/records";

type RecordsTab = "overview" | "attendance" | "exams";

export function StudentRecordsClient({ bundle }: { bundle: RecordBundle }) {
  const [tab, setTab] = useState<RecordsTab>("overview");
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  const presentCount = bundle.sessions.filter((s) => s.present).length;
  const passCount = bundle.entries.filter((e) => e.passed).length;
  const { record } = bundle;

  const tabs: { id: RecordsTab; label: string; hint?: string }[] = [
    { id: "overview", label: "Overview" },
    {
      id: "attendance",
      label: "Attendance",
      hint: bundle.sessions.length
        ? String(bundle.sessions.length)
        : undefined,
    },
    {
      id: "exams",
      label: "Exams",
      hint: bundle.entries.length ? String(bundle.entries.length) : undefined,
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-2 gap-px border border-stone bg-stone sm:grid-cols-4 sm:gap-0 sm:bg-mist/50">
        <MiniStat
          label="Exam avg"
          value={bundle.average != null ? `${bundle.average}%` : "—"}
        />
        <MiniStat
          label="Attendance"
          value={bundle.attendance != null ? `${bundle.attendance}%` : "—"}
        />
        <MiniStat
          label="Present"
          value={`${presentCount}/${bundle.sessions.length || 0}`}
        />
        <MiniStat
          label="Passed"
          value={`${passCount}/${bundle.entries.length || 0}`}
        />
      </div>

      <nav
        className="grid grid-cols-3 border border-stone bg-mist/40 sm:flex sm:gap-1 sm:overflow-x-auto sm:border-0 sm:border-b sm:bg-transparent sm:pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Records sections"
      >
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative min-h-12 px-1.5 py-3 text-center text-sm font-medium tracking-wide transition-colors sm:min-h-0 sm:shrink-0 sm:px-3 sm:py-2 sm:text-left ${
                active
                  ? "bg-mist text-pine sm:bg-transparent"
                  : "text-ink/50 hover:text-ink/80"
              }`}
            >
              <span className="inline-flex flex-wrap items-center justify-center gap-1 sm:justify-start sm:gap-1.5">
                {item.label}
                {item.hint ? (
                  <span className="tabular-nums text-[0.65rem] text-ink/40">
                    {item.hint}
                  </span>
                ) : null}
              </span>
              <span
                className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity sm:inset-x-2 ${
                  active ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>

      {tab === "overview" ? (
        <Panel
          eyebrow="Scorecard"
          title="At a glance"
          body="Your released attendance rate and exam average for this enrolment."
        >
          <div className="mb-4 flex items-start gap-4">
            <div className="relative h-[7.5rem] w-24 shrink-0 overflow-hidden border border-pine/25 bg-mist">
              {record.passport_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={record.passport_url}
                  alt="Your passport photograph"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display text-xl tracking-wide text-pine/35">
                  {(record.student_name || "S")
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((p) => p[0]?.toUpperCase() ?? "")
                    .join("") || "S"}
                </div>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-pine/80 px-1 py-0.5 text-center text-[0.55rem] uppercase tracking-[0.12em] text-white/90">
                Passport
              </span>
            </div>
            <div className="min-w-0 pt-0.5">
              <p className="font-display text-xl tracking-[-0.02em] text-pine sm:text-2xl">
                {record.student_name || "Student"}
              </p>
              <p className="mt-1 truncate text-sm text-ink/55">
                {record.student_email}
              </p>
              {!record.passport_url ? (
                <p className="mt-3 text-sm leading-relaxed text-ink/55">
                  Upload your passport photograph from Payments after the
                  application fee is paid — it will appear here on your
                  scorecard.
                </p>
              ) : null}
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-3 border-t border-stone pt-4 sm:grid-cols-2">
            <Meta
              label="Parish"
              value={record.parish_name?.trim() || "—"}
            />
            <Meta
              label="Batch"
              value={
                record.batch_name
                  ? `${record.batch_name}${
                      record.batch_year != null ? ` · ${record.batch_year}` : ""
                    }`
                  : "—"
              }
            />
            <Meta
              label="Enrolled"
              value={formatDate(record.enrolled_at) || "—"}
            />
            <Meta
              label="Completed"
              value={formatDate(record.completed_at) || "In progress"}
            />
          </dl>
          <div className="mt-4 grid grid-cols-2 gap-4 border-t border-stone pt-4 sm:flex sm:flex-wrap sm:gap-8">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
                Exam average
              </p>
              <p className="mt-1 font-display text-2xl tabular-nums text-pine sm:text-3xl">
                {bundle.average != null ? `${bundle.average}%` : "—"}
              </p>
            </div>
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
                Attendance
              </p>
              <p className="mt-1 font-display text-2xl tabular-nums text-pine sm:text-3xl">
                {bundle.attendance != null ? `${bundle.attendance}%` : "—"}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink/45">
            Open Attendance or Exams for the full lists.
          </p>
        </Panel>
      ) : null}

      {tab === "attendance" ? (
        <Panel
          eyebrow="Sessions"
          title="Attendance"
          body="Present and absent marks from classes and desk check-ins."
        >
          {bundle.sessions.length === 0 ? (
            <Empty>No sessions recorded yet.</Empty>
          ) : (
            <ul className="divide-y divide-stone border-y border-stone">
              {bundle.sessions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0 sm:items-center sm:py-2.5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-ink">
                      {s.label || "Session"}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink/40">
                      {formatDate(s.session_date)}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 pt-0.5 text-xs font-medium uppercase tracking-[0.06em] sm:pt-0 sm:text-sm sm:normal-case sm:tracking-normal ${
                      s.present ? "text-celadon" : "text-ink/35"
                    }`}
                  >
                    {s.present ? "Present" : "Absent"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === "exams" ? (
        <Panel
          eyebrow="Released scores"
          title="Exam scores"
          body="Tap a row for source and whether it counts in your average."
        >
          {bundle.entries.length === 0 ? (
            <Empty>No scores yet.</Empty>
          ) : (
            <ul className="divide-y divide-stone border-y border-stone">
              {bundle.entries.map((e) => {
                const open = openEntryId === e.id;
                return (
                  <li key={e.id} className="py-1 first:pt-0 last:pb-0">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenEntryId((id) => (id === e.id ? null : e.id))
                      }
                      aria-expanded={open}
                      className="flex w-full items-start justify-between gap-3 py-3 text-left text-sm sm:items-center sm:py-2.5"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-ink">
                          {e.label}
                        </span>
                        <span className="mt-1 block text-[0.65rem] font-medium uppercase tracking-[0.12em] text-pine/70">
                          {open ? "Hide details" : "Show details"}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
                        <span className="font-medium tabular-nums text-pine">
                          {e.percent}%
                        </span>
                        <span
                          className={`text-[0.65rem] font-medium uppercase tracking-[0.08em] ${
                            e.passed ? "text-celadon" : "text-ink/40"
                          }`}
                        >
                          {e.passed ? "Pass" : "Fail"}
                        </span>
                      </span>
                    </button>
                    {open ? (
                      <div className="mb-2 border border-stone bg-white/50 px-3 py-3 text-xs leading-relaxed text-ink/60 sm:mb-0 sm:mt-2 sm:py-2.5">
                        <p>
                          Source:{" "}
                          {e.source === "exam" ? "Exam release" : "Desk"}
                        </p>
                        <p className="mt-1.5">
                          {e.include_in_total
                            ? "Included in exam average"
                            : "Not included in exam average"}
                        </p>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-mist/80 px-2.5 py-3 sm:bg-transparent sm:px-4 sm:py-3">
      <p className="text-[0.58rem] uppercase tracking-[0.1em] text-ink/40 sm:text-[0.6rem] sm:tracking-[0.12em]">
        {label}
      </p>
      <p className="mt-0.5 font-display text-lg tabular-nums text-pine sm:text-xl">
        {value}
      </p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.65rem] uppercase tracking-[0.12em] text-ink/40">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="animate-panel-in border border-stone bg-mist">
      <div className="border-b border-stone px-4 py-4 sm:px-5 sm:py-5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.16em] text-celadon">
          {eyebrow}
        </p>
        <h2 className="mt-1.5 font-display text-xl text-pine sm:text-2xl">
          {title}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/60">
          {body}
        </p>
      </div>
      <div className="px-3 py-3 sm:px-5 sm:py-4">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="border border-dashed border-stone px-4 py-8 text-center text-sm text-ink/50">
      {children}
    </p>
  );
}
