"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  clearTeacherPaid,
  exportPayPeriodCsv,
  markTeacherPaid,
} from "@/app/finance/periods/actions";
import { prepareTeacherPeriodPayout } from "@/app/finance/payouts/actions";
import { DeskConfirmModal } from "@/components/ui/desk-confirm-modal";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { deskError, deskSuccess } from "@/lib/ui/desk-alert";
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

export function FinancePeriodsWorkspace({
  report,
  periodHref,
  headerAction,
  embedded = false,
}: {
  report: Report;
  /** Build href for another period (defaults to legacy /finance/periods). */
  periodHref?: (periodKey: string) => string;
  /** Optional control shown with period navigation (e.g. Authorisations). */
  headerAction?: ReactNode;
  /** Compact header when nested in the Payments corridor. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [markTarget, setMarkTarget] = useState<PayPeriodTeacherTotal | null>(
    null,
  );
  const [clearTarget, setClearTarget] = useState<PayPeriodTeacherTotal | null>(
    null,
  );
  const [prepareTarget, setPrepareTarget] =
    useState<PayPeriodTeacherTotal | null>(null);

  function hrefFor(key: string) {
    return periodHref
      ? periodHref(key)
      : `/finance/periods?period=${encodeURIComponent(key)}`;
  }

  function goPeriod(key: string) {
    router.push(hrefFor(key));
  }

  function downloadCsv() {
    startTransition(async () => {
      const result = await exportPayPeriodCsv(report.periodKey);
      if (!result.ok || !result.csv) {
        await deskError({ title: "Export failed", text: result.message });
        return;
      }
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename || `teacher-pay-${report.periodKey}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  function confirmMarkPaid() {
    if (!markTarget) return;
    const teacher = markTarget;
    setMarkTarget(null);
    const form = new FormData();
    form.set("periodKey", report.periodKey);
    form.set("teacherId", teacher.teacherId);
    startTransition(async () => {
      const result = await markTeacherPaid(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      router.refresh();
    });
  }

  function confirmClearPaid() {
    if (!clearTarget) return;
    const teacher = clearTarget;
    setClearTarget(null);
    const form = new FormData();
    form.set("periodKey", report.periodKey);
    form.set("teacherId", teacher.teacherId);
    startTransition(async () => {
      const result = await clearTeacherPaid(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      router.refresh();
    });
  }

  function confirmPreparePayout() {
    if (!prepareTarget) return;
    const teacher = prepareTarget;
    setPrepareTarget(null);
    const form = new FormData();
    form.set("periodKey", report.periodKey);
    form.set("teacherId", teacher.teacherId);
    form.set("amountGbp", String(teacher.grossGbp));
    startTransition(async () => {
      const result = await prepareTeacherPeriodPayout(form);
      if (!result.ok) {
        await deskError({ text: result.message });
        return;
      }
      await deskSuccess({ text: result.message });
      if (result.payoutId) {
        router.push(
          `/finance/payments?panel=releases&id=${encodeURIComponent(result.payoutId)}`,
        );
        return;
      }
      router.push("/finance/payments?panel=releases");
    });
  }

  return (
    <div className="relative space-y-8">
      <DeskLoaderOverlay active={pending} label="Working…" />

      <section
        className={`relative overflow-hidden border border-stone/80 bg-white/55 px-5 py-5 sm:px-6 ${
          embedded ? "" : "py-6"
        }`}
      >
        {!embedded ? (
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(95,143,122,0.14),_transparent_55%)]"
            aria-hidden
          />
        ) : null}
        <div className="relative space-y-4">
          {!embedded ? (
            <div className="flex w-full flex-wrap items-center gap-3">
              <p className="shrink-0 text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
                The tally
              </p>
              {headerAction}
            </div>
          ) : headerAction ? (
            <div className="flex w-full flex-wrap items-center justify-end gap-3">
              {headerAction}
            </div>
          ) : null}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h2
                className={`font-display tracking-[-0.02em] text-pine ${
                  embedded
                    ? "text-[clamp(1.35rem,3.5vw,1.85rem)]"
                    : "text-[clamp(1.6rem,5vw,2.3rem)]"
                }`}
              >
                {report.label}
              </h2>
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
                Previous month
              </button>
              <button
                type="button"
                onClick={() => goPeriod(shiftPeriod(report.periodKey, 1))}
                className="border border-pine/25 px-3 py-2.5 text-sm font-medium text-pine hover:border-pine"
              >
                Next month
              </button>
              <button
                type="button"
                onClick={downloadCsv}
                className="bg-pine px-4 py-2.5 text-sm font-medium text-mist hover:bg-celadon"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </section>

      {report.teachers.length === 0 ? (
        <div className="border border-dashed border-stone bg-white/40 px-5 py-12 text-center">
          <p className="font-display text-lg text-pine">
            No sessions in this month yet
          </p>
          <p className="mt-2 text-sm text-ink/55">
            Delivered or covered sessions land here once teachers or the desk
            confirm them.
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
                    <p className="mt-1 text-sm text-ink/55">
                      {teacher.hasPaymentDetails
                        ? `${teacher.paymentMethodLabel ?? "Payee"} · ${teacher.paymentPayeeMask ?? "On file"}`
                        : "No payment details on file"}
                      {teacher.paymentRecentlyChanged ? (
                        <span className="ml-2 text-xs font-medium uppercase tracking-[0.1em] text-amber-800">
                          Recently changed
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-ink/40">
                      {paid ? "Marked paid" : "Not paid yet"}
                      {paid && teacher.markedPaidAt
                        ? ` · ${teacher.markedPaidAt.slice(0, 10)}`
                        : ""}
                    </p>
                  </button>
                  <div className="flex flex-wrap gap-2">
                    {!paid ? (
                      teacher.hasPaymentDetails !== true ? (
                        <span className="px-3 py-2 text-sm text-ink/45">
                          Details needed
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPrepareTarget(teacher)}
                          className="border border-pine/25 px-3 py-2 text-sm font-medium text-pine hover:border-pine"
                        >
                          Prepare payment
                        </button>
                      )
                    ) : null}
                    {paid ? (
                      <button
                        type="button"
                        onClick={() => setClearTarget(teacher)}
                        className="border border-pine/25 px-3 py-2 text-sm font-medium text-pine hover:border-pine"
                      >
                        Clear paid mark
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMarkTarget(teacher)}
                        className="bg-pine px-3 py-2 text-sm font-medium text-mist hover:bg-celadon"
                      >
                        Mark as paid
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

      <DeskConfirmModal
        open={Boolean(markTarget)}
        title="Mark as paid?"
        body={
          markTarget ? (
            <div className="space-y-2">
              <p className="font-medium text-ink">
                {markTarget.teacherName} · {formatGbp(markTarget.grossGbp)}
              </p>
              <p>
                {report.label} · {markTarget.sessionCount} session
                {markTarget.sessionCount === 1 ? "" : "s"}
              </p>
              <p className="text-ink/55">
                This only records that pay was settled outside the portal. It does not send money.
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Mark as paid"
        busy={pending}
        onClose={() => setMarkTarget(null)}
        onConfirm={confirmMarkPaid}
      />

      <DeskConfirmModal
        open={Boolean(clearTarget)}
        title="Clear paid mark?"
        body={
          clearTarget ? (
            <div className="space-y-2">
              <p className="font-medium text-ink">
                {clearTarget.teacherName} · {formatGbp(clearTarget.grossGbp)}
              </p>
              <p>{report.label}</p>
              <p className="text-ink/55">
                This teacher will show as unpaid again for this month.
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Clear paid mark"
        destructive
        busy={pending}
        onClose={() => setClearTarget(null)}
        onConfirm={confirmClearPaid}
      />

      <DeskConfirmModal
        open={Boolean(prepareTarget)}
        title="Prepare payment?"
        body={
          prepareTarget ? (
            <div className="space-y-2">
              <p className="font-medium text-ink">
                {prepareTarget.teacherName} ·{" "}
                {formatGbp(prepareTarget.grossGbp)}
              </p>
              <p>
                {report.label} · {prepareTarget.sessionCount} session
                {prepareTarget.sessionCount === 1 ? "" : "s"}
              </p>
              <p className="text-ink/55">
                Creates a draft under Approvals. You still need to approve it before money is sent.
                {prepareTarget.paymentRecentlyChanged
                  ? " These payee details were changed in the last 30 days."
                  : ""}
              </p>
            </div>
          ) : (
            ""
          )
        }
        confirmLabel="Prepare payment"
        busy={pending}
        onClose={() => setPrepareTarget(null)}
        onConfirm={confirmPreparePayout}
      />
    </div>
  );
}
