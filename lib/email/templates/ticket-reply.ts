export type TicketReplyTemplateInput = {
  toName: string;
  subject: string;
  message: string;
  reference: string;
  topic: string;
  adminName?: string;
  /** Absolute URL to continue the conversation (student or public support). */
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

function formatMessageHtml(message: string): string {
  return escapeHtml(message).replaceAll("\n", "<br />");
}

/** Listening Desk reply — NoReply by design; continue via portal Support. */
export function buildTicketReplyEmail(input: TicketReplyTemplateInput) {
  const name = escapeHtml(input.toName.trim() || "friend");
  const subject = input.subject.trim();
  const reference = escapeHtml(input.reference);
  const topic = escapeHtml(input.topic);
  const messageHtml = formatMessageHtml(input.message.trim());
  const admin = escapeHtml(input.adminName?.trim() || "the Listening Desk");
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();

  const text = [
    `Dear ${input.toName.trim() || "friend"},`,
    ``,
    input.message.trim(),
    ``,
    `—`,
    `${input.adminName?.trim() || "Listening Desk"}`,
    `School of Disciples · Listening Desk`,
    `Reference: ${input.reference}`,
    `Topic: ${input.topic}`,
    ``,
    `This mailbox does not accept replies.`,
    `To continue the conversation, open Support: ${input.portalSupportUrl}`,
    ``,
    `School of Disciples · Belfast`,
    `schoolofdisciples.org`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#e6ebe7;color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e6ebe7;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <tr>
            <td style="padding:0 4px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#3d6b58;font-weight:700;">
                    School of Disciples
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(20,36,28,0.4);">
                    Listening Desk
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Letter head -->
          <tr>
            <td style="background:#0f2a22;padding:26px 26px 20px;color:#f4f7f5;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8fb8a3;">
                A note for you
              </p>
              <p style="margin:12px 0 0;font-size:30px;line-height:1.1;letter-spacing:-0.03em;">
                Dear ${name},
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#95bfa8;height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Message body -->
          <tr>
            <td style="background:#fafcfb;padding:26px 26px 8px;border-left:1px solid #c5d6cc;border-right:1px solid #c5d6cc;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:rgba(20,36,28,0.84);">
                ${messageHtml}
              </div>
              <p style="margin:28px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:rgba(20,36,28,0.65);">
                With care,<br />
                <span style="color:#0f2a22;font-weight:600;">${admin}</span><br />
                Listening Desk
              </p>
            </td>
          </tr>

          <!-- Meta stub -->
          <tr>
            <td style="background:#ffffff;padding:18px 26px;border-left:1px solid #c5d6cc;border-right:1px solid #c5d6cc;border-top:1px dashed #c5d6cc;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#14241c;width:50%;">
                    <span style="display:block;letter-spacing:0.14em;text-transform:uppercase;color:#5f8f7a;font-size:10px;margin-bottom:4px;">Reference</span>
                    <span style="font-family:ui-monospace,Consolas,monospace;color:#0f2a22;">${reference}</span>
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#14241c;width:50%;">
                    <span style="display:block;letter-spacing:0.14em;text-transform:uppercase;color:#5f8f7a;font-size:10px;margin-bottom:4px;">Topic</span>
                    <span style="color:#0f2a22;">${topic}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#eef4f0;padding:18px 26px 22px;border:1px solid #c5d6cc;border-top:0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#3d6b58;font-weight:700;">
                Continue here — do not reply to this email
              </p>
              <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:rgba(20,36,28,0.72);">
                This address is not monitored. To write back, open Support on the portal.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0 0;">
                <tr>
                  <td style="background:#0f2a22;">
                    <a href="${supportUrl}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#eef6f1;text-decoration:none;">
                      Open Support →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);">
              Listening Desk notice — please do not reply.<br />
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

  return { subject, text, html };
}
