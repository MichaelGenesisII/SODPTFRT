"use client";

import type { ReactNode } from "react";
import type { ExamAttempt } from "@/lib/exams/types";

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export type ExamResultCertificateProps = {
  title: string;
  candidateName: string;
  candidateEmail?: string;
  church?: string;
  attempt: Pick<
    ExamAttempt,
    "percent" | "total_score" | "max_score" | "submitted_at" | "released_at" | "status"
  >;
  passPercent: number;
  passed: boolean;
  tone?: "pine" | "mist";
  footnote?: string;
  actions?: ReactNode;
};

/** Certificate-style result card for visitors and students. */
export function ExamResultCertificate({
  title,
  candidateName,
  candidateEmail,
  church,
  attempt,
  passPercent,
  passed,
  tone = "pine",
  footnote,
  actions,
}: ExamResultCertificateProps) {
  const percent =
    attempt.percent != null ? Math.round(attempt.percent * 10) / 10 : null;
  const mist = tone === "mist";

  return (
    <article
      className={`relative overflow-hidden border ${
        mist
          ? "border-mist/20 bg-pine text-mist shadow-[0_24px_80px_-28px_rgba(8,22,18,0.9)]"
          : "border-stone bg-mist text-ink shadow-[0_20px_60px_-28px_rgba(20,53,44,0.35)]"
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${
          mist
            ? "bg-[radial-gradient(ellipse_at_top_right,rgba(95_143_122/0.35),transparent_55%),linear-gradient(180deg,transparent_40%,rgb(8_22_18/0.45)_100%)]"
            : "bg-[radial-gradient(ellipse_at_top_right,rgba(95_143_122/0.18),transparent_50%)]"
        }`}
        aria-hidden
      />
      <div
        className={`relative border-b px-6 py-5 sm:px-8 ${
          mist ? "border-mist/15" : "border-stone"
        }`}
      >
        <p
          className={`text-[0.65rem] font-medium uppercase tracking-[0.2em] ${
            mist ? "text-celadon" : "text-celadon"
          }`}
        >
          School of Disciples · Certificate
        </p>
        <h2
          className={`mt-2 font-display text-[clamp(1.65rem,4vw,2.15rem)] tracking-[-0.02em] ${
            mist ? "text-mist" : "text-pine"
          }`}
        >
          {title}
        </h2>
        <p
          className={`mt-3 text-sm ${mist ? "text-mist/65" : "text-ink/60"}`}
        >
          Awarded to{" "}
          <span className={mist ? "text-mist" : "font-medium text-ink"}>
            {candidateName}
          </span>
          {candidateEmail ? (
            <span className={mist ? "text-mist/45" : "text-ink/45"}>
              {" "}
              · {candidateEmail}
            </span>
          ) : null}
          {church ? (
            <span className={mist ? "text-mist/45" : "text-ink/45"}>
              {" "}
              · {church}
            </span>
          ) : null}
        </p>
      </div>

      <div className="relative grid gap-0 sm:grid-cols-2">
        <div
          className={`px-6 py-8 text-center sm:px-8 sm:border-r ${
            mist ? "border-mist/15" : "border-stone"
          }`}
        >
          <p
            className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
              mist ? "text-celadon" : "text-ink/45"
            }`}
          >
            Final score
          </p>
          <p
            className={`mt-2 font-display text-5xl tabular-nums tracking-[-0.03em] ${
              mist ? "text-mist" : "text-pine"
            }`}
          >
            {percent != null ? `${percent}%` : "—"}
          </p>
          <p
            className={`mt-2 text-sm ${mist ? "text-mist/55" : "text-ink/55"}`}
          >
            {attempt.total_score} / {attempt.max_score} points
          </p>
        </div>
        <div className="px-6 py-8 text-center sm:px-8">
          <p
            className={`text-[0.65rem] font-medium uppercase tracking-[0.16em] ${
              mist ? "text-celadon" : "text-ink/45"
            }`}
          >
            Outcome
          </p>
          <p
            className={`mt-2 font-display text-4xl tracking-[-0.02em] ${
              passed
                ? mist
                  ? "text-celadon"
                  : "text-celadon"
                : mist
                  ? "text-[#e8b4a8]"
                  : "text-[#8c3b2f]"
            }`}
          >
            {passed ? "Pass" : "Not yet"}
          </p>
          <p
            className={`mt-2 text-sm ${mist ? "text-mist/55" : "text-ink/55"}`}
          >
            Pass mark {passPercent}%
          </p>
        </div>
      </div>

      <div
        className={`relative flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4 sm:px-8 ${
          mist ? "border-mist/15" : "border-stone"
        }`}
      >
        <p className={`text-xs ${mist ? "text-mist/45" : "text-ink/45"}`}>
          Submitted {formatWhen(attempt.submitted_at)}
          {attempt.released_at
            ? ` · Released ${formatWhen(attempt.released_at)}`
            : ""}
        </p>
        {actions}
      </div>
      {footnote ? (
        <p
          className={`relative border-t px-6 py-3 text-xs leading-relaxed sm:px-8 ${
            mist
              ? "border-mist/15 text-mist/50"
              : "border-stone text-ink/50"
          }`}
        >
          {footnote}
        </p>
      ) : null}
    </article>
  );
}
