/**
 * Client-safe campaign HTML preview (mirrors portal campaign template).
 * Sample data only — never includes real student PII.
 */

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function noteHtml(note?: string) {
  const trimmed = note?.trim();
  if (!trimmed) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
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
  </table>`;
}

export type CampaignPreviewInput = {
  personalNote?: string;
  customSubject?: string;
  customHeadline?: string;
  customBody?: string;
  sampleFirstName?: string;
  sampleParishName?: string;
};

export function buildCampaignPreview(input: CampaignPreviewInput): {
  subject: string;
  html: string;
} {
  const firstName = input.sampleFirstName?.trim() || "Alex";
  const name = escapeHtml(firstName);
  const parish = input.sampleParishName?.trim() || "Belfast Central";
  const parishSafe = escapeHtml(parish);
  const year = new Date().getFullYear();
  const note = noteHtml(input.personalNote);
  const subject =
    input.customSubject?.trim() || "A note from School of Disciples";
  const headline = input.customHeadline?.trim() || "A message for you";
  const body =
    input.customBody?.trim() ||
    "Your School of Disciples desk has sent you an update.";
  const headlineSafe = escapeHtml(headline);
  const bodyHtml = escapeHtml(body).replaceAll("\n", "<br/>");
  const deskLabel = `Parish desk · ${parishSafe}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#dde8e1;color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dde8e1;padding:18px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="padding:0 4px 12px;">
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
            <td style="background:#0f2a22;padding:26px 24px;color:#f4f7f5;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8fb8a3;">
                ${deskLabel}
              </p>
              <p style="margin:12px 0 0;font-size:28px;line-height:1.08;letter-spacing:-0.03em;">
                ${name},
              </p>
              <p style="margin:8px 0 0;font-size:20px;line-height:1.2;color:#c5e0d2;">
                ${headlineSafe}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#95bfa8;height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background:#fafcfb;padding:22px 24px 8px;border-left:1px solid #c5d6cc;border-right:1px solid #c5d6cc;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:rgba(20,36,28,0.82);">
              <p style="margin:0;">${bodyHtml}</p>
              ${note}
              <p style="margin:18px 0 0;font-size:13px;color:rgba(20,36,28,0.5);">
                Sent with care for ${parishSafe}.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;">
                <tr>
                  <td style="background:#0f2a22;">
                    <span style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#eef6f1;">
                      Open student portal →
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#eef4f0;padding:14px 24px 18px;border:1px solid #c5d6cc;border-top:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:rgba(20,36,28,0.62);">
              This address is not monitored. To write back, open Support in the student portal.
            </td>
          </tr>
          <tr>
            <td style="padding:14px 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);">
              Questions? Support in the student portal<br /><br />
              Preview only · Belfast · schoolofdisciples.org · © ${year}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
