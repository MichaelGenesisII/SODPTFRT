export type TeacherPayoutPaidInput = {
  teacherName: string;
  amountLabel: string;
  periodLabel: string;
  methodLabel: string;
  paidAtLabel: string;
  reason: string;
  portalPaymentsUrl: string;
  siteUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Sent only when a payout reaches provider-confirmed (or outside) paid. */
export function buildTeacherPayoutPaidEmail(input: TeacherPayoutPaidInput) {
  const name = escapeHtml(input.teacherName || "Teacher");
  const amount = escapeHtml(input.amountLabel);
  const period = escapeHtml(input.periodLabel);
  const method = escapeHtml(input.methodLabel);
  const when = escapeHtml(input.paidAtLabel);
  const reason = escapeHtml(input.reason || "Teacher pay");
  const paymentsUrl = escapeHtml(input.portalPaymentsUrl);
  const siteUrl = escapeHtml(input.siteUrl);
  const year = new Date().getFullYear();

  const subject = `Payment received · ${input.periodLabel} · ${input.amountLabel}`;

  const text = [
    `Hello ${input.teacherName || "Teacher"},`,
    "",
    "A teacher payment has been released to you.",
    "",
    `Period: ${input.periodLabel}`,
    `Amount: ${input.amountLabel}`,
    `Method: ${input.methodLabel}`,
    `Paid: ${input.paidAtLabel}`,
    `Reason: ${input.reason || "Teacher pay"}`,
    "",
    `View your payment history: ${input.portalPaymentsUrl}`,
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
          <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#95bfa8;">Teacher pay</p>
          <h1 style="margin:12px 0 0;font-size:26px;line-height:1.15;color:#f4f7f5;font-weight:normal;">Payment received</h1>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">Hello ${name}, a payment for your teaching has been released.</p>
          <table role="presentation" width="100%" style="background:#f4f7f5;border:1px solid #d5ddd6;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#5f8f7a;">Remittance</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Period</strong><br />${period}</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Amount</strong><br />${amount}</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Method</strong><br />${method}</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Paid</strong><br />${when}</p>
              <p style="margin:0;font-size:15px;"><strong>Reason</strong><br />${reason}</p>
            </td></tr>
          </table>
          <p style="margin:22px 0 0;">
            <a href="${paymentsUrl}" style="display:inline-block;background:#14352c;color:#f4f7f5;text-decoration:none;padding:12px 18px;font-size:14px;">View payment history</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 28px 28px;border-top:1px solid #d5ddd6;">
          <p style="margin:0;font-size:12px;color:#5a655e;">School of Disciples · ${siteUrl} · ${year}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
