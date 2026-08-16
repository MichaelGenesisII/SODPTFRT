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
  reference: string;
  paymentRowId: string;
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

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.email,
    client_reference_id: input.userId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "gbp",
          unit_amount: Math.round(fee.amountGbp * 100),
          product_data: {
            name: `School of Disciples · ${fee.label}`,
            description: `${fee.hint} Reference ${input.reference}`,
          },
        },
      },
    ],
    metadata: {
      user_id: input.userId,
      fee_type: input.feeType,
      payment_id: input.paymentRowId,
      reference: input.reference,
      first_name: input.firstName,
    },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return { url: session.url, sessionId: session.id };
}
