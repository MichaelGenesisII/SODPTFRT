"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FinancePayoutDeskPayload } from "@/app/finance/payouts/actions";
import {
  FinanceCustomPayoutForm,
  type CustomPayoutCategoryOption,
  type CustomPayoutTeacherOption,
} from "@/components/finance/finance-custom-payout-form";
import { FinanceDeskFlow } from "@/components/finance/finance-desk-flow";
import { FinancePayoutsDesk } from "@/components/finance/finance-payouts-desk";
import { FinancePeriodsWorkspace } from "@/components/finance/finance-periods-workspace";
import { FinanceReconciliationDesk } from "@/components/finance/finance-reconciliation-desk";
import { DeskLoaderOverlay } from "@/components/ui/desk-loader";
import { isPayoutNeedsReconciliation } from "@/lib/finance/payout-reconciliation";
import type { PayPeriodTeacherTotal } from "@/lib/finance/types";

export type FinancePaymentsPanel =
  | "teachers"
  | "releases"
  | "reconcile"
  | "send";

type PeriodReport = {
  periodKey: string;
  label: string;
  teachers: PayPeriodTeacherTotal[];
  sessionCount: number;
  grossGbp: number;
};

const STAGE_HINT: Record<FinancePaymentsPanel, string> = {
  teachers: "See what teachers are owed this month, then pay or mark settled.",
  send: "Send PayPal or record a bank payment in one confirm.",
  releases: "Payments still sending, failed, or waiting — retry here.",
  reconcile: "Fix payments that got stuck, failed, or came back.",
};

export function FinancePaymentsDesk({
  panel,
  periodKey,
  periodReport,
  periodError,
  payouts,
  focusId,
  categories,
  teachers,
}: {
  panel: FinancePaymentsPanel;
  periodKey: string;
  periodReport: PeriodReport | null;
  periodError: string | null;
  payouts: FinancePayoutDeskPayload;
  focusId?: string;
  categories: CustomPayoutCategoryOption[];
  teachers: CustomPayoutTeacherOption[];
}) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  const openReleaseCount = payouts.payouts.filter((p) =>
    [
      "draft",
      "pending_authorisation",
      "authorised",
      "sending",
      "failed",
      "frozen",
      "expired",
    ].includes(p.status),
  ).length;

  const reconcileCount = payouts.payouts.filter(
    isPayoutNeedsReconciliation,
  ).length;

  function go(
    next: FinancePaymentsPanel,
    options?: { period?: string; payoutId?: string },
  ) {
    const params = new URLSearchParams();
    if (next !== "teachers") params.set("panel", next);
    const period = options?.period ?? periodKey;
    if (period && (next === "teachers" || next === "send")) {
      params.set("period", period);
    }
    if (options?.payoutId) params.set("id", options.payoutId);
    const qs = params.toString();
    startNav(() => {
      router.push(qs ? `/finance/payments?${qs}` : "/finance/payments");
    });
  }

  return (
    <div className="relative">
      <DeskLoaderOverlay active={navPending} label="Loading…" />
      <FinanceDeskFlow
        kicker="Payments"
        title="Pay teachers and follow up"
        lead="Check what is owed, send or record a payment in one step, then follow up anything still open."
        activeId={panel}
        onStage={(id) => go(id as FinancePaymentsPanel)}
        stages={[
          {
            id: "teachers",
            label: "Teacher pay",
            hint: STAGE_HINT.teachers,
          },
          {
            id: "send",
            label: "Send payment",
            hint: STAGE_HINT.send,
          },
          {
            id: "releases",
            label: "In progress",
            hint: STAGE_HINT.releases,
            count: openReleaseCount,
          },
          {
            id: "reconcile",
            label: "Follow up",
            hint: STAGE_HINT.reconcile,
            count: reconcileCount,
            urgent: reconcileCount > 0,
          },
        ]}
      >
        {panel === "teachers" ? (
          periodError ? (
            <div
              className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
              role="alert"
            >
              {periodError}
            </div>
          ) : periodReport ? (
            <FinancePeriodsWorkspace
              embedded
              report={periodReport}
              periodHref={(key) =>
                `/finance/payments?period=${encodeURIComponent(key)}`
              }
              headerAction={
                <p className="max-w-xs text-right text-xs leading-relaxed text-ink/50">
                  To pay someone else, open Send payment.
                </p>
              }
            />
          ) : null
        ) : null}

        {panel === "send" ? (
          <FinanceCustomPayoutForm
            embedded
            categories={categories}
            teachers={teachers}
            defaultPeriodKey={periodKey || undefined}
            onSent={(payoutId) => go("releases", { payoutId })}
          />
        ) : null}

        {panel === "releases" ? (
          <FinancePayoutsDesk
            embedded
            initial={payouts}
            focusId={focusId}
          />
        ) : null}

        {panel === "reconcile" ? (
          <FinanceReconciliationDesk embedded initial={payouts} />
        ) : null}
      </FinanceDeskFlow>
    </div>
  );
}
