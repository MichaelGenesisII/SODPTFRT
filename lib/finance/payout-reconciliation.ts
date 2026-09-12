import type { FinancePayout } from "@/lib/finance/payouts";

/** Payouts that need finance attention after release (reconciliation desk). */
export function isPayoutNeedsReconciliation(payout: FinancePayout): boolean {
  if (["failed", "returned"].includes(payout.status)) return true;
  if (payout.status === "sending") return true;
  if (
    payout.status === "authorised" &&
    payout.failure_reason === "period_locked"
  ) {
    return true;
  }
  const provider = (payout.provider_status ?? "").toUpperCase();
  if (
    payout.provider === "paypal" &&
    ["UNCLAIMED", "ONHOLD", "HELD"].includes(provider)
  ) {
    return true;
  }
  return false;
}

export function reconciliationHint(payout: FinancePayout): string {
  const provider = (payout.provider_status ?? "").toUpperCase();
  if (payout.status === "failed") {
    return "PayPal could not complete this payment. Retry from Authorisations if appropriate.";
  }
  if (payout.status === "returned") {
    return "Funds came back. Confirm the teacher’s details, then prepare a new payment if needed.";
  }
  if (provider === "UNCLAIMED") {
    return "Waiting for the teacher to claim the PayPal payment.";
  }
  if (payout.failure_reason === "period_locked") {
    return "Authorised while the books period was locked. Unlock the period, then refresh or settle.";
  }
  if (payout.status === "sending") {
    return "Still with PayPal. Refresh status, or wait for the webhook.";
  }
  return "Needs a status check.";
}
