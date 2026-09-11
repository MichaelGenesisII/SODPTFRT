import { NextResponse } from "next/server";
import { writeFinanceAudit } from "@/lib/finance/audit";
import {
  mapPaypalItemStatusToPayout,
  settlePayoutAsPaid,
} from "@/lib/finance/payout-settle";
import { getFinancePayout } from "@/lib/finance/payouts";
import {
  isPaypalPayoutsConfigured,
  paypalWebhookId,
} from "@/lib/paypal/config";
import { verifyPaypalWebhookSignature } from "@/lib/paypal/client";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type PaypalWebhookBody = {
  event_type?: string;
  resource?: {
    payout_batch_id?: string;
    transaction_id?: string;
    transaction_status?: string;
    payout_item_id?: string;
    sender_batch_id?: string;
  };
};

async function findPayoutByBatchId(batchId: string) {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("finance_payouts")
    .select("id")
    .eq("provider_batch_id", batchId)
    .maybeSingle();
  if (error) {
    console.error("[paypal/webhook/lookup]", error.message);
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

export async function POST(request: Request) {
  if (!isPaypalPayoutsConfigured()) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const rawText = await request.text();
  let body: PaypalWebhookBody;
  try {
    body = JSON.parse(rawText) as PaypalWebhookBody;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const webhookId = paypalWebhookId();
  if (webhookId) {
    const transmissionId = request.headers.get("paypal-transmission-id") ?? "";
    const timestamp = request.headers.get("paypal-transmission-time") ?? "";
    const transmissionSig = request.headers.get("paypal-transmission-sig") ?? "";
    const certUrl = request.headers.get("paypal-cert-url") ?? "";
    const authAlgo = request.headers.get("paypal-auth-algo") ?? "";
    const verified = await verifyPaypalWebhookSignature({
      transmissionId,
      timestamp,
      transmissionSig,
      certUrl,
      authAlgo,
      webhookEvent: body,
    });
    if (!verified) {
      console.error("[paypal/webhook] signature rejected");
      return NextResponse.json({ ok: false }, { status: 400 });
    }
  } else {
    // Sandbox without webhook id: accept but log — desk Refresh remains the source of truth.
    console.warn("[paypal/webhook] processed without signature verification");
  }

  const eventType = body.event_type ?? "";
  const resource = body.resource ?? {};
  const batchId = resource.payout_batch_id;
  if (!batchId) {
    return NextResponse.json({ ok: true });
  }

  const payoutId = await findPayoutByBatchId(batchId);
  if (!payoutId) {
    return NextResponse.json({ ok: true });
  }

  const payout = await getFinancePayout(payoutId);
  if (!payout || payout.status === "paid") {
    return NextResponse.json({ ok: true });
  }

  const mapped = mapPaypalItemStatusToPayout(resource.transaction_status ?? null);
  const service = createServiceSupabaseClient();

  if (mapped.payoutStatus === "paid") {
    await settlePayoutAsPaid({
      payout,
      actorId: null,
      provider: "paypal",
      providerStatus: mapped.providerStatus,
      providerBatchId: batchId,
      providerTxnId: resource.transaction_id ?? null,
      providerRaw: body,
      auditAction: "payout_paid_paypal_webhook",
      summary: `PayPal webhook paid · ${payout.payee_name}`,
    });
  } else if (
    mapped.payoutStatus === "failed" ||
    mapped.payoutStatus === "returned"
  ) {
    await service
      .from("finance_payouts")
      .update({
        status: mapped.payoutStatus,
        provider_status: mapped.providerStatus,
        provider_txn_id: resource.transaction_id ?? null,
        provider_raw: body,
        failure_reason: mapped.payoutStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payout.id);

    await writeFinanceAudit({
      actorId: null,
      action: "payout_paypal_webhook",
      entityType: "finance_payout",
      entityId: payout.id,
      summary: `PayPal webhook ${mapped.payoutStatus} · ${eventType}`,
      after: { status: mapped.payoutStatus },
    });
  } else {
    await service
      .from("finance_payouts")
      .update({
        status: "sending",
        provider_status: mapped.providerStatus || eventType,
        provider_txn_id: resource.transaction_id ?? null,
        provider_raw: body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payout.id);
  }

  return NextResponse.json({ ok: true });
}
