export type TeacherPaymentDetailsChangedInput = {
  teacherName: string;
  methodLabel: string;
  payeeMask: string;
  portalAccountUrl: string;
  siteUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Notify contact points when payee details change — never includes full bank/PayPal secrets. */
export function buildTeacherPaymentDetailsChangedEmail(
  input: TeacherPaymentDetailsChangedInput,
) {
  const name = escapeHtml(input.teacherName.trim() || "there");
  const method = escapeHtml(input.methodLabel);
  const mask = escapeHtml(input.payeeMask);
  const accountUrl = escapeHtml(input.portalAccountUrl);
  const siteUrl = escapeHtml(input.siteUrl);
  const year = new Date().getFullYear();

  const subject = "Your teacher payment details were updated";

  const text = [
    `Hello ${input.teacherName.trim() || "there"},`,
    "",
    "Payment details on your School of Disciples teacher account were just saved.",
    "",
    `Method: ${input.methodLabel}`,
    `On file (masked): ${input.payeeMask}`,
    "",
    "If you made this change, no action is needed.",
    "If you did not, sign in and update your details, and contact portal support.",
    "",
    `Payments: ${input.portalAccountUrl}`,
    "",
    `School of Disciples · ${input.siteUrl}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body style="margin:0;padding:0;background:#e8efe9;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e8efe9;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #d5ddd6;">
        <tr><td style="padding:28px 28px 8px;background:#14352c;">
          <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#95bfa8;">Teacher account</p>
          <h1 style="margin:12px 0 0;font-size:26px;line-height:1.15;color:#f4f7f5;font-weight:normal;">Payment details updated</h1>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">Hello ${name},</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.55;">Payment details on your teacher account were just saved.</p>
          <table role="presentation" width="100%" style="background:#f4f7f5;border:1px solid #d5ddd6;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 8px;font-size:14px;"><strong>Method</strong><br />${method}</p>
              <p style="margin:0;font-size:14px;"><strong>On file</strong><br />${mask}</p>
            </td></tr>
          </table>
          <p style="margin:18px 0 0;font-size:14px;line-height:1.5;">If you made this change, no action is needed. If you did not, open your account and contact support.</p>
          <p style="margin:22px 0 0;"><a href="${accountUrl}" style="display:inline-block;padding:12px 20px;background:#14352c;color:#f4f7f5;text-decoration:none;font-size:14px;">Open payments</a></p>
        </td></tr>
        <tr><td style="padding:0 28px 24px;font-size:12px;color:#5a655e;">
          <p style="margin:0;">School of Disciples · <a href="${siteUrl}" style="color:#14352c;">${siteUrl}</a> · ${year}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
