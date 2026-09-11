import { createHmac, timingSafeEqual } from "node:crypto";
import { portalBaseUrl } from "@/lib/email/config";
import { financeApproverTotpSecret } from "@/lib/finance/approver-config";

type DeclinePayload = {
  p: string;
  c: string;
  exp: number;
};

function declineSecret(): string {
  const secret =
    process.env.FINANCE_DECLINE_SECRET?.trim() ||
    financeApproverTotpSecret() ||
    process.env.UNSUBSCRIBE_SECRET?.trim();
  if (!secret) {
    throw new Error("Decline signing secret is not configured.");
  }
  return secret;
}

function encodePayload(payload: DeclinePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function sign(part: string): string {
  return createHmac("sha256", declineSecret()).update(part).digest("base64url");
}

/** Signed, payout-bound decline token (~same TTL as emailed code + buffer). */
export function createPayoutDeclineToken(input: {
  payoutId: string;
  challengeId: string;
  expiresAtMs: number;
}): string {
  const payload: DeclinePayload = {
    p: input.payoutId,
    c: input.challengeId,
    exp: Math.floor(input.expiresAtMs / 1000) + 60 * 60,
  };
  const part = encodePayload(payload);
  return `${part}.${sign(part)}`;
}

export function verifyPayoutDeclineToken(
  token: string,
):
  | { ok: true; payoutId: string; challengeId: string }
  | { ok: false; message: string } {
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return { ok: false, message: "Invalid link." };

  const part = trimmed.slice(0, dot);
  const sig = trimmed.slice(dot + 1);
  const expected = sign(part);

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, message: "Invalid or expired link." };
    }
  } catch {
    return { ok: false, message: "Invalid or expired link." };
  }

  try {
    const raw = JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    ) as DeclinePayload;
    if (
      !raw?.p ||
      !raw?.c ||
      typeof raw.p !== "string" ||
      typeof raw.c !== "string" ||
      typeof raw.exp !== "number"
    ) {
      return { ok: false, message: "Invalid link." };
    }
    if (raw.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, message: "This link has expired." };
    }
    return { ok: true, payoutId: raw.p, challengeId: raw.c };
  } catch {
    return { ok: false, message: "Invalid link." };
  }
}

export function payoutDeclineUrl(token: string): string {
  return `${portalBaseUrl()}/payout-decline?t=${encodeURIComponent(token)}`;
}
