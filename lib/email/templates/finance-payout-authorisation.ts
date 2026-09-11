export type FinancePayoutAuthorisationInput = {
  payeeName: string;
  amountLabel: string;
  reason: string;
  requesterName: string;
  requestedAtLabel: string;
  emailCode: string;
  declineUrl: string;
  siteUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Authorisation request to the fixed authoriser mailbox — never the finance user. */
export function buildFinancePayoutAuthorisationEmail(
  input: FinancePayoutAuthorisationInput,
) {
  const payee = escapeHtml(input.payeeName);
  const amount = escapeHtml(input.amountLabel);
  const reason = escapeHtml(input.reason || "Teacher pay");
  const requester = escapeHtml(input.requesterName);
  const when = escapeHtml(input.requestedAtLabel);
  const code = escapeHtml(input.emailCode);
  const declineUrl = escapeHtml(input.declineUrl);
  const siteUrl = escapeHtml(input.siteUrl);
  const year = new Date().getFullYear();

  const subject = `Authorise payment · ${input.payeeName} · ${input.amountLabel}`;

  const text = [
    "Payment authorisation request",
    "",
    `Payee: ${input.payeeName}`,
    `Amount: ${input.amountLabel}`,
    `Reason: ${input.reason || "Teacher pay"}`,
    `Requested by: ${input.requesterName}`,
    `Requested at: ${input.requestedAtLabel}`,
    "",
    `One-time code: ${input.emailCode}`,
    "",
    "Give this code to the finance desk only if you approve this payment.",
    "They will also need a current authenticator code from you.",
    "",
    `Decline this payment (one tap): ${input.declineUrl}`,
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
          <p style="margin:0;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#95bfa8;">Authorisation</p>
          <h1 style="margin:12px 0 0;font-size:26px;line-height:1.15;color:#f4f7f5;font-weight:normal;">Approve this payment?</h1>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 18px;font-size:16px;line-height:1.55;">Finance has prepared a payment. Review the details, then either share the code or decline.</p>
          <table role="presentation" width="100%" style="background:#f4f7f5;border:1px solid #d5ddd6;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#5f8f7a;">Details</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Payee</strong><br />${payee}</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Amount</strong><br />${amount}</p>
              <p style="margin:0 0 8px;font-size:15px;"><strong>Reason</strong><br />${reason}</p>
              <p style="margin:0;font-size:14px;color:#5a655e;">Requested by ${requester} · ${when}</p>
            </td></tr>
          </table>
          <table role="presentation" width="100%" style="margin-top:16px;background:#14352c;">
            <tr><td style="padding:16px 18px;">
              <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#95bfa8;">One-time code</p>
              <p style="margin:0;font-size:28px;letter-spacing:0.12em;font-family:ui-monospace,monospace;color:#f4f7f5;">${code}</p>
            </td></tr>
          </table>
          <p style="margin:18px 0 0;font-size:14px;line-height:1.5;">If you approve, give this code to finance. They will also need a current authenticator code from your phone.</p>
          <p style="margin:22px 0 0;"><a href="${declineUrl}" style="display:inline-block;padding:12px 20px;background:#7f1d1d;color:#f4f7f5;text-decoration:none;font-size:14px;">Decline this payment</a></p>
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

export type FinancePayoutFreezeNoticeInput = {
  payeeName: string;
  amountLabel: string;
  siteUrl: string;
};

export function buildFinancePayoutFreezeNoticeEmail(
  input: FinancePayoutFreezeNoticeInput,
) {
  const payee = escapeHtml(input.payeeName);
  const amount = escapeHtml(input.amountLabel);
  const siteUrl = escapeHtml(input.siteUrl);

  const subject = `Payment frozen after failed codes · ${input.payeeName}`;

  const text = [
    "A payment authorisation was frozen after too many incorrect code attempts.",
    "",
    `Payee: ${input.payeeName}`,
    `Amount: ${input.amountLabel}`,
    "",
    "No money was sent. Finance must raise a fresh authorisation request if this payment should proceed.",
    "",
    `School of Disciples · ${input.siteUrl}`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:24px;font-family:Georgia,serif;background:#e8efe9;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #d5ddd6;padding:24px;">
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#5f8f7a;">Security notice</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#14352c;font-weight:normal;">Payment frozen</h1>
    <p style="margin:0 0 12px;line-height:1.5;">Too many incorrect codes were entered for <strong>${payee}</strong> · ${amount}.</p>
    <p style="margin:0 0 12px;line-height:1.5;">No money was sent. A fresh authorisation request is required before this can proceed.</p>
    <p style="margin:0;font-size:12px;color:#5a655e;">School of Disciples · <a href="${siteUrl}" style="color:#14352c;">${siteUrl}</a></p>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
