/** Authoriser mailbox + TOTP seed — env only, never DB, never UI. */

function trimEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function financeApproverEmail(): string | undefined {
  return trimEnv("FINANCE_APPROVER_EMAIL");
}

export function financeApproverTotpSecret(): string | undefined {
  return trimEnv("FINANCE_APPROVER_TOTP_SECRET");
}

/** Both factors required before the payout rail is available. */
export function isFinancePayoutRailConfigured(): boolean {
  const email = financeApproverEmail();
  const secret = financeApproverTotpSecret();
  return Boolean(email && secret && secret.length >= 16);
}

export const FINANCE_EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
export const FINANCE_EMAIL_CODE_MAX_ATTEMPTS = 5;
export const FINANCE_AUTH_REREQUEST_COOLDOWN_MS = 60 * 1000;
export const FINANCE_AUTH_REQUESTS_PER_USER_PER_HOUR = 12;
