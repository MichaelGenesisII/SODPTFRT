export type EnrolmentConfirmationInput = {
  firstName: string;
  email: string;
  reference: string;
  temporaryPassword: string;
  programmeLabel: string;
  /** Absolute URL — built from portal env (NEXT_PUBLIC_APP_URL / EMAIL_PORTAL_URL). */
  portalLoginUrl: string;
  /** Absolute URL to /student/support — questions go here, not a mailbox. */
  portalSupportUrl: string;
  /** Main public website (schoolofdisciples.org), not the student portal. */
  siteUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** First-time application confirmation — path-opened layout + credentials. */
export function buildEnrolmentConfirmationEmail(
  input: EnrolmentConfirmationInput,
) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const email = escapeHtml(input.email.trim());
  const reference = escapeHtml(input.reference.trim());
  const password = escapeHtml(input.temporaryPassword);
  const programme = escapeHtml(
    input.programmeLabel.trim() || "School of Disciples",
  );
  const loginUrl = escapeHtml(input.portalLoginUrl.trim());
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();

  const subject = `${firstName}, your School of Disciples application is received — ${input.reference.trim()}`;

  const text = [
    `Dear ${firstName},`,
    ``,
    `Thank you for beginning the journey with the School of Disciples.`,
    `We have received your application for ${input.programmeLabel}.`,
    ``,
    `Your application reference: ${input.reference}`,
    ``,
    `Your student portal is ready:`,
    `Sign-in email: ${input.email}`,
    `Temporary password: ${input.temporaryPassword}`,
    `Sign in: ${input.portalLoginUrl}`,
    ``,
    `You can change your password anytime after signing in.`,
    `From the portal you can track your application, pay by card, or upload bank-transfer proof.`,
    ``,
    `We will share further information within 2 business days.`,
    ``,
    `Questions: open Support in the student portal — ${input.portalSupportUrl}`,
    ``,
    `With warmth,`,
    `School of Disciples`,
    `Belfast`,
    ``,
    `This is an automated message. Please do not reply to this email.`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#dfe8e2;color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dfe8e2;padding:28px 14px;">
    <tr>
      <td align="center">
        <!-- One card width for the whole header — avoids full-bleed + narrow “T” -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
          <!-- Unified dark header block -->
          <tr>
            <td style="background:#0f2a22;padding:22px 28px 0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#8fb8a3;font-weight:700;">
                School of Disciples
              </p>
              <p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8fb8a3;">
                A path has opened
              </p>
              <p style="margin:16px 0 0;font-size:42px;line-height:0.95;letter-spacing:-0.04em;color:#f4f7f5;">
                ${name},
              </p>
              <p style="margin:8px 0 0;font-size:28px;line-height:1.05;letter-spacing:-0.03em;color:#c5e0d2;">
                we received you.
              </p>
            </td>
          </tr>

          <!-- Programme ticket -->
          <tr>
            <td style="background:#0f2a22;padding:22px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1a3d32;border:1px solid rgba(143,184,163,0.35);">
                <tr>
                  <td width="8" style="background:#8fb8a3;font-size:0;line-height:0;">&nbsp;</td>
                  <td style="padding:18px 20px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(244,247,245,0.45);">
                      Programme
                    </p>
                    <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.35;color:#f4f7f5;font-weight:600;">
                      ${programme}
                    </p>
                  </td>
                  <td align="right" style="padding:18px 20px 18px 8px;vertical-align:middle;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(244,247,245,0.45);">
                      Status
                    </p>
                    <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8fb8a3;font-weight:700;">
                      Received
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#0f2a22;padding:22px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:rgba(244,247,245,0.78);">
              Thank you for beginning with the School of Disciples. Your application
              is safely with us — and your student portal is already open.
            </td>
          </tr>

          <!-- Reference as perforated stub -->
          <tr>
            <td style="background:#f4f7f5;padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:28px 24px 8px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#5a8a74;font-weight:700;">
                      Keep this reference
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 24px 8px;">
                    <p style="margin:0;font-family:ui-monospace,Consolas,'Courier New',monospace;font-size:26px;letter-spacing:0.1em;color:#0f2a22;font-weight:700;">
                      ${reference}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:rgba(20,36,28,0.58);">
                    Use it for bank transfers and whenever you write to the School.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Dashed divider (email-safe) -->
          <tr>
            <td style="background:#f4f7f5;padding:0 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:2px dashed #b8cfc3;font-size:0;line-height:0;height:2px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Key card credentials -->
          <tr>
            <td style="background:#f4f7f5;padding:24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #c5d6cc;">
                <tr>
                  <td colspan="2" style="padding:20px 22px 6px;border-bottom:1px solid #e4ece7;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#5a8a74;font-weight:700;">
                      Your temporary key
                    </p>
                    <p style="margin:8px 0 12px;font-size:20px;line-height:1.25;letter-spacing:-0.02em;color:#0f2a22;">
                      Sign in, then change it anytime.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="width:50%;padding:18px 22px;border-right:1px solid #e4ece7;vertical-align:top;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(20,36,28,0.4);">
                      Email
                    </p>
                    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;color:#0f2a22;word-break:break-all;">
                      <a href="mailto:${email}" style="color:#0f2a22;text-decoration:none;">${email}</a>
                    </p>
                  </td>
                  <td style="width:50%;padding:18px 22px;vertical-align:top;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(20,36,28,0.4);">
                      Password
                    </p>
                    <p style="margin:8px 0 0;font-family:ui-monospace,Consolas,'Courier New',monospace;font-size:15px;letter-spacing:0.06em;color:#1f6b52;word-break:break-all;">
                      ${password}
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;">
                <tr>
                  <td align="center" style="background:#1f6b52;">
                    <a href="${loginUrl}"
                       style="display:block;padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;letter-spacing:0.02em;color:#ffffff;text-decoration:none;">
                      Enter your student portal
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Path spine -->
          <tr>
            <td style="background:#ffffff;padding:28px 24px 8px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#5a8a74;font-weight:700;">
                The next three steps
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:12px 24px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="36" valign="top" style="padding:0 12px 18px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td align="center" style="width:28px;height:28px;background:#0f2a22;color:#f4f7f5;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:28px;">1</td>
                    </tr></table>
                  </td>
                  <td valign="top" style="padding:4px 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#14241c;border-left:2px solid #c5d6cc;padding-left:16px;">
                    <strong style="color:#0f2a22;">Sign in</strong> and review where your application stands.
                  </td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 12px 18px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td align="center" style="width:28px;height:28px;background:#1f6b52;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:28px;">2</td>
                    </tr></table>
                  </td>
                  <td valign="top" style="padding:4px 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#14241c;border-left:2px solid #c5d6cc;padding-left:16px;">
                    <strong style="color:#0f2a22;">Settle fees</strong> by card, or upload bank-transfer proof when ready.
                  </td>
                </tr>
                <tr>
                  <td width="36" valign="top" style="padding:0 12px 0 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                      <td align="center" style="width:28px;height:28px;background:#8fb8a3;color:#0f2a22;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;line-height:28px;">3</td>
                    </tr></table>
                  </td>
                  <td valign="top" style="padding:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#14241c;padding-left:16px;">
                    <strong style="color:#0f2a22;">Wait for word</strong> — we typically write within 2 business days.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Closing -->
          <tr>
            <td style="background:#e8f0eb;padding:22px 24px;font-size:17px;line-height:1.45;color:#0f2a22;border-top:1px solid #c5d6cc;">
              ${name}, a door has opened. Walk through when you are ready.
            </td>
          </tr>

          <tr>
            <td style="padding:22px 20px 36px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);">
              Questions?
              <a href="${supportUrl}" style="color:#0f2a22;text-decoration:underline;">Support in the student portal</a><br /><br />
              Automated confirmation — please do not reply.<br />
              Belfast ·
              <a href="${siteUrl}" style="color:#0f2a22;text-decoration:underline;">schoolofdisciples.org</a>
              · © ${year}
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
