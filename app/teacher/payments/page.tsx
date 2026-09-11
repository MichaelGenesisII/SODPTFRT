import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listTeacherPayments } from "@/app/teacher/payments/actions";
import { TeacherPaymentDetailsForm } from "@/components/teacher/teacher-payment-details-form";
import { isPaymentEncryptionConfigured } from "@/lib/crypto/field-encryption";
import { payoutStatusLabel } from "@/lib/finance/payout-status";
import { formatGbp } from "@/lib/finance/types";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import { getSessionTeacher } from "@/lib/teacher/auth";
import { getTeacherPaymentDetailsOwn } from "@/lib/teacher/payment-details";

export const metadata: Metadata = {
  title: "Payments | Teacher Portal",
};

function formatWhen(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function TeacherPaymentsPage() {
  const profile = await getSessionTeacher();
  if (!profile) redirect("/login/teacher");

  const encryptionReady = isPaymentEncryptionConfigured();
  let paymentDetails: Awaited<
    ReturnType<typeof getTeacherPaymentDetailsOwn>
  > = null;
  try {
    paymentDetails = await getTeacherPaymentDetailsOwn(profile.id);
  } catch (error) {
    console.error("[teacher/payments/payment-details]", error);
  }

  let rows: Awaited<ReturnType<typeof listTeacherPayments>> = [];
  let loadError: string | null = null;

  try {
    rows = await listTeacherPayments();
  } catch (error) {
    console.error("[teacher/payments]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Payments"),
    );
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="text-[0.65rem] font-medium uppercase tracking-[0.18em] text-celadon">
          Pay
        </p>
        <h1 className="mt-1.5 font-display text-[clamp(1.6rem,5vw,2.4rem)] tracking-[-0.02em] text-pine">
          Payments
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink/65">
          How you get paid, and your teacher pay history. Open a remittance for
          any paid period.
        </p>
      </section>

      <TeacherPaymentDetailsForm
        initial={paymentDetails}
        encryptionReady={encryptionReady}
      />

      <section className="space-y-4">
        <div>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.14em] text-celadon">
            History
          </p>
          <h2 className="mt-1 font-display text-xl text-pine">Pay history</h2>
          <p className="mt-1.5 max-w-xl text-sm text-ink/55">
            Released and paid amounts from Finance.
          </p>
        </div>

        {loadError ? (
          <div
            className="border border-red-800/30 bg-red-50 px-5 py-4 text-sm text-red-900"
            role="alert"
          >
            {loadError}
          </div>
        ) : rows.length === 0 ? (
          <div className="border border-dashed border-stone bg-white/40 px-5 py-10 text-center">
            <p className="font-display text-lg text-pine">No payments yet</p>
            <p className="mt-2 text-sm text-ink/55">
              When finance releases a payment to you, it will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-stone/70 border border-stone/80 bg-white/55">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-ink">{row.periodLabel}</p>
                  <p className="mt-1 text-sm text-ink/55">
                    {formatGbp(row.amountGbp)} · {payoutStatusLabel(row.status)}{" "}
                    · {row.provider === "paypal" ? "PayPal" : "Bank / outside"}
                    {row.paidAt ? ` · ${formatWhen(row.paidAt)}` : null}
                  </p>
                </div>
                {row.status === "paid" ? (
                  <Link
                    href={`/teacher/payments/${row.id}/remittance`}
                    className="inline-flex items-center justify-center border border-pine/30 bg-pine/5 px-3 py-2 text-sm font-medium text-pine hover:bg-pine/10"
                  >
                    Remittance
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
