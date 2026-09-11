import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeacherRemittance } from "@/app/teacher/payments/actions";
import { RemittancePrintButton } from "@/components/teacher/remittance-print-button";
import { formatGbp } from "@/lib/finance/types";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";

export const metadata: Metadata = {
  title: "Remittance | Teacher Portal",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function TeacherRemittancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let remittance: Awaited<ReturnType<typeof getTeacherRemittance>> = null;
  let loadError: string | null = null;

  try {
    remittance = await getTeacherRemittance(id);
  } catch (error) {
    console.error("[teacher/remittance]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Remittance"),
    );
  }

  if (!loadError && !remittance) notFound();

  const payout = remittance?.payout;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link
          href="/teacher/payments"
          className="inline-flex items-center gap-2 text-sm font-medium text-pine hover:underline"
        >
          ← Back to payments
        </Link>
      </div>

      {loadError ? (
        <div
          className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
          role="alert"
        >
          {loadError}
        </div>
      ) : remittance && payout ? (
        <>
          <div className="print:hidden flex justify-end">
            <RemittancePrintButton />
          </div>
          <article className="border border-stone/80 bg-white px-6 py-8 sm:px-10 print:border-0">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
              School of Disciples
            </p>
            <h1 className="mt-2 font-display text-3xl tracking-[-0.02em] text-pine">
              Remittance advice
            </h1>
            <p className="mt-2 text-sm text-ink/60">
              Teacher pay · {remittance.periodLabel}
            </p>

            <dl className="mt-8 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-ink/45">
                  Paid to
                </dt>
                <dd className="mt-1 text-ink">
                  {remittance.teacherName}
                  <br />
                  <span className="text-sm text-ink/55">
                    {remittance.teacherEmail}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-ink/45">
                  Amount
                </dt>
                <dd className="mt-1 font-display text-2xl text-pine">
                  {formatGbp(payout.amount_gbp)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-ink/45">
                  Method
                </dt>
                <dd className="mt-1 text-ink">
                  {payout.provider === "paypal" ? "PayPal" : "Bank / outside"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.12em] text-ink/45">
                  Paid on
                </dt>
                <dd className="mt-1 text-ink">
                  {payout.paid_at ? formatWhen(payout.paid_at) : "—"}
                </dd>
              </div>
              {remittance.sessionCount != null ? (
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-ink/45">
                    Sessions
                  </dt>
                  <dd className="mt-1 text-ink">{remittance.sessionCount}</dd>
                </div>
              ) : null}
              {remittance.rateLabel ? (
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-ink/45">
                    Rate
                  </dt>
                  <dd className="mt-1 text-ink">{remittance.rateLabel}</dd>
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-[0.12em] text-ink/45">
                  Reason
                </dt>
                <dd className="mt-1 text-ink">
                  {payout.reason ?? "Teacher pay"}
                </dd>
              </div>
            </dl>

            <p className="mt-10 text-xs leading-relaxed text-ink/45">
              This advice confirms a payment released through the School of
              Disciples finance desk. Keep a copy for your records.
            </p>
          </article>
        </>
      ) : null}
    </div>
  );
}
