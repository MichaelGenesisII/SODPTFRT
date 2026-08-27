"use client";

import { useMemo, useState } from "react";
import type { EvaluationAttemptRow } from "@/app/admin/evaluation/actions";
import { passedExam } from "@/lib/exams/score";
import { ATTEMPT_STATUS_META, type ExamAttemptStatus } from "@/lib/exams/types";

type AudienceFilter = "all" | "student" | "open";

/**
 * Performance board: student year papers + open/visitor sittings.
 * Complements the grading Queue with searchable score tables.
 */
export function ExamResultsBoard({
  attempts,
}: {
  attempts: EvaluationAttemptRow[];
}) {
  const [audience, setAudience] = useState<AudienceFilter>("all");
  const [query, setQuery] = useState("");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [examFilter, setExamFilter] = useState<string>("all");

  const examOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of attempts) {
      map.set(row.exam_id, row.exam_title);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [attempts]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    for (const row of attempts) {
      if (row.exam_year_index != null) years.add(row.exam_year_index);
    }
    return [...years].sort((a, b) => a - b);
  }, [attempts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return attempts.filter((row) => {
      if (audience !== "all" && row.exam_audience !== audience) return false;
      if (examFilter !== "all" && row.exam_id !== examFilter) return false;
      if (yearFilter !== "all") {
        const y = Number(yearFilter);
        if (row.exam_year_index !== y) return false;
      }
      if (!q) return true;
      return (
        row.display_name.toLowerCase().includes(q) ||
        row.display_email.toLowerCase().includes(q) ||
        row.exam_title.toLowerCase().includes(q)
      );
    });
  }, [attempts, audience, examFilter, yearFilter, query]);

  const stats = useMemo(() => {
    const studentRows = attempts.filter((r) => r.exam_audience === "student");
    const openRows = attempts.filter((r) => r.exam_audience === "open");
    const withScore = filtered.filter((r) => r.percent != null);
    const passCount = withScore.filter((r) =>
      passedExam(Number(r.percent), r.pass_percent),
    ).length;
    return {
      student: studentRows.length,
      open: openRows.length,
      shown: filtered.length,
      passRate:
        withScore.length > 0
          ? Math.round((passCount / withScore.length) * 100)
          : null,
    };
  }, [attempts, filtered]);

  return (
    <div className="animate-panel-in space-y-4">
      <section className="border border-stone bg-mist/40 px-4 py-4 sm:px-5">
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
          Performance
        </p>
        <h2 className="mt-1 font-display text-xl text-pine sm:text-2xl">
          Results board
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink/65">
          See how each sitting scored — enrolled students by year paper, and
          visitors on open links. Use Queue when you need to mark written
          answers.
        </p>
      </section>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Stat label="Student sittings" value={String(stats.student)} />
        <Stat label="Visitor sittings" value={String(stats.open)} />
        <Stat label="Showing" value={String(stats.shown)} />
        <Stat
          label="Pass rate (shown)"
          value={stats.passRate != null ? `${stats.passRate}%` : "—"}
        />
      </section>

      <div className="flex flex-col gap-2 border border-stone bg-mist/30 p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block min-w-[8rem] flex-1 text-xs text-ink/55">
          Search
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, email, or exam…"
            className="mt-1 w-full border border-stone bg-white/80 px-3 py-2 text-sm outline-none focus:border-pine"
          />
        </label>
        <label className="block text-xs text-ink/55">
          Who
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as AudienceFilter)}
            className="mt-1 block w-full border border-stone bg-white/80 px-3 py-2 text-sm outline-none focus:border-pine sm:w-40"
          >
            <option value="all">Everyone</option>
            <option value="student">Students only</option>
            <option value="open">Visitors only</option>
          </select>
        </label>
        <label className="block min-w-[10rem] flex-1 text-xs text-ink/55">
          Exam
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            className="mt-1 w-full border border-stone bg-white/80 px-3 py-2 text-sm outline-none focus:border-pine"
          >
            <option value="all">All exams</option>
            {examOptions.map(([id, title]) => (
              <option key={id} value={id}>
                {title}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-ink/55">
          Year
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="mt-1 block w-full border border-stone bg-white/80 px-3 py-2 text-sm outline-none focus:border-pine sm:w-28"
          >
            <option value="all">All</option>
            {yearOptions.map((y) => (
              <option key={y} value={String(y)}>
                Year {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="border border-dashed border-stone px-4 py-10 text-center text-sm text-ink/50">
          No sittings match these filters yet.
        </p>
      ) : (
        <div className="overflow-x-auto border border-stone">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-stone bg-mist/60 text-[0.65rem] uppercase tracking-[0.1em] text-ink/45">
              <tr>
                <th className="px-3 py-2.5 font-medium">Candidate</th>
                <th className="px-3 py-2.5 font-medium">Exam</th>
                <th className="px-3 py-2.5 font-medium">Year</th>
                <th className="px-3 py-2.5 font-medium">Type</th>
                <th className="px-3 py-2.5 font-medium">Score</th>
                <th className="px-3 py-2.5 font-medium">Result</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone bg-white/40">
              {filtered.map((row) => {
                const pct = row.percent != null ? Number(row.percent) : null;
                const passed =
                  pct != null ? passedExam(pct, row.pass_percent) : null;
                const statusLabel =
                  ATTEMPT_STATUS_META[row.status as ExamAttemptStatus]?.label ??
                  row.status;
                return (
                  <tr key={row.id} className="align-top hover:bg-mist/40">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-pine">{row.display_name}</p>
                      {row.display_email ? (
                        <p className="text-xs text-ink/45">{row.display_email}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-ink/75">{row.exam_title}</td>
                    <td className="px-3 py-2.5 tabular-nums text-ink/60">
                      {row.exam_year_index != null
                        ? `Y${row.exam_year_index}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-ink/60">
                      {row.exam_audience === "open" ? "Visitor" : "Student"}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-ink/80">
                      {pct != null ? `${pct}%` : "—"}
                      {row.max_score > 0 ? (
                        <span className="block text-[0.7rem] text-ink/40">
                          {row.total_score}/{row.max_score}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      {passed == null ? (
                        <span className="text-ink/40">—</span>
                      ) : (
                        <span
                          className={
                            passed
                              ? "font-medium text-celadon"
                              : "font-medium text-red-800"
                          }
                        >
                          {passed ? "Pass" : "Fail"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink/60">{statusLabel}</td>
                    <td className="px-3 py-2.5 text-xs text-ink/45">
                      {row.submitted_at
                        ? new Date(row.submitted_at).toLocaleString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-stone bg-mist/50 px-3 py-3">
      <p className="text-[0.6rem] uppercase tracking-[0.1em] text-ink/40">
        {label}
      </p>
      <p className="mt-1 font-display text-xl tabular-nums text-pine">{value}</p>
    </div>
  );
}
