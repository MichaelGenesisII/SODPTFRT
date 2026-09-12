import { writeFinanceAudit } from "@/lib/finance/audit";
import {
  ensurePayoutLedgerEntry,
  mapPaypalItemStatusToPayout,
  settlePayoutAsPaid,
} from "@/lib/finance/payout-settle";
import {
  getFinancePayout,
  type FinancePayout,
} from "@/lib/finance/payouts";
import {
  isPaypalPayoutsConfigured,
  PAYPAL_UNAVAILABLE_MESSAGE,
} from "@/lib/paypal/config";
import {
  createPaypalPayout,
  getPaypalPayoutBatch,
} from "@/lib/paypal/client";
import { getTeacherPaypalEmailForPayout } from "@/lib/teacher/payment-details";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function dispatchPaypalPayout(input: {
  payout: FinancePayout;
  actorId: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const { payout, actorId } = input;
  if (!isPaypalPayoutsConfigured()) {
    await writeFinanceAudit({
      actorId,
      action: "payout_paypal_unavailable",
      entityType: "finance_payout",
      entityId: payout.id,
      summary: `PayPal unavailable · ${payout.payee_name}`,
      after: { status: payout.status },
    });
    return { ok: false, message: PAYPAL_UNAVAILABLE_MESSAGE };
  }

  const service = createServiceSupabaseClient();
  const now = new Date().toISOString();

  let receiver = payout.payee_identifier;
  if (
    !receiver ||
    receiver.startsWith("bank:") ||
    receiver === "bank" ||
    !receiver.includes("@")
  ) {
    if (!payout.teacher_id) {
      return {
        ok: false,
        message: "This payment has no PayPal payee on file.",
      };
    }
    receiver = await getTeacherPaypalEmailForPayout(payout.teacher_id);
  }
  if (!receiver || !receiver.includes("@")) {
    return {
      ok: false,
      message:
        "This teacher has no PayPal email on file. Ask them to update their account.",
    };
  }

  await service
    .from("finance_payouts")
    .update({
      status: "sending",
      provider: "paypal",
      authorised_at: payout.authorised_at ?? now,
      updated_at: now,
      failure_reason: null,
    })
    .eq("id", payout.id);

  const result = await createPaypalPayout({
    idempotencyKey: payout.idempotency_key,
    senderBatchId: payout.idempotency_key,
    senderItemId: payout.id,
    receiverEmail: receiver,
    amountGbp: payout.amount_gbp,
    currency: payout.currency,
    note: payout.reason ?? "Teacher pay",
  });

  if (!result.ok || !result.payoutBatchId) {
    await service
      .from("finance_payouts")
      .update({
        status: "failed",
        provider: "paypal",
        provider_status: "CREATE_FAILED",
        provider_raw: result.raw,
        failure_reason: "provider_rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payout.id);

    await writeFinanceAudit({
      actorId,
      action: "payout_paypal_failed",
      entityType: "finance_payout",
      entityId: payout.id,
      summary: `PayPal rejected · ${payout.payee_name}`,
      after: { status: "failed" },
    });

    const rawName =
      result.raw &&
      typeof result.raw === "object" &&
      "name" in result.raw &&
      typeof (result.raw as { name: unknown }).name === "string"
        ? (result.raw as { name: string }).name
        : "";
    const authDenied = rawName === "AUTHORIZATION_ERROR";

    return {
      ok: false,
      message: authDenied
        ? "PayPal could not authorise this send. Check the PayPal account balance and that payouts are enabled, then retry from In progress."
        : "PayPal could not send this payment. You can retry from In progress — no duplicate will be created.",
    };
  }

  await service
    .from("finance_payouts")
    .update({
      provider_batch_id: result.payoutBatchId,
      provider_status: result.batchStatus ?? "PENDING",
      provider_raw: result.raw,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payout.id);

  // Prefer live item status when batch already finished.
  const details = await getPaypalPayoutBatch(result.payoutBatchId);
  const mapped = mapPaypalItemStatusToPayout(
    details.itemStatus ?? details.batchStatus,
  );

  let fresh = await getFinancePayout(payout.id);
  if (!fresh) {
    return { ok: false, message: "Payment not found." };
  }

  // Auto-log to Books as soon as PayPal accepts the send (incl. UNCLAIMED).
  if (!fresh.ledger_entry_id) {
    const logged = await ensurePayoutLedgerEntry({
      payout: fresh,
      actorId,
      settledAt: new Date().toISOString(),
    });
    if (!logged.ok) {
      console.error("[finance/payouts/paypal-ledger]", logged.message);
    } else {
      fresh = (await getFinancePayout(payout.id)) ?? fresh;
    }
  }

  if (mapped.payoutStatus === "paid") {
    return settlePayoutAsPaid({
      payout: fresh,
      actorId,
      provider: "paypal",
      providerStatus: mapped.providerStatus,
      providerBatchId: result.payoutBatchId,
      providerTxnId: details.itemTxnId,
      providerRaw: details.raw ?? result.raw,
      auditAction: "payout_paid_paypal",
      summary: `PayPal paid ${payout.payee_name} ${payout.amount_gbp.toFixed(2)}`,
    });
  }

  if (mapped.payoutStatus === "failed" || mapped.payoutStatus === "returned") {
    await service
      .from("finance_payouts")
      .update({
        status: mapped.payoutStatus,
        provider_status: mapped.providerStatus,
        provider_txn_id: details.itemTxnId,
        provider_raw: details.raw ?? result.raw,
        failure_reason: mapped.payoutStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payout.id);

    await writeFinanceAudit({
      actorId,
      action: "payout_paypal_terminal",
      entityType: "finance_payout",
      entityId: payout.id,
      summary: `PayPal ${mapped.payoutStatus} · ${payout.payee_name}`,
      after: { status: mapped.payoutStatus },
    });

    return {
      ok: false,
      message:
        mapped.payoutStatus === "returned"
          ? "PayPal returned this payment. Check the payee details and try again."
          : "PayPal could not complete this payment. You can retry from In progress.",
    };
  }

  await writeFinanceAudit({
    actorId,
    action: "payout_paypal_sending",
    entityType: "finance_payout",
    entityId: payout.id,
    summary: `PayPal sending · ${payout.payee_name}`,
    after: {
      status: "sending",
      provider_batch_id: result.payoutBatchId,
      provider_status: mapped.providerStatus,
    },
  });

  return {
    ok: true,
    message:
      "Sent to PayPal and recorded on the books. Status will update when PayPal confirms — use Refresh if it stays pending.",
  };
}

export async function refreshPaypalPayoutStatus(input: {
  payout: FinancePayout;
  actorId: string | null;
}): Promise<{ ok: boolean; message: string }> {
  const { payout, actorId } = input;
  if (!payout.provider_batch_id) {
    return { ok: false, message: "No PayPal batch is on file for this payment." };
  }
  if (!isPaypalPayoutsConfigured()) {
    return { ok: false, message: PAYPAL_UNAVAILABLE_MESSAGE };
  }

  const details = await getPaypalPayoutBatch(payout.provider_batch_id);
  if (!details.ok) {
    return {
      ok: false,
      message: "PayPal status could not be loaded. Please try again.",
    };
  }

  const mapped = mapPaypalItemStatusToPayout(
    details.itemStatus ?? details.batchStatus,
  );
  const service = createServiceSupabaseClient();

  let fresh = await getFinancePayout(payout.id);
  if (!fresh) return { ok: false, message: "Payment not found." };

  if (!fresh.ledger_entry_id && mapped.payoutStatus !== "failed") {
    const logged = await ensurePayoutLedgerEntry({
      payout: fresh,
      actorId,
      settledAt: new Date().toISOString(),
    });
    if (logged.ok) {
      fresh = (await getFinancePayout(payout.id)) ?? fresh;
    }
  }

  if (mapped.payoutStatus === "paid") {
    return settlePayoutAsPaid({
      payout: fresh,
      actorId,
      provider: "paypal",
      providerStatus: mapped.providerStatus,
      providerBatchId: payout.provider_batch_id,
      providerTxnId: details.itemTxnId,
      providerRaw: details.raw,
      auditAction: "payout_paid_paypal",
      summary: `PayPal paid ${payout.payee_name} ${payout.amount_gbp.toFixed(2)}`,
    });
  }

  await service
    .from("finance_payouts")
    .update({
      status:
        mapped.payoutStatus === "sending" ? "sending" : mapped.payoutStatus,
      provider_status: mapped.providerStatus,
      provider_txn_id: details.itemTxnId,
      provider_raw: details.raw,
      failure_reason:
        mapped.payoutStatus === "failed" || mapped.payoutStatus === "returned"
          ? mapped.payoutStatus
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", payout.id);

  await writeFinanceAudit({
    actorId,
    action: "payout_paypal_refresh",
    entityType: "finance_payout",
    entityId: payout.id,
    summary: `PayPal status ${mapped.providerStatus}`,
    after: { status: mapped.payoutStatus, provider_status: mapped.providerStatus },
  });

  if (mapped.payoutStatus === "sending") {
    return {
      ok: true,
      message: "Still waiting on PayPal. Check again shortly.",
    };
  }
  return {
    ok: true,
    message: `PayPal reports this payment as ${mapped.payoutStatus}.`,
  };
}
