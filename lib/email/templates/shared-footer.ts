/**
 * Shared footer copy for deliverability: identity, physical location,
 * and why the recipient received the mail. Keep HTML + text in sync.
 */

export const ORG_NAME = "School of Disciples";
export const ORG_CITY = "Belfast";
export const ORG_REGION = "Northern Ireland";

export function orgAddressLine(custom?: string): string {
  const trimmed = custom?.trim();
  if (trimmed) return trimmed;
  return `${ORG_NAME}, ${ORG_CITY}, ${ORG_REGION}`;
}

export function transactionalTextFooter(input: {
  siteUrl: string;
  supportUrl?: string;
  whyReceived: string;
  orgAddress?: string;
}): string {
  const lines = [
    "",
    input.supportUrl ? `Questions: ${input.supportUrl}` : "",
    "",
    orgAddressLine(input.orgAddress),
    input.siteUrl,
    "",
    input.whyReceived,
    "This is an automated message. Please do not reply to this email.",
  ];
  return lines.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n");
}

export function campaignTextFooter(input: {
  siteUrl: string;
  supportUrl: string;
  portalUrl: string;
  unsubscribeUrl?: string;
  orgAddress?: string;
}): string {
  const lines = [
    "",
    `Open the student portal: ${input.portalUrl}`,
    `Questions: ${input.supportUrl}`,
    "",
    orgAddressLine(input.orgAddress),
    input.siteUrl,
    "",
    "You received this because you are enrolled with School of Disciples.",
    "This is an automated desk campaign. Please do not reply to this email.",
  ];
  if (input.unsubscribeUrl) {
    lines.push("", `Unsubscribe from desk campaigns: ${input.unsubscribeUrl}`);
  }
  return lines.join("\n");
}

export function campaignHtmlFooterBlock(input: {
  siteUrl: string;
  supportUrl: string;
  unsubscribeUrl?: string;
  year: number;
  orgAddress?: string;
}): string {
  const site = escapeAttr(input.siteUrl);
  const support = escapeAttr(input.supportUrl);
  const address = escapeHtml(orgAddressLine(input.orgAddress));
  const unsub = input.unsubscribeUrl
    ? `<br /><br />
              Prefer fewer desk emails?
              <a href="${escapeAttr(input.unsubscribeUrl)}" style="color:inherit;text-decoration:underline;">Unsubscribe from campaigns</a>`
    : "";

  return `
              You received this because you are enrolled with School of Disciples.<br />
              Questions?
              <a href="${support}" style="color:inherit;text-decoration:underline;">Support in the student portal</a>
              ${unsub}<br /><br />
              ${address}<br />
              <a href="${site}" style="color:inherit;text-decoration:underline;">schoolofdisciples.org</a>
              · © ${input.year}
`;
}

export function transactionalHtmlFooter(input: {
  siteUrl: string;
  supportUrl: string;
  notice: string;
  year: number;
  orgAddress?: string;
  whyReceived?: string;
}): string {
  const site = escapeAttr(input.siteUrl);
  const support = escapeAttr(input.supportUrl);
  const address = escapeHtml(orgAddressLine(input.orgAddress));
  const why = input.whyReceived
    ? `${escapeHtml(input.whyReceived)}<br /><br />`
    : "";

  return `${why}Questions?
              <a href="${support}" style="color:inherit;text-decoration:underline;">Support in the student portal</a><br /><br />
              ${escapeHtml(input.notice)} — please do not reply.<br />
              ${address}<br />
              <a href="${site}" style="color:inherit;text-decoration:underline;">schoolofdisciples.org</a>
              · © ${input.year}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
