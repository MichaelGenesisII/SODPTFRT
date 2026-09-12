import { config } from "../config";
import { campaignHtmlFooterBlock, campaignTextFooter } from "./shared-footer";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type CampaignTemplateId = "custom";

export type CampaignMailInput = {
  templateId: CampaignTemplateId;
  firstName: string;
  parishName?: string;
  /** Student portal home (e.g. …/student). */
  portalUrl: string;
  /** Absolute URL to /student/support. */
  portalSupportUrl: string;
  /** Main public website (schoolofdisciples.org). */
  siteUrl: string;
  /** Absolute HTTPS unsubscribe URL shown in the footer. */
  unsubscribeUrl?: string;
  /** One-click List-Unsubscribe HTTPS URL (Gmail/Yahoo). */
  listUnsubscribeUrl?: string;
  /** Optional desk note appended after the main body. */
  personalNote?: string;
  customSubject?: string;
  customHeadline?: string;
  customBody?: string;
};

function noteBlock(note?: string) {
  const trimmed = note?.trim();
  if (!trimmed) return { text: "", html: "" };
  return {
    text: `\n\nA note from your desk:\n${trimmed}`,
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
      <tr>
        <td style="padding:14px 16px;background:#eef4f0;border-left:3px solid #95bfa8;">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#3d6b58;font-weight:700;">
            From your desk
          </p>
          <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:rgba(20,36,28,0.78);">
            ${escapeHtml(trimmed).replaceAll("\n", "<br/>")}
          </p>
        </td>
      </tr>
    </table>`,
  };
}

/** Desk campaign to enrolled students — custom subject / headline / body. */
export function buildCampaignEmail(input: CampaignMailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const parish = input.parishName?.trim() || "";
  const parishSafe = escapeHtml(parish);
  const portalUrl = escapeHtml(input.portalUrl.trim());
  const note = noteBlock(input.personalNote);
  const year = new Date().getFullYear();

  const subject =
    input.customSubject?.trim() || "A note from School of Disciples";
  const headline = input.customHeadline?.trim() || "A message for you";
  const body =
    input.customBody?.trim() ||
    "Your School of Disciples desk has sent you an update.";
  const headlineSafe = escapeHtml(headline);
  const bodyHtml = escapeHtml(body).replaceAll("\n", "<br/>");

  const deskLabel = parish
    ? `Parish desk · ${parish}`
    : "School of Disciples desk";

  const text = [
    `Dear ${firstName},`,
    ``,
    headline,
    ``,
    body,
    note.text.trim(),
    campaignTextFooter({
      siteUrl: input.siteUrl,
      supportUrl: input.portalSupportUrl,
      portalUrl: input.portalUrl,
      unsubscribeUrl: input.unsubscribeUrl,
      orgAddress: config.orgAddress,
    }),
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#dde8e1;color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dde8e1;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <tr>
            <td style="padding:0 4px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#3d6b58;font-weight:700;">
                    School of Disciples
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(20,36,28,0.4);">
                    Desk note
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#0f2a22;padding:28px 26px;color:#f4f7f5;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8fb8a3;">
                ${escapeHtml(deskLabel)}
              </p>
              <p style="margin:14px 0 0;font-size:30px;line-height:1.08;letter-spacing:-0.03em;">
                ${name},
              </p>
              <p style="margin:10px 0 0;font-size:22px;line-height:1.2;color:#c5e0d2;">
                ${headlineSafe}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#95bfa8;height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="background:#fafcfb;padding:26px 26px 8px;border-left:1px solid #c5d6cc;border-right:1px solid #c5d6cc;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:rgba(20,36,28,0.82);">
              <p style="margin:0;">
                ${bodyHtml}
              </p>
              ${note.html}
              ${
                parishSafe
                  ? `<p style="margin:20px 0 0;font-size:13px;color:rgba(20,36,28,0.5);">
                Sent with care for ${parishSafe}.
              </p>`
                  : ""
              }
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
                <tr>
                  <td style="background:#0f2a22;">
                    <a href="${portalUrl}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#eef6f1;text-decoration:none;">
                      Open student portal →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#eef4f0;padding:16px 26px 20px;border:1px solid #c5d6cc;border-top:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:rgba(20,36,28,0.62);">
              This address is not monitored. To write back, open Support in the student portal.
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);">
              ${campaignHtmlFooterBlock({
                siteUrl: input.siteUrl,
                supportUrl: input.portalSupportUrl,
                unsubscribeUrl: input.unsubscribeUrl,
                year,
                orgAddress: config.orgAddress,
              })}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
