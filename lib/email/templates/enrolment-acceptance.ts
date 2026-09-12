export type EnrolmentAcceptanceInput = {
  firstName: string;
  email: string;
  reference: string;
  programmeLabel: string;
  /** Absolute URL — student portal login. */
  portalLoginUrl: string;
  /** Absolute URL — student payments page. */
  portalPaymentsUrl: string;
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

/** Application accepted — place offered; next step is programme fee. */
export function buildEnrolmentAcceptanceEmail(input: EnrolmentAcceptanceInput) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const email = escapeHtml(input.email.trim());
  const reference = escapeHtml(input.reference.trim());
  const programme = escapeHtml(
    input.programmeLabel.trim() || "School of Disciples",
  );
  const loginUrl = escapeHtml(input.portalLoginUrl.trim());
  const paymentsUrl = escapeHtml(input.portalPaymentsUrl.trim());
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();

  const subject = `${firstName}, your School of Disciples application is accepted — ${input.reference.trim()}`;

  const text = [
    `Dear ${firstName},`,
    ``,
    `Good news — your application to the School of Disciples has been accepted.`,
    ``,
    `Programme: ${input.programmeLabel}`,
    `Application reference: ${input.reference}`,
    `Sign-in email: ${input.email}`,
    ``,
    `Your place is offered. To secure it, please complete your £350 programme fee from the student portal (card or bank transfer).`,
    ``,
    `Pay or track fees: ${input.portalPaymentsUrl}`,
    `Sign in: ${input.portalLoginUrl}`,
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
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
          <tr>
            <td style="background:#0f2a22;padding:22px 28px 0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#8fb8a3;font-weight:700;">
                School of Disciples
              </p>
              <p style="margin:22px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8fb8a3;">
                Place offered
              </p>
              <p style="margin:16px 0 0;font-size:42px;line-height:0.95;letter-spacing:-0.04em;color:#f4f7f5;">
                ${name},
              </p>
              <p style="margin:8px 0 0;font-size:28px;line-height:1.05;letter-spacing:-0.03em;color:#c5e0d2;">
                you are accepted.
              </p>
            </td>
          </tr>

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
                      Accepted
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#0f2a22;padding:22px 28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:rgba(244,247,245,0.78);">
              Your application has been reviewed and accepted. A place is offered —
              secure it by completing your programme fee in the student portal.
            </td>
          </tr>

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

          <tr>
            <td style="background:#ffffff;padding:28px 24px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#5a8a74;font-weight:700;">
                Next step
              </p>
              <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(20,36,28,0.82);">
                Complete your <strong>£350 programme fee</strong> by card or bank transfer.
                Sign in with <strong>${email}</strong> using the password from your confirmation email
                (or reset it from the portal if needed).
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
                <tr>
                  <td style="background:#14352c;">
                    <a href="${paymentsUrl}" style="display:inline-block;padding:14px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.04em;text-decoration:none;color:#f4f7f5;">
                      Pay programme fee
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:rgba(20,36,28,0.55);">
                Or open the portal:
                <a href="${loginUrl}" style="color:#14352c;font-weight:600;">${loginUrl}</a>
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#eef3f0;padding:22px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:rgba(20,36,28,0.55);">
              Questions?
              <a href="${supportUrl}" style="color:#14352c;">Support in the student portal</a><br /><br />
              Automated notice — please do not reply.<br />
              School of Disciples · Belfast<br />
              <a href="${siteUrl}" style="color:inherit;">${siteUrl}</a>
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
