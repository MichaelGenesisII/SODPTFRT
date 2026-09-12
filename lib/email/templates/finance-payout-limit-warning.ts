export type FinancePayoutLimitWarningInput = {
  financeName: string;
  financeEmail: string;
  attemptedAmountLabel: string;
  limitLabel: string;
  payeeName: string;
  reason: string;
  attemptedAtLabel: string;
  siteUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Alert to FINANCE_APPROVER_EMAIL when finance tries to send above the desk limit. */
export function buildFinancePayoutLimitWarningEmail(
  input: FinancePayoutLimitWarningInput,
) {
  const financeName = escapeHtml(input.financeName);
  const financeEmail = escapeHtml(input.financeEmail);
  const amount = escapeHtml(input.attemptedAmountLabel);
  const limit = escapeHtml(input.limitLabel);
  const payee = escapeHtml(input.payeeName);
  const reason = escapeHtml(input.reason || "Payment");
  const when = escapeHtml(input.attemptedAtLabel);
  const siteUrl = escapeHtml(input.siteUrl);
  const year = new Date().getFullYear();

  const subject = `Payment blocked · over ${input.limitLabel} · ${input.financeName}`;

  const text = [
    "Payment amount limit — blocked",
    "",
    "A finance admin tried to send or record a payment above the desk limit.",
    "The payment was not created and no money was sent.",
    "",
    `Finance admin: ${input.financeName} <${input.financeEmail}>`,
    `Attempted amount: ${input.attemptedAmountLabel}`,
    `Desk limit: ${input.limitLabel}`,
    `Payee: ${input.payeeName}`,
    `Reason: ${input.reason || "Payment"}`,
    `When: ${input.attemptedAtLabel}`,
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
        <tr><td style="padding:28px 28px 8px;background:#7f1d1d;">
          <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#f5c2c2;">Warning</p>
          <h1 style="margin:12px 0 0;font-size:26px;line-height:1.15;color:#f4f7f5;font-weight:normal;">Payment blocked — over limit</h1>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">A finance admin tried to send or record a payment above the desk limit of <strong>${limit}</strong>. The payment was <strong>not</strong> created and no money was sent.</p>
          <table role="presentation" width="100%" style="background:#f4f7f5;border:1px solid #d5ddd6;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#5f8f7a;">Attempt</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Finance admin</strong><br />${financeName}<br /><span style="color:#5a655e;">${financeEmail}</span></p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Attempted amount</strong><br />${amount}</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Desk limit</strong><br />${limit}</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Payee</strong><br />${payee}</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Reason</strong><br />${reason}</p>
              <p style="margin:0;font-size:14px;color:#5a655e;">${when}</p>
            </td></tr>
          </table>
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
