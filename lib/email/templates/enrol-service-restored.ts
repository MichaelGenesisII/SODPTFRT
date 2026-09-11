import { config } from "../config";

export type EnrolServiceRestoredInput = {
  firstName?: string;
  /** Human label for when the fault happened, e.g. "yesterday" or "Monday 7 September". */
  outageLabel: string;
  enrolUrl: string;
  supportUrl: string;
  siteUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const CHECK_BEFORE_SUBMIT = [
  "Full name — exactly as you want it on your certificate",
  "Postal address — complete and correct; we use it to send course books and materials",
] as const;

/** Apology + all-clear after an enrolment form outage (broadcast). */
export function buildEnrolServiceRestoredEmail(
  input: EnrolServiceRestoredInput,
): {
  subject: string;
  text: string;
  html: string;
} {
  const firstName = input.firstName?.trim() || "Student";
  const name = escapeHtml(firstName);
  const outage = input.outageLabel.trim();
  const outageSafe = escapeHtml(outage);
  const enrolUrl = escapeHtml(input.enrolUrl.trim());
  const supportUrl = escapeHtml(input.supportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();

  const subject = "Our apologies — enrolment is working again";

  const checkText = CHECK_BEFORE_SUBMIT.map((item) => `• ${item}`).join("\n");

  const text = [
    `Dear ${firstName},`,
    ``,
    `Greetings in the name of our Lord Jesus Christ.`,
    ``,
    `On ${outage}, a fault on our enrolment form stopped the address step from working. If you tried to enrol and could not finish, we are truly sorry. The problem was on our side — nothing you did caused it.`,
    ``,
    `The fault has been fixed and enrolment is fully working again.`,
    ``,
    `If your enrolment did not go through, it was not saved, so please start it again. It only takes a few minutes.`,
    ``,
    `Complete your enrolment: ${input.enrolUrl}`,
    ``,
    `Before you submit, please check:`,
    checkText,
    ``,
    `If you have any difficulty at all, we are here to help — reply to this email or visit Support on the portal: ${input.supportUrl}`,
    ``,
    `Thank you for your patience, and God bless you.`,
    `School of Disciples UK`,
    ``,
    `Website: ${input.siteUrl}`,
  ].join("\n");

  const checkRows = CHECK_BEFORE_SUBMIT.map(
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
                Enrolment update
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
                On ${outageSafe}, a fault on our enrolment form stopped the address step from working. If you tried to enrol and could not finish, <strong style="color:#0f2a22;">we are truly sorry</strong>. The problem was on our side — nothing you did caused it.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 22px;background:#eef4f0;border-left:4px solid #3d6b58;">
                <tr>
                  <td style="padding:16px 18px;font-size:15px;line-height:1.6;color:rgba(20,36,28,0.88);">
                    <strong style="display:block;margin:0 0 6px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#3d6b58;">
                      Now resolved
                    </strong>
                    The fault has been fixed and enrolment is fully working again.
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 22px;">
                If your enrolment did not go through, it was not saved — so please start it again. It only takes a few minutes.
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;">
                <tr>
                  <td style="background:#0f2a22;border-radius:2px;">
                    <a href="${enrolUrl}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#eef6f1;text-decoration:none;letter-spacing:0.02em;">
                      Complete your enrolment →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 22px;font-size:13px;line-height:1.55;color:rgba(20,36,28,0.58);">
                Or open this link: <a href="${enrolUrl}" style="color:#3d6b58;">${enrolUrl}</a>
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;background:#ffffff;border:1px solid #c5d6cc;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 12px;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#3d6b58;font-weight:700;">
                      Before you submit, please check
                    </p>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${checkRows}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#eef4f0;padding:22px 28px 24px;border:1px solid #c5d6cc;border-top:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(20,36,28,0.78);">
              <p style="margin:0 0 14px;">
                If you have any difficulty at all, we are here to help — reply to this email or visit <a href="${supportUrl}" style="color:#3d6b58;">Support on the portal</a>.
              </p>
              <p style="margin:0 0 6px;">Thank you for your patience, and God bless you.</p>
              <p style="margin:0;font-weight:600;color:#0f2a22;">School of Disciples UK</p>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);text-align:center;">
              <a href="${siteUrl}" style="color:#3d6b58;">${siteUrl}</a><br/>
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
