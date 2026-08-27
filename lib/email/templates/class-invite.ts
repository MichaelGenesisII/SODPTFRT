export type ClassInviteInput = {
  firstName: string;
  classTitle: string;
  whenLabel: string;
  durationMinutes: number;
  audienceLabel: string;
  portalClassesUrl: string;
  joinUrl?: string;
  passcode?: string;
  /** Desk-only — never rendered in the email body. */
  attendanceCode?: string;
  notes?: string;
  /** Absolute URL to /student/support (or public /support). */
  portalSupportUrl: string;
  /** Main public website (schoolofdisciples.org). */
  siteUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function buildClassInviteEmail(input: ClassInviteInput) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const title = escapeHtml(input.classTitle.trim());
  const when = escapeHtml(input.whenLabel.trim());
  const audience = escapeHtml(input.audienceLabel.trim());
  const portalUrl = escapeHtml(input.portalClassesUrl.trim());
  const joinUrl = input.joinUrl?.trim()
    ? escapeHtml(input.joinUrl.trim())
    : "";
  const passcode = input.passcode?.trim()
    ? escapeHtml(input.passcode.trim())
    : "";
  // Physical check-in codes are desk-only — never include in email body.
  const notes = input.notes?.trim() ? escapeHtml(input.notes.trim()) : "";
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();
  const duration = Math.max(0, Math.floor(input.durationMinutes));

  const subject = `${firstName}, you're invited: ${input.classTitle.trim()}`;

  const textParts = [
    `Dear ${firstName},`,
    ``,
    `You are invited to a School of Disciples class.`,
    ``,
    `Class: ${input.classTitle}`,
    `When: ${input.whenLabel}`,
    `Length: ${duration} minutes`,
    `Audience: ${input.audienceLabel}`,
  ];
  if (input.notes?.trim()) {
    textParts.push(``, input.notes.trim());
  }
  textParts.push(
    ``,
    `Open Classes in the portal (join in-browser or use the Zoom app):`,
    input.portalClassesUrl,
  );
  if (input.joinUrl?.trim()) {
    textParts.push(``, `Zoom link: ${input.joinUrl.trim()}`);
  }
  if (input.passcode?.trim()) {
    textParts.push(`Zoom passcode: ${input.passcode.trim()}`);
  }
  textParts.push(
    ``,
    `Questions: ${input.portalSupportUrl}`,
    ``,
    `With warmth,`,
    `School of Disciples · Belfast`,
    ``,
    `This is an automated message. Please do not reply to this email.`,
  );

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#e2ebe5;color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e2ebe5;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <tr>
            <td style="padding:0 4px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#3d6b58;font-weight:700;">
                    School of Disciples
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(20,36,28,0.4);">
                    Class invite
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Invitation ticket -->
          <tr>
            <td style="background:#0f2a22;padding:28px 26px;color:#f4f7f5;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8fb8a3;">
                You are invited
              </p>
              <p style="margin:12px 0 0;font-size:28px;line-height:1.1;letter-spacing:-0.03em;">
                ${name},
              </p>
              <p style="margin:10px 0 0;font-size:22px;line-height:1.2;color:#c5e0d2;">
                ${title}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:0;border-left:1px solid #c5d6cc;border-right:1px solid #c5d6cc;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:18px 22px;border-bottom:1px solid #e4ebe6;width:58%;vertical-align:top;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#5f8f7a;">
                      When
                    </p>
                    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:#14241c;">
                      ${when}
                    </p>
                  </td>
                  <td style="padding:18px 22px;border-bottom:1px solid #e4ebe6;border-left:1px solid #e4ebe6;width:42%;vertical-align:top;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#5f8f7a;">
                      Length
                    </p>
                    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#14241c;">
                      ${duration} minutes
                    </p>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding:16px 22px;border-bottom:1px dashed #c5d6cc;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#5f8f7a;">
                      Audience
                    </p>
                    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#14241c;">
                      ${audience}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#f7faf8;padding:22px 22px 8px;border-left:1px solid #c5d6cc;border-right:1px solid #c5d6cc;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(20,36,28,0.78);">
              <p style="margin:0;">
                Join from Classes in your student portal — in the browser or with the Zoom app.
              </p>
              ${
                notes
                  ? `<p style="margin:14px 0 0;padding:12px 14px;background:#ffffff;border-left:3px solid #95bfa8;color:rgba(20,36,28,0.75);">${notes}</p>`
                  : ""
              }
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 8px;">
                <tr>
                  <td style="background:#0f2a22;">
                    <a href="${portalUrl}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#eef6f1;text-decoration:none;">
                      Open Classes →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${
            joinUrl || passcode
              ? `<tr>
            <td style="background:#ffffff;padding:8px 22px 22px;border:1px solid #c5d6cc;border-top:0;">
              <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#5f8f7a;font-weight:700;">
                Zoom details
              </p>
              ${
                joinUrl
                  ? `<p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:rgba(20,36,28,0.75);word-break:break-all;">
                <a href="${joinUrl}" style="color:#0f2a22;text-decoration:underline;">${joinUrl}</a>
              </p>`
                  : ""
              }
              ${
                passcode
                  ? `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#14241c;">
                Passcode: <strong style="font-family:ui-monospace,Consolas,monospace;letter-spacing:0.06em;">${passcode}</strong>
              </p>`
                  : ""
              }
            </td>
          </tr>`
              : `<tr>
            <td style="border:1px solid #c5d6cc;border-top:0;font-size:0;line-height:0;height:1px;">&nbsp;</td>
          </tr>`
          }

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);">
              Questions?
              <a href="${supportUrl}" style="color:inherit;text-decoration:underline;">Support in the student portal</a><br /><br />
              Automated invite — please do not reply.<br />
              Belfast ·
              <a href="${siteUrl}" style="color:inherit;text-decoration:underline;">schoolofdisciples.org</a>
              · © ${year}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text: textParts.join("\n"), html };
}
