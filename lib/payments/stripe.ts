import Stripe from "stripe";
import { feeDefinition, type FeeType } from "@/lib/payments/fees";
import { portalBaseUrl } from "@/lib/email/backend";

let stripeClient: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (stripeClient !== undefined) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    stripeClient = null;
    return null;
  }
  stripeClient = new Stripe(key);
  return stripeClient;
}

export function stripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim(),
  );
}

export async function createFeeCheckoutSession(input: {
  userId: string;
  email: string;
  firstName: string;
  feeType: FeeType;
  /** Human enrolment reference (SOD-26-…). */
  reference: string;
  /** Compact bank-style reference (SOD26…) — primary Stripe / bank lookup key. */
  referenceCompact: string;
  /** Enrolment row UUID when available. */
  enrolmentId?: string | null;
  paymentRowId: string;
  transactionId: string;
  amountGbp: number;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error(
      "Card payments are not available right now. Please pay by bank transfer.",
    );
  }

  const fee = feeDefinition(input.feeType);
  const base = portalBaseUrl();
  const successUrl = `${base}/student/payments?paid=${input.feeType}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${base}/student/payments?cancelled=${input.feeType}`;
  const amountPence = Math.round(input.amountGbp * 100);

  if (amountPence < 50) {
    throw new Error("Payment amount is too small.");
  }

  const lookupRef =
    input.referenceCompact.trim() ||
    input.reference.trim() ||
    input.userId;

  const sharedMeta: Record<string, string> = {
    user_id: input.userId,
    fee_type: input.feeType,
    payment_id: input.paymentRowId,
    transaction_id: input.transactionId,
    amount_gbp: String(input.amountGbp),
    reference: input.reference,
    reference_compact: input.referenceCompact || lookupRef,
    first_name: input.firstName,
  };
  if (input.enrolmentId) {
    sharedMeta.enrolment_id = input.enrolmentId;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.email,
    // Stripe Dashboard → search by this field (enrolment compact ref).
    client_reference_id: lookupRef.slice(0, 200),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: amountPence,
          product_data: {
            name: `School of Disciples · ${fee.label}`,
            description: `${fee.hint} Enrolment ${input.reference} (${lookupRef})`,
          },
        },
      },
    ],
    metadata: sharedMeta,
    payment_intent_data: {
      metadata: sharedMeta,
      description: `SOD ${fee.label} · ${lookupRef}`,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return { url: session.url, sessionId: session.id };
}
