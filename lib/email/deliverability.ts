import { createHash, randomBytes } from "node:crypto";
import { emailConfig } from "@/lib/email/config";

/**
 * Channels that should not invite a reply in the mailbox
 * (footer says use the portal). Prefer a monitored EMAIL_REPLY_TO for
 * everything else — mailbox providers trust two-way addresses more.
 */
const NOREPLY_CHANNELS = new Set([
  "campaign",
  "portal-migration",
  "listening-desk",
  "student-scorecard",
  "exam-result-certificate",
]);

/**
 * Mass / list-style sends. Get Precedence: bulk, List-Id, and
 * List-Unsubscribe when URLs or mailto are configured (Gmail/Yahoo).
 * Keep transactional channels out of this set.
 */
const BULK_CHANNELS = new Set([
  "campaign",
  "portal-migration",
  "class-invite",
]);

export function isNoreplyChannel(channel: string): boolean {
  return NOREPLY_CHANNELS.has(channel);
}

export function isBulkChannel(channel: string): boolean {
  return BULK_CHANNELS.has(channel);
}

export function resolveReplyTo(channel: string): string | undefined {
  if (isNoreplyChannel(channel)) {
    return emailConfig.noreply || emailConfig.from.address || undefined;
  }
  return emailConfig.replyTo || emailConfig.from.address || undefined;
}

/** Resend tag values: ASCII letters, numbers, underscore, dash only. */
export function sanitizeEmailTagValue(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 256);
}

export function buildResendTags(input: {
  channel: string;
  reference?: string;
}): { name: string; value: string }[] {
  const tags: { name: string; value: string }[] = [
    {
      name: "category",
      value: sanitizeEmailTagValue(input.channel) || "transactional",
    },
  ];
  if (input.reference) {
    const ref = sanitizeEmailTagValue(input.reference);
    if (ref) tags.push({ name: "reference", value: ref });
  }
  return tags;
}

/** Stable key so retries do not duplicate the same transactional mail. */
export function buildIdempotencyKey(input: {
  channel: string;
  to: string;
  reference?: string;
  subject: string;
}): string {
  const raw = [
    input.channel,
    input.to.trim().toLowerCase(),
    input.reference?.trim() || "",
    input.subject.trim(),
  ].join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 64);
}

export function buildMailHeaders(input: {
  channel: string;
  reference?: string;
  unsubscribeUrl?: string;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "X-SOD-Channel": input.channel,
  };

  if (input.reference) {
    headers["X-SOD-Reference"] = input.reference;
  }

  if (isBulkChannel(input.channel)) {
    headers.Precedence = "bulk";
    // Per-channel List-Id keeps each bulk stream's reputation separate.
    headers["List-Id"] = `<${input.channel}.${emailConfig.messageIdDomain}>`;
    headers["X-Entity-Ref-ID"] = randomBytes(8).toString("hex");

    const unsubParts: string[] = [];
    if (input.unsubscribeUrl) {
      unsubParts.push(`<${input.unsubscribeUrl}>`);
    }
    if (emailConfig.listUnsubscribeMailto) {
      unsubParts.push(
        `<mailto:${emailConfig.listUnsubscribeMailto}?subject=unsubscribe>`,
      );
    }
    if (unsubParts.length) {
      headers["List-Unsubscribe"] = unsubParts.join(", ");
      if (input.unsubscribeUrl) {
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
    }
    return headers;
  }

  headers["X-Auto-Response-Suppress"] = "All";
  headers["Auto-Submitted"] = "auto-generated";
  return headers;
}
