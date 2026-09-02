import { config } from "../config";

export type PortalMigrationEmailInput = {
  firstName?: string;
  enrolUrl: string;
  portalUrl: string;
  supportUrl: string;
  siteUrl: string;
  deadlineLabel: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const PORTAL_FEATURES = [
  "Complete your enrolment",
  "Receive updates and class notices",
  "Join Zoom classes",
  "Pay course fees securely",
  "Access course information",
] as const;

/** Legacy-form students → new portal enrolment (broadcast). */
export function buildPortalMigrationEmail(input: PortalMigrationEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const firstName = input.firstName?.trim() || "Student";
  const name = escapeHtml(firstName);
  const enrolUrl = escapeHtml(input.enrolUrl.trim());
  const portalUrl = escapeHtml(input.portalUrl.trim());
  const supportUrl = escapeHtml(input.supportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const deadline = escapeHtml(input.deadlineLabel.trim());
  const year = new Date().getFullYear();

  const subject =
    "Complete your enrolment on the new School of Disciples portal";

  const featureText = PORTAL_FEATURES.map((item) => `• ${item}`).join("\n");

  const text = [
    `Dear ${firstName},`,
    ``,
    `Greetings in the name of our Lord Jesus Christ.`,
    ``,
    `We are pleased to introduce the new School of Disciples Student Portal — your enrolment platform and hub for the school year.`,
    ``,
    `Through the portal you can:`,
    featureText,
    ``,
    `You previously submitted details on our earlier form. Please complete your enrolment on the new portal by ${input.deadlineLabel}, so we can have everything ready for you.`,
    ``,
    `Enrol now: ${input.enrolUrl}`,
    `Portal: ${input.portalUrl}`,
    ``,
    `Please ensure your full name matches how you want it on your certificate, and that your postal address is complete — we use it to send course books and materials.`,
    ``,
    `Thank you, and God bless you.`,
    `School of Disciples UK`,
    ``,
    `Questions: ${input.supportUrl}`,
    `Website: ${input.siteUrl}`,
    ``,
    `This is an automated message. Please do not reply to this email.`,
  ].join("\n");

  const featureRows = PORTAL_FEATURES.map(
    (item) => `<tr>
      <td width="22" valign="top" style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;color:#3d6b58;">✓</td>
      <td valign="top" style="padding:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:rgba(20,36,28,0.82);">${escapeHtml(item)}</td>
    </tr>`,
  ).join("");

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
            <td style="background:#0f2a22;padding:26px 28px 28px;color:#f4f7f5;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.26em;text-transform:uppercase;color:#8fb8a3;font-weight:700;">
                School of Disciples UK
              </p>
              <p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8fb8a3;">
                Student portal
              </p>
              <p style="margin:14px 0 0;font-size:34px;line-height:1.05;letter-spacing:-0.03em;color:#f4f7f5;">
                Dear ${name},
              </p>
              <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:rgba(244,247,245,0.82);">
                Greetings in the name of our Lord Jesus Christ.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#95bfa8;height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="background:#fafcfb;padding:28px 28px 8px;border-left:1px solid #c5d6cc;border-right:1px solid #c5d6cc;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:rgba(20,36,28,0.84);">
              <p style="margin:0 0 18px;">
                We are pleased to introduce the <strong style="color:#0f2a22;">new School of Disciples Student Portal</strong> — your enrolment platform and central hub for the school year.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#eef4f0;border:1px solid #c5d6cc;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0 0 12px;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#3d6b58;font-weight:700;">
                      Through the portal you can
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${featureRows}
                    </table>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#fff8ed;border-left:4px solid #c9a227;">
                <tr>
                  <td style="padding:16px 18px;font-size:14px;line-height:1.6;color:rgba(20,36,28,0.88);">
                    <strong style="display:block;margin:0 0 6px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#8a6d1a;">
                      Action needed
                    </strong>
                    You previously submitted details on our earlier form. Please <strong>complete your enrolment on the new portal by ${deadline}</strong>, so we can have everything ready for you.
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
                <tr>
                  <td style="background:#0f2a22;border-radius:2px;">
                    <a href="${enrolUrl}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#eef6f1;text-decoration:none;letter-spacing:0.02em;">
                      Complete your enrolment →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 18px;font-size:13px;line-height:1.55;color:rgba(20,36,28,0.58);">
                Or open the portal: <a href="${portalUrl}" style="color:#3d6b58;">${portalUrl}</a>
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;background:#ffffff;border:1px solid #c5d6cc;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 10px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#3d6b58;font-weight:700;">
                      Please double-check
                    </p>
                    <p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:rgba(20,36,28,0.78);">
                      <strong>Full name</strong> — exactly as you want it on your certificate.
                    </p>
                    <p style="margin:0;font-size:14px;line-height:1.55;color:rgba(20,36,28,0.78);">
                      <strong>Postal address</strong> — complete and correct; we use it to send course books and materials.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#eef4f0;padding:22px 28px 24px;border:1px solid #c5d6cc;border-top:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(20,36,28,0.78);">
              <p style="margin:0 0 6px;">Thank you, and God bless you.</p>
              <p style="margin:0;font-weight:600;color:#0f2a22;">School of Disciples UK</p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);text-align:center;">
              Questions? Visit <a href="${supportUrl}" style="color:#3d6b58;">Support on the portal</a>
              · <a href="${siteUrl}" style="color:#3d6b58;">${siteUrl}</a><br/>
              ${escapeHtml(config.orgAddress)} · © ${year} School of Disciples
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
