import { sendPaymentReceivedEmail } from "@/lib/email/payment-mail";
import { portalBaseUrl } from "@/lib/email/backend";
import { formatGbp } from "@/lib/enrol/payment";
import {
  feeDefinition,
  normalizeFeeType,
  type FeeType,
} from "@/lib/payments/fees";
import {
  applyPaidTransaction,
  getFeeTransaction,
} from "@/lib/payments/service";
import { SOD_SITE } from "@/lib/site-nav";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/** Used by Stripe webhook after successful Checkout. Idempotent on replay. */
export async function fulfillStripeSession(session: {
  id: string;
  payment_intent?: string | null;
  metadata?: Record<string, string> | null;
}) {
  const userId = session.metadata?.user_id;
  const feeType = normalizeFeeType(session.metadata?.fee_type) as FeeType | null;
  const transactionId = session.metadata?.transaction_id;

  if (!userId || !feeType) {
    throw new Error("Stripe session missing fee metadata.");
  }

  const service = createServiceSupabaseClient();

  if (transactionId) {
    const existing = await getFeeTransaction(service, transactionId);
    if (existing?.status === "paid") {
      return existing;
    }

    if (existing) {
      const { account, transaction } = await applyPaidTransaction({
        transactionId,
        method: "stripe",
        stripeSessionId: session.id,
        stripePaymentIntent: session.payment_intent ?? null,
      });

      void queuePaymentEmail(
        userId,
        feeType,
        transaction.amount_gbp,
        session,
      );
      return account;
    }
  }

  const { markFeePaid } = await import("@/lib/payments/service");
  const paid = await markFeePaid({
    userId,
    feeType,
    method: "stripe",
    stripeSessionId: session.id,
    stripePaymentIntent: session.payment_intent ?? null,
    amountGbp: Number(session.metadata?.amount_gbp) || undefined,
  });

  void queuePaymentEmail(
    userId,
    feeType,
    Number(session.metadata?.amount_gbp) || paid.amount_paid_gbp,
    session,
  );

  return paid;
}

/** Payment success must not depend on SMTP. Log and continue on mail failure. */
function queuePaymentEmail(
  userId: string,
  feeType: FeeType,
  amountGbp: number,
  session: { metadata?: Record<string, string> | null },
) {
  return sendPaymentEmail(userId, feeType, amountGbp, session).catch(
    (error) => {
      console.error("[payments/fulfill] confirmation email failed", error);
    },
  );
}

async function sendPaymentEmail(
  userId: string,
  feeType: FeeType,
  amountGbp: number,
  session: { metadata?: Record<string, string> | null },
) {
  const service = createServiceSupabaseClient();
  const { data: profile } = await service
    .from("student_profiles")
    .select("email, first_name")
    .eq("id", userId)
    .maybeSingle();

  const reference = session.metadata?.reference || "SOD";
  if (profile) {
    const fee = feeDefinition(feeType);
    await sendPaymentReceivedEmail({
      to: profile.email,
      firstName: profile.first_name,
      feeLabel: fee.label,
      amountLabel: formatGbp(amountGbp),
      reference,
      methodLabel: "Card (Stripe)",
      portalPaymentsUrl: `${portalBaseUrl()}/student/payments`,
      portalSupportUrl: `${portalBaseUrl()}/student/support`,
      siteUrl: SOD_SITE,
      feeType,
    });
  }
}
