"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  clearTeacherPaid,
  exportPayPeriodCsv,
  markTeacherPaid,
} from "@/app/finance/periods/actions";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { useToast } from "@/components/ui/toast";
import {
  formatGbp,
  monthPeriodKey,
  type PayPeriodTeacherTotal,
} from "@/lib/finance/types";

type Report = {
  periodKey: string;
  label: string;
  teachers: PayPeriodTeacherTotal[];
  sessionCount: number;
  grossGbp: number;
};

function shiftPeriod(periodKey: string, delta: number): string {
  const [y, m] = periodKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return monthPeriodKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

export function FinancePeriodsWorkspace({ report }: { report: Report }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  function goPeriod(key: string) {
    router.push(`/finance/periods?period=${encodeURIComponent(key)}`);
  }

  function downloadCsv() {
    startTransition(async () => {
      const result = await exportPayPeriodCsv(report.periodKey);
      if (!result.ok || !result.csv) {
        error(result.message, "Export");
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename || `teacher-pay-${report.periodKey}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      success("CSV downloaded.", "Export");
    });
  }

  return (
    <div className="relative space-y-8">
      <DeskLoaderOverlay active={pending} label="Working…" />

      <section className="relative overflow-hidden border border-stone/80 bg-white/55 px-5 py-6 sm:px-6">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.14),_transparent_55%)]"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
              Pay period
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.6rem,5vw,2.3rem)] tracking-[-0.02em] text-pine">
              {report.label}
            </h1>
            <p className="mt-2 text-sm text-ink/60">
              {report.sessionCount} delivered session
              {report.sessionCount === 1 ? "" : "s"} ·{" "}
              {formatGbp(report.grossGbp)} gross
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => goPeriod(shiftPeriod(report.periodKey, -1))}
              className="border border-pine/25 px-3 py-2.5 text-sm font-medium text-pine hover:border-pine"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => goPeriod(shiftPeriod(report.periodKey, 1))}
              className="border border-pine/25 px-3 py-2.5 text-sm font-medium text-pine hover:border-pine"
            >
              Next
            </button>
            <button
              type="button"
              onClick={downloadCsv}
              className="bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
            >
              Download CSV
            </button>
          </div>
        </div>
      </section>

      {report.teachers.length === 0 ? (
        <div className="border border-dashed border-stone bg-white/40 px-5 py-12 text-center">
          <p className="font-display text-lg text-pine">
            No delivered sessions in this period
          </p>
          <p className="mt-2 text-sm text-ink/55">
            Confirmations from teachers or the desk appear here once marked
            delivered or covered.
          </p>
          <Link
            href="/finance/rates"
            className="mt-5 inline-flex text-sm font-medium text-pine underline decoration-pine/25 underline-offset-2"
          >
            Review rates
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {report.teachers.map((teacher) => {
            const open = expanded === teacher.teacherId;
            const paid = Boolean(teacher.markedPaidAt);
            return (
              <li
                key={teacher.teacherId}
                className="border border-stone/80 bg-white/55"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(open ? null : teacher.teacherId)
                    }
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-medium text-ink">{teacher.teacherName}</p>
                    <p className="mt-1 text-sm text-ink/55">
                      {teacher.sessionCount} session
                      {teacher.sessionCount === 1 ? "" : "s"} ·{" "}
                      {formatGbp(teacher.grossGbp)}
                      {teacher.ratesUsed.length > 1
                        ? ` · rates: ${teacher.ratesUsed.join(", ")}`
                        : teacher.ratesUsed[0]
                          ? ` · ${teacher.ratesUsed[0]}`
                          : ""}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-ink/40">
                      {paid ? "Marked paid" : "Open"}
                      {paid && teacher.markedPaidAt
                        ? ` · ${teacher.markedPaidAt.slice(0, 10)}`
                        : ""}
                    </p>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {paid ? (
                      <button
                        type="button"
                        onClick={() => {
                          const form = new FormData();
                          form.set("periodKey", report.periodKey);
                          form.set("teacherId", teacher.teacherId);
                          startTransition(async () => {
                            const result = await clearTeacherPaid(form);
                            if (!result.ok) {
                              error(result.message, "Periods");
                              return;
                            }
                            success(result.message, "Periods");
                            router.refresh();
                          });
                        }}
                        className="border border-pine/25 px-3 py-2 text-sm font-medium text-pine hover:border-pine"
                      >
                        Clear paid
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          const form = new FormData();
                          form.set("periodKey", report.periodKey);
                          form.set("teacherId", teacher.teacherId);
                          startTransition(async () => {
                            const result = await markTeacherPaid(form);
                            if (!result.ok) {
                              error(result.message, "Periods");
                              return;
                            }
                            success(result.message, "Periods");
                            router.refresh();
                          });
                        }}
                        className="bg-pine px-3 py-2 text-sm font-medium text-mist hover:bg-celadon"
                      >
                        Mark paid
                      </button>
                    )}
                  </div>
                </div>
                {open ? (
                  <ul className="border-t border-stone/70 bg-mist/30 px-4 py-3 sm:px-5">
                    {teacher.sessions.map((session) => (
                      <li
                        key={session.deliveryId}
                        className="flex flex-wrap justify-between gap-2 border-b border-stone/40 py-2.5 text-sm last:border-0"
                      >
                        <span className="min-w-0">
                          <span className="block font-medium text-ink">
                            {session.classTitle}
                          </span>
                          <span className="text-ink/55">
                            {session.scheduledStart.slice(0, 10)} ·{" "}
                            {session.status}
                          </span>
                        </span>
                        <span className="tabular-nums text-pine">
                          {formatGbp(session.rateAmountGbp)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
