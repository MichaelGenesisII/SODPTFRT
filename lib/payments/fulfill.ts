import {
  sendPaymentReceivedEmail,
} from "@/lib/email/payment-mail";
import { portalBaseUrl } from "@/lib/email/backend";
import { formatGbp } from "@/lib/enrol/payment";
import { feeDefinition, isFeeType, type FeeType } from "@/lib/payments/fees";
import { getFeePayment, markFeePaid } from "@/lib/payments/service";
import { SOD_SITE } from "@/lib/site-nav";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/** Used by Stripe webhook after successful Checkout. Idempotent on replay. */
export async function fulfillStripeSession(session: {
  id: string;
  payment_intent?: string | null;
  metadata?: Record<string, string> | null;
}) {
  const userId = session.metadata?.user_id;
  const feeTypeRaw = session.metadata?.fee_type;
  if (!userId || !isFeeType(feeTypeRaw || "")) {
    throw new Error("Stripe session missing fee metadata.");
  }

  const feeType = feeTypeRaw as FeeType;
  const service = createServiceSupabaseClient();
  const existing = await getFeePayment(service, userId, feeType);

  if (existing?.status === "paid") {
    return existing;
  }

  const paid = await markFeePaid({
    userId,
    feeType,
    method: "stripe",
    stripeSessionId: session.id,
    stripePaymentIntent: session.payment_intent ?? null,
  });

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
      amountLabel: formatGbp(Number(paid.amount_gbp)),
      reference,
      methodLabel: "Card (Stripe)",
      portalPaymentsUrl: `${portalBaseUrl()}/student/payments`,
      portalSupportUrl: `${portalBaseUrl()}/student/support`,
      siteUrl: SOD_SITE,
      feeType,
    });
  }

  return paid;
}
