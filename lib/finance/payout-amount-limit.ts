import { writeFinanceAudit } from "@/lib/finance/audit";
import {
  FINANCE_PAYOUT_MAX_GBP,
  FINANCE_PAYOUT_OVER_LIMIT_MESSAGE,
} from "@/lib/finance/payout-constants";
import { financeApproverEmail } from "@/lib/finance/approver-config";
import {
  financeDisplayName,
  formatGbp,
  type FinanceProfile,
} from "@/lib/finance/types";
import { portalBaseUrl } from "@/lib/email/config";
import { sendFinancePayoutLimitWarningEmail } from "@/lib/email/mailer";

export type PayoutAmountGateContext = {
  finance: FinanceProfile;
  amountGbp: number;
  payeeName: string;
  reason: string;
};

/** True when amount is allowed (positive and at most the desk max). */
export function isPayoutAmountWithinLimit(amountGbp: number): boolean {
  return (
    Number.isFinite(amountGbp) &&
    amountGbp > 0 &&
    amountGbp <= FINANCE_PAYOUT_MAX_GBP
  );
}

/**
 * Blocks amounts over £2000, emails FINANCE_APPROVER_EMAIL, writes audit.
 * Call before creating or completing a payment.
 */
export async function enforcePayoutAmountLimit(
  ctx: PayoutAmountGateContext,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!Number.isFinite(ctx.amountGbp) || ctx.amountGbp <= 0) {
    return { ok: false, message: "Amount must be greater than zero." };
  }

  if (ctx.amountGbp <= FINANCE_PAYOUT_MAX_GBP) {
    return { ok: true };
  }

  const financeName = financeDisplayName(ctx.finance);
  const amountLabel = formatGbp(ctx.amountGbp);
  const limitLabel = formatGbp(FINANCE_PAYOUT_MAX_GBP);
  const attemptedAtLabel = new Date().toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  await writeFinanceAudit({
    actorId: ctx.finance.id,
    action: "payout_amount_limit_blocked",
    entityType: "finance_payout",
    entityId: null,
    summary: `Blocked over-limit payment ${amountLabel} → ${ctx.payeeName}`,
    after: {
      amount_gbp: ctx.amountGbp,
      limit_gbp: FINANCE_PAYOUT_MAX_GBP,
      payee_name: ctx.payeeName,
      reason: ctx.reason,
      finance_email: ctx.finance.email,
    },
  });

  const approver = financeApproverEmail();
  if (approver) {
    try {
      await sendFinancePayoutLimitWarningEmail({
        to: approver,
        template: {
          financeName,
          financeEmail: ctx.finance.email,
          attemptedAmountLabel: amountLabel,
          limitLabel,
          payeeName: ctx.payeeName || "Unknown payee",
          reason: ctx.reason || "Payment",
          attemptedAtLabel,
          siteUrl: portalBaseUrl(),
        },
      });
    } catch (error) {
      console.error("[finance/payouts/limit-warning-mail]", error);
    }
  } else {
    console.error(
      "[finance/payouts/limit-warning] FINANCE_APPROVER_EMAIL is not set",
    );
  }

  return { ok: false, message: FINANCE_PAYOUT_OVER_LIMIT_MESSAGE };
}
