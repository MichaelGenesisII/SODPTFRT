"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ATTEMPT_STATUS_META,
  type Exam,
  type ExamAttemptStatus,
} from "@/lib/exams/types";

type StudentExamRow = Exam & { attempt_status?: string | null };

type ExamsTab = "available" | "in_progress" | "done";

function examWindowLabel(exam: Exam): string {
  const now = Date.now();
  if (exam.status === "closed") return "Closed";
  if (exam.opens_at && new Date(exam.opens_at).getTime() > now) {
    return "Opens soon";
  }
  if (exam.closes_at && new Date(exam.closes_at).getTime() < now) {
    return "Window ended";
  }
  if (exam.status === "published") return "Open";
  return exam.status;
}

function attemptLabel(status: string | null | undefined): string {
  if (!status) return "Not started";
  return (
    ATTEMPT_STATUS_META[status as ExamAttemptStatus]?.label ?? status
  );
}

function bucketFor(exam: StudentExamRow): ExamsTab {
  const status = exam.attempt_status;
  if (status === "in_progress") return "in_progress";
  if (status && status !== "in_progress") return "done";
  return "available";
}

export function StudentExamsClient({ exams }: { exams: StudentExamRow[] }) {
  const available = exams.filter((e) => bucketFor(e) === "available");
  const inProgress = exams.filter((e) => bucketFor(e) === "in_progress");
  const done = exams.filter((e) => bucketFor(e) === "done");

  const defaultTab: ExamsTab =
    inProgress.length > 0
      ? "in_progress"
      : available.length > 0
        ? "available"
        : "done";
  const [tab, setTab] = useState<ExamsTab>(defaultTab);
  const [openId, setOpenId] = useState<string | null>(null);

  const tabs: {
    id: ExamsTab;
    label: string;
    hint?: string;
    rows: StudentExamRow[];
  }[] = [
    {
      id: "available",
      label: "Available",
      hint: available.length ? String(available.length) : undefined,
      rows: available,
    },
    {
      id: "in_progress",
      label: "In progress",
      hint: inProgress.length ? String(inProgress.length) : undefined,
      rows: inProgress,
    },
    {
      id: "done",
      label: "Done",
      hint: done.length ? String(done.length) : undefined,
      rows: done,
    },
  ];

  const active = tabs.find((t) => t.id === tab) ?? tabs[0]!;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-3 gap-px border border-stone bg-stone sm:gap-0 sm:bg-mist/50">
        <MiniStat label="Available" value={String(available.length)} />
        <MiniStat label="In progress" value={String(inProgress.length)} />
        <MiniStat label="Done" value={String(done.length)} />
      </div>

      <nav
        className="grid grid-cols-3 border border-stone bg-mist/40 sm:flex sm:gap-1 sm:overflow-x-auto sm:border-0 sm:border-b sm:bg-transparent sm:pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Exams sections"
      >
        {tabs.map((item) => {
          const isActive = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`relative min-h-12 px-1.5 py-3 text-center text-sm font-medium tracking-wide transition-colors sm:min-h-0 sm:shrink-0 sm:px-3 sm:py-2 sm:text-left ${
                isActive
                  ? "bg-mist text-pine sm:bg-transparent"
                  : "text-ink/50 hover:text-ink/80"
              }`}
            >
              <span className="inline-flex flex-wrap items-center justify-center gap-1 sm:justify-start sm:gap-1.5">
                <span className="sm:hidden">
                  {item.id === "in_progress" ? "Active" : item.label}
                </span>
                <span className="hidden sm:inline">{item.label}</span>
                {item.hint ? (
                  <span className="tabular-nums text-[0.65rem] text-ink/40">
                    {item.hint}
                  </span>
                ) : null}
              </span>
              <span
                className={`absolute inset-x-2 bottom-0 h-0.5 bg-celadon transition-opacity ${
                  isActive ? "opacity-100" : "opacity-0"
                }`}
                aria-hidden
              />
            </button>
          );
        })}
      </nav>

      <Panel
        eyebrow="Assessment"
        title={
          tab === "available"
            ? "Ready to sit"
            : tab === "in_progress"
              ? "Continue your sitting"
              : "Submitted & released"
        }
        body={
          tab === "available"
            ? "Open an exam when you are ready — the clock starts on Begin."
            : tab === "in_progress"
              ? "You have an open attempt. Continue before the window closes."
              : "View certificates and status for finished sittings."
        }
      >
        {active.rows.length === 0 ? (
          <Empty>
            {tab === "available"
              ? "No exams waiting for you right now."
              : tab === "in_progress"
                ? "Nothing in progress."
                : "No finished sittings yet."}
          </Empty>
        ) : (
          <ul className="divide-y divide-stone border-y border-stone">
            {active.rows.map((exam) => {
              const open = openId === exam.id;
              const status = exam.attempt_status;
              const cta =
                status === "in_progress"
                  ? "Continue"
                  : status
                    ? "View"
                    : "Open";
              return (
                <li key={exam.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenId((id) => (id === exam.id ? null : exam.id))
                      }
                      aria-expanded={open}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-[0.6rem] uppercase tracking-[0.12em] text-celadon">
                        {examWindowLabel(exam)} · {exam.duration_minutes} min ·
                        pass {exam.pass_percent}%
                      </p>
                      <h3 className="mt-1 break-words font-display text-base text-pine sm:text-lg">
                        {exam.title}
                      </h3>
                      <p className="mt-1 text-xs text-ink/45">
                        {attemptLabel(status)}
                      </p>
                      <p className="mt-1.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-pine/70">
                        {open ? "Hide details" : "Show details"}
                      </p>
                    </button>
                    <Link
                      href={`/student/exams/${exam.slug}`}
                      className="inline-flex min-h-11 w-full shrink-0 items-center justify-center border border-pine/30 px-4 py-2.5 text-sm font-medium text-pine sm:min-h-0 sm:w-auto sm:px-3 sm:py-2"
                    >
                      {cta}
                    </Link>
                  </div>
                  {open ? (
                    <div className="mt-3 border border-stone bg-white/50 px-3 py-3 text-sm text-ink/65">
                      {exam.instructions ? (
                        <p className="whitespace-pre-wrap break-words leading-relaxed">
                          {exam.instructions}
                        </p>
                      ) : (
                        <p className="leading-relaxed text-ink/50">
                          No extra instructions — open the paper when ready.
                        </p>
                      )}
                      <p className="mt-2 text-xs leading-relaxed text-ink/45">
                        {exam.counts_toward_record
                          ? "Counts toward your Records scorecard when released."
                          : "Does not count toward Records."}
                      </p>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-mist/80 px-2 py-3 sm:bg-transparent sm:px-4 sm:py-3">
      <p className="truncate text-[0.58rem] uppercase tracking-[0.08em] text-ink/40 sm:text-[0.6rem] sm:tracking-[0.12em]">
        {label}
      </p>
      <p className="mt-0.5 font-display text-lg tabular-nums text-pine sm:text-xl">
        {value}
      </p>
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
