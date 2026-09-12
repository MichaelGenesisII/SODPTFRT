import Link from "next/link";
import { BANK_TRANSFER, formatGbp } from "@/lib/enrol/payment";
import {
  MIN_INSTALLMENT_GBP,
  programmeFeeBreakdownLabel,
  programmeFeeInstallmentHint,
  type FeePaymentStatus,
} from "@/lib/payments/fees";
import type { PaymentStatus } from "@/lib/student/types";

type StudentPaymentDueSummaryProps = {
  reference: string;
  referenceCompact: string;
  tuitionPaidGbp: number;
  tuitionDueGbp: number;
  payment: PaymentStatus | FeePaymentStatus;
  /** When false, copy notes that payment opens after acceptance. */
  canPayNow?: boolean;
  className?: string;
};

function BankLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-[0.65rem] uppercase tracking-[0.12em] text-ink/45 sm:w-28">
        {label}
      </dt>
      <dd
        className={`min-w-0 break-words text-sm text-ink/80 ${mono ? "font-mono tracking-wide" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

/** Programme fee, bank details, and reference for students with balance outstanding. */
export function StudentPaymentDueSummary({
  reference,
  referenceCompact,
  tuitionPaidGbp,
  tuitionDueGbp,
  payment,
  canPayNow = true,
  className = "",
}: StudentPaymentDueSummaryProps) {
  const remaining = Math.max(0, tuitionDueGbp - tuitionPaidGbp);
  const progress =
    tuitionDueGbp > 0
      ? Math.min(100, (tuitionPaidGbp / tuitionDueGbp) * 100)
      : 0;
  const inReview = payment === "pending_review";

  return (
    <section
      className={`border border-stone bg-mist/40 px-4 py-5 sm:px-6 sm:py-6 ${className}`}
      data-tour="student-payment-due-summary"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            Programme fee
          </p>
          <h2 className="mt-2 font-display text-xl tracking-[-0.02em] text-pine sm:text-2xl">
            {inReview ? "Payment under review" : "Balance outstanding"}
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink/65">
            {programmeFeeBreakdownLabel()}. {programmeFeeInstallmentHint()}
          </p>
        </div>
        <Link
          href="/student/payments"
          className="inline-flex min-h-11 shrink-0 items-center justify-center bg-pine px-5 py-3 text-sm font-medium tracking-wide text-mist transition-colors hover:bg-pine/90"
        >
          {inReview ? "Track payment" : "Pay now"}
        </Link>
      </div>

      <div className="mt-5 border border-stone bg-white/60 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-ink">Programme fee</span>
          <span className="tabular-nums text-ink/70">
            {formatGbp(tuitionPaidGbp)} of {formatGbp(tuitionDueGbp)}
            {remaining > 0 ? (
              <span className="text-ink/45"> · {formatGbp(remaining)} left</span>
            ) : null}
          </span>
        </div>
        <div
          className="mt-3 h-1.5 overflow-hidden bg-stone/80"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Programme fee paid"
        >
          <div
            className="h-full bg-pine transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
        {inReview ? (
          <p className="mt-3 text-sm leading-relaxed text-ink/60">
            Your bank transfer proof is with the desk. We will email you when it
            is confirmed.
          </p>
        ) : null}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
            Bank transfer
          </p>
          <dl className="mt-3 space-y-2.5">
            <BankLine label="Account" value={BANK_TRANSFER.accountName} />
            <BankLine
              label="Sort code"
              value={BANK_TRANSFER.sortCode}
              mono
            />
            <BankLine
              label="Account no."
              value={BANK_TRANSFER.accountNumber}
              mono
            />
            <BankLine label="IBAN" value={BANK_TRANSFER.iban} mono />
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-ink/50">
            Minimum instalment {formatGbp(MIN_INSTALLMENT_GBP)} unless you clear
            the remaining balance. You can also pay by card on the Payments page.
          </p>
        </div>
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-ink/45">
            Payment reference
          </p>
          <p className="mt-3 break-all font-mono text-base tracking-wide text-pine">
            {referenceCompact}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink/50">
            Put this reference on every transfer exactly. It matches your
            application id ({reference}).
          </p>
          {!canPayNow ? (
            <p className="mt-3 text-sm leading-relaxed text-ink/60">
              Card checkout and proof upload open on Payments once your
              application is accepted.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
