export type EnrolmentAccessRecoveryInput = {
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

/**
 * Fresh portal access for someone already enrolled — key-renewed layout.
 * Visually distinct from first-time application confirmation.
 */
export function buildEnrolmentAccessRecoveryEmail(
  input: EnrolmentAccessRecoveryInput,
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

  const subject = `${firstName}, your School of Disciples portal access has been refreshed`;

  const text = [
    `Dear ${firstName},`,
    ``,
    `You already have an application with the School of Disciples.`,
    `Someone (hopefully you) asked for fresh student portal access for ${input.email}.`,
    ``,
    `Programme: ${input.programmeLabel}`,
    `Application reference: ${input.reference}`,
    ``,
    `Your previous temporary password no longer works.`,
    `Use these new credentials to sign in:`,
    `Email: ${input.email}`,
    `New temporary password: ${input.temporaryPassword}`,
    `Sign in: ${input.portalLoginUrl}`,
    ``,
    `You can change this password anytime after signing in.`,
    ``,
    `If you did not request this, open Support in the student portal straight away: ${input.portalSupportUrl}`,
    ``,
    `Questions: ${input.portalSupportUrl}`,
    ``,
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
<body style="margin:0;padding:0;background:#e4e9ed;color:#1a2228;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e4e9ed;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Slim brand -->
          <tr>
            <td style="padding:0 4px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#3d6b7a;font-weight:700;">
                    School of Disciples
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(26,34,40,0.4);">
                    Access recovery
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Split header: ink + slate -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="58%" valign="top" style="background:#1a2f38;color:#eef3f5;padding:32px 26px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#7eb0c0;">
                      Already on file
                    </p>
                    <p style="margin:16px 0 0;font-size:30px;line-height:1.05;letter-spacing:-0.03em;">
                      ${name},
                    </p>
                    <p style="margin:10px 0 0;font-size:22px;line-height:1.15;letter-spacing:-0.02em;color:#a8d0dc;">
                      your key is renewed.
                    </p>
                  </td>
                  <td width="42%" valign="middle" align="center" style="background:#2a4a56;padding:28px 16px;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="width:72px;height:72px;border:2px solid #7eb0c0;border-radius:50%;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#c5e4ec;line-height:1.2;">
                          <br />New<br />key
                        </td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;color:rgba(238,243,245,0.65);">
                      Old password<br />retired
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;border-left:1px solid #c8d2d8;border-right:1px solid #c8d2d8;padding:26px 26px 10px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(26,34,40,0.78);">
              You already have an application with the School — there is no need to enrol again.
              Someone (hopefully you) asked for fresh student portal access for
              <strong style="color:#1a2f38;">${email}</strong>.
            </td>
          </tr>

          <!-- Existing file strip -->
          <tr>
            <td style="background:#ffffff;border-left:1px solid #c8d2d8;border-right:1px solid #c8d2d8;padding:18px 26px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf3f5;">
                <tr>
                  <td style="padding:16px 18px;border-bottom:1px solid #d5e0e5;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#3d6b7a;font-weight:700;">
                      Application still on file
                    </p>
                    <p style="margin:8px 0 0;font-family:ui-monospace,Consolas,'Courier New',monospace;font-size:18px;letter-spacing:0.08em;color:#1a2f38;">
                      ${reference}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:14px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a2f38;">
                    ${programme}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;border-left:1px solid #c8d2d8;border-right:1px solid #c8d2d8;padding:20px 26px 8px;font-size:18px;line-height:1.35;color:#1a2f38;">
              Your previous temporary password no longer works.
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border-left:1px solid #c8d2d8;border-right:1px solid #c8d2d8;padding:8px 26px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:rgba(26,34,40,0.68);">
              Use the new details below to sign in, track payment, and continue where you left off.
            </td>
          </tr>

          <!-- Credential stack -->
          <tr>
            <td style="background:#ffffff;border-left:1px solid #c8d2d8;border-right:1px solid #c8d2d8;padding:4px 26px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#1a2f38;padding:14px 18px;border-bottom:1px solid rgba(126,176,192,0.25);">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#7eb0c0;">
                      Sign-in email
                    </p>
                    <p style="margin:6px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#eef3f5;word-break:break-all;">
                      ${email}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background:#1a2f38;padding:14px 18px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#7eb0c0;">
                      New temporary password
                    </p>
                    <p style="margin:6px 0 0;font-family:ui-monospace,Consolas,'Courier New',monospace;font-size:17px;letter-spacing:0.08em;color:#a8d0dc;word-break:break-all;">
                      ${password}
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
                <tr>
                  <td align="center" style="background:#3d6b7a;">
                    <a href="${loginUrl}"
                       style="display:block;padding:15px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;">
                      Sign in with your new key →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Security seal -->
          <tr>
            <td style="background:#2a4a56;padding:22px 26px;border-left:4px solid #7eb0c0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#a8d0dc;font-weight:700;">
                Security
              </p>
              <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:rgba(238,243,245,0.85);">
                If you did not ask for fresh access, open
                <a href="${supportUrl}" style="color:#c5e4ec;text-decoration:underline;">Support in the student portal</a>
                straight away. Your earlier temporary password has been replaced.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:rgba(26,34,40,0.48);">
              Questions?
              <a href="${supportUrl}" style="color:#1a2f38;text-decoration:underline;">Support in the student portal</a><br /><br />
              Automated access message — please do not reply.<br />
              Belfast ·
              <a href="${siteUrl}" style="color:#1a2f38;text-decoration:underline;">schoolofdisciples.org</a>
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
