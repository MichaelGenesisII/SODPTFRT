/** Payout rail config. Dual-factor authoriser was removed for swift finance release. */

/** Always available once finance is signed in — no authoriser env required. */
export function isFinancePayoutRailConfigured(): boolean {
  return true;
}

/** Approver mailbox — used for over-limit payment warnings (not dual-factor). */
export function financeApproverEmail(): string | undefined {
  const value = process.env.FINANCE_APPROVER_EMAIL?.trim();
  return value || undefined;
}

/** @deprecated Dual-factor authoriser removed. Kept for any leftover imports. */
export function financeApproverTotpSecret(): string | undefined {
  const value = process.env.FINANCE_APPROVER_TOTP_SECRET?.trim();
  return value || undefined;
}

export const FINANCE_EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const FINANCE_EMAIL_CODE_MAX_ATTEMPTS = 5;
export const FINANCE_AUTH_REREQUEST_COOLDOWN_MS = 60 * 1000;
export const FINANCE_AUTH_REQUESTS_PER_USER_PER_HOUR = 12;
