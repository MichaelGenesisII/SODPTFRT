import {
  createHash,
  createHmac,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { financeApproverTotpSecret } from "@/lib/finance/approver-config";

function codePepper(): string {
  const pepper =
    process.env.FINANCE_CODE_PEPPER?.trim() ||
    financeApproverTotpSecret() ||
    process.env.UNSUBSCRIBE_SECRET?.trim();
  if (!pepper) {
    throw new Error("Finance code pepper is not configured.");
  }
  return pepper;
}

/** 8-digit emailed payout code (never logged / never returned to clients). */
export function generatePayoutEmailCode(): string {
  return String(randomInt(0, 100_000_000)).padStart(8, "0");
}

export function hashPayoutEmailCode(payoutId: string, code: string): string {
  return createHmac("sha256", codePepper())
    .update(`payout-email:${payoutId}:${code.trim()}`)
    .digest("hex");
}

export function verifyPayoutEmailCode(
  payoutId: string,
  code: string,
  expectedHash: string,
): boolean {
  const trimmed = code.trim().replace(/\s+/g, "");
  if (!/^\d{8}$/.test(trimmed)) return false;
  const actual = Buffer.from(hashPayoutEmailCode(payoutId, trimmed), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function hashPayeeBinding(payeeName: string): string {
  return createHash("sha256")
    .update(`payee:${payeeName.trim().toLowerCase()}`)
    .digest("hex");
}
