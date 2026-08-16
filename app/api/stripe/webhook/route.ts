import { NextResponse } from "next/server";
import { fulfillStripeSession } from "@/lib/payments/fulfill";
import { getStripe } from "@/lib/payments/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripe || !secret) {
    return NextResponse.json(
      { ok: false, message: "Stripe webhook is not configured." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, message: "Missing signature." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Invalid Stripe signature.",
      },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      await fulfillStripeSession({
        id: session.id,
        payment_intent:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null,
        metadata: session.metadata as Record<string, string> | null,
      });
    } catch (error) {
      console.error("[stripe webhook]", error);
      return NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Fulfillment failed.",
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
