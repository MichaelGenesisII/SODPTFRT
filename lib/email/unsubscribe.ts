import { createHmac, timingSafeEqual } from "node:crypto";
import { portalBaseUrl } from "@/lib/email/config";

type UnsubscribePayload = {
  e: string;
  exp: number;
};

function unsubscribeSecret(): string {
  const secret = process.env.UNSUBSCRIBE_SECRET?.trim();
  if (!secret) {
    throw new Error("Unsubscribe signing secret is not configured.");
  }
  return secret;
}

function encodePayload(payload: UnsubscribePayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function sign(payloadPart: string): string {
  return createHmac("sha256", unsubscribeSecret())
    .update(payloadPart)
    .digest("base64url");
}

/** Signed token for campaign List-Unsubscribe + footer links (~90 days). */
export function createCampaignUnsubscribeToken(email: string): string {
  const payload: UnsubscribePayload = {
    e: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90,
  };
  const part = encodePayload(payload);
  return `${part}.${sign(part)}`;
}

export function verifyCampaignUnsubscribeToken(
  token: string,
): { ok: true; email: string } | { ok: false; message: string } {
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
    ) as UnsubscribePayload;
    if (!raw?.e || typeof raw.e !== "string" || typeof raw.exp !== "number") {
      return { ok: false, message: "Invalid link." };
    }
    if (raw.exp < Math.floor(Date.now() / 1000)) {
      return { ok: false, message: "This unsubscribe link has expired." };
    }
    return { ok: true, email: raw.e.trim().toLowerCase() };
  } catch {
    return { ok: false, message: "Invalid link." };
  }
}

/** Human + one-click URL used in campaign bodies and List-Unsubscribe. */
export function campaignUnsubscribeUrl(email: string): string {
  const token = createCampaignUnsubscribeToken(email);
  return `${portalBaseUrl()}/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** One-click endpoint for List-Unsubscribe-Post (Gmail/Yahoo). */
export function campaignUnsubscribeOneClickUrl(email: string): string {
  const token = createCampaignUnsubscribeToken(email);
  return `${portalBaseUrl()}/api/email/unsubscribe?t=${encodeURIComponent(token)}`;
}

/**
 * Both unsubscribe URLs against an explicit origin. Scripts run with a local
 * NEXT_PUBLIC_APP_URL, so they must pass the production origin themselves
 * rather than inherit it from the environment.
 */
export function unsubscribeUrlsForOrigin(
  email: string,
  origin: string,
): { footerUrl: string; oneClickUrl: string } {
  const base = origin.replace(/\/$/, "");
  const token = encodeURIComponent(createCampaignUnsubscribeToken(email));
  return {
    footerUrl: `${base}/unsubscribe?t=${token}`,
    oneClickUrl: `${base}/api/email/unsubscribe?t=${token}`,
  };
}
