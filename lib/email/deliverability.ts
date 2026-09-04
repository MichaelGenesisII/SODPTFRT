import { randomBytes } from "node:crypto";
import { emailConfig } from "@/lib/email/config";

const NOREPLY_CHANNELS = new Set([
  "listening-desk",
  "student-scorecard",
  "exam-result-certificate",
  "campaign",
  "class-invite",
  "class-teacher-assignment",
]);

const BULK_CHANNELS = new Set(["campaign"]);

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
    headers["List-Id"] = `<campaign.${emailConfig.messageIdDomain}>`;
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
