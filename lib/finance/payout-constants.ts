/** Client-safe payout UX constants (no env access). */

/** Soft confirm (retype amount) when completing a high-value open payment. */
export const FINANCE_PAYOUT_HIGH_VALUE_GBP = 1000;

/** Hard desk limit — one payment cannot exceed this. */
export const FINANCE_PAYOUT_MAX_GBP = 2000;

export const FINANCE_PAYOUT_OVER_LIMIT_MESSAGE =
  "Payments over £2,000 cannot be sent from this desk. An alert has been sent.";

/** Calm copy — never names env vars. */
export const FINANCE_PAYOUTS_UNAVAILABLE_MESSAGE =
  "Payments are not available right now.";
