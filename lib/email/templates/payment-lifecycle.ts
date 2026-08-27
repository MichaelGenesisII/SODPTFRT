import { config } from "../config";
import { orgAddressLine } from "./shared-footer";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type PaymentFeeType = "tuition" | "graduation";

export type PaymentMailInput = {
  firstName: string;
  feeLabel: string;
  amountLabel: string;
  reference: string;
  methodLabel: string;
  portalPaymentsUrl: string;
  /** Absolute URL to /student/support — questions go here, not a mailbox. */
  portalSupportUrl: string;
  /** Main public website (schoolofdisciples.org), not the student portal. */
  siteUrl: string;
  /** Drives fee-specific next-step copy (tuition vs graduation). */
  feeType?: PaymentFeeType;
};

function isGraduationFee(input: PaymentMailInput): boolean {
  if (input.feeType === "graduation") return true;
  if (input.feeType === "tuition") return false;
  return /graduation/i.test(input.feeLabel);
}

function paidNextStep(input: PaymentMailInput): string {
  if (isGraduationFee(input)) {
    return "Next on your path: upload your graduation selfie from the payments page when you are ready.";
  }
  return "This payment counts toward your tuition. Track your balance anytime from your student portal.";
}

function paymentTextCloser(supportUrl: string, siteUrl: string, why: string): string {
  return [
    `Questions: ${supportUrl}`,
    ``,
    orgAddressLine(config.orgAddress),
    siteUrl,
    ``,
    why,
    `This is an automated message. Please do not reply to this email.`,
  ].join("\n");
}

function paymentFooter(supportUrl: string, siteUrl: string, year: number): string {
  const address = escapeHtml(orgAddressLine(config.orgAddress));
  return `You received this because of a payment update on your School of Disciples enrolment.<br /><br />
              Questions?
              <a href="${supportUrl}" style="color:inherit;text-decoration:underline;">Support in the student portal</a><br /><br />
              Automated payment notice — please do not reply.<br />
              ${address}<br />
              <a href="${siteUrl}" style="color:inherit;text-decoration:underline;">schoolofdisciples.org</a>
              · © ${year}`;
}

function detailRow(label: string, valueHtml: string): string {
  return `<tr>
    <td style="padding:10px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(20,36,28,0.45);border-bottom:1px solid #e4ebe6;width:38%;">${label}</td>
    <td style="padding:10px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#14241c;border-bottom:1px solid #e4ebe6;text-align:right;">${valueHtml}</td>
  </tr>`;
}

/** Card / Stripe (or already-paid bank) confirmation — works for application & graduation. */
export function buildPaymentReceivedEmail(input: PaymentMailInput) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const fee = escapeHtml(input.feeLabel.trim());
  const amount = escapeHtml(input.amountLabel.trim());
  const method = escapeHtml(input.methodLabel.trim());
  const reference = escapeHtml(input.reference.trim());
  const paymentsUrl = escapeHtml(input.portalPaymentsUrl.trim());
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();
  const graduation = isGraduationFee(input);
  const nextStep = paidNextStep(input);

  const subject = `${firstName}, payment received — ${input.feeLabel}`;
  const text = [
    `Dear ${firstName},`,
    ``,
    `We have received your ${input.feeLabel} payment of ${input.amountLabel} via ${input.methodLabel}.`,
    `Reference: ${input.reference}`,
    ``,
    nextStep,
    `Track payments: ${input.portalPaymentsUrl}`,
    ``,
    paymentTextCloser(
      input.portalSupportUrl,
      input.siteUrl,
      "You received this because a payment was recorded on your enrolment.",
    ),
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#d8e4dc;color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#d8e4dc;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">

          <tr>
            <td style="padding:0 4px 14px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#3d6b58;font-weight:700;">
              School of Disciples
            </td>
          </tr>

          <!-- Receipt header -->
          <tr>
            <td style="background:#0e2a22;padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:28px 26px 22px;" width="58%" valign="top">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#8fb8a3;">
                      ${graduation ? "Graduation ledger" : "Application ledger"}
                    </p>
                    <p style="margin:14px 0 0;font-size:34px;line-height:1;letter-spacing:-0.03em;color:#f4f7f5;">
                      ${name},
                    </p>
                    <p style="margin:8px 0 0;font-size:22px;line-height:1.15;letter-spacing:-0.02em;color:#b8d9c8;">
                      payment received.
                    </p>
                  </td>
                  <td style="padding:22px 20px;background:#163a30;" width="42%" valign="middle" align="center">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#8fb8a3;">
                      Amount
                    </p>
                    <p style="margin:10px 0 0;font-size:36px;line-height:1;letter-spacing:-0.04em;color:#eef6f1;font-family:Georgia,'Times New Roman',serif;">
                      ${amount}
                    </p>
                    <p style="margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#95bfa8;">
                      Confirmed
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Ticket stub -->
          <tr>
            <td style="background:#f7faf8;padding:0;border-left:1px solid #c5d6cc;border-right:1px solid #c5d6cc;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:18px 26px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#0f2a22;border-bottom:1px dashed #b7c9bf;">
                    <strong>${fee}</strong>
                    <span style="color:rgba(15,42,34,0.45);"> · ${method}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 26px 4px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      ${detailRow("Reference", `<span style="font-family:ui-monospace,Consolas,monospace;font-size:13px;">${reference}</span>`)}
                      ${detailRow("Fee", fee)}
                      ${detailRow("Paid by", method)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:22px 26px 8px;border:1px solid #c5d6cc;border-top:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(20,36,28,0.78);">
              <p style="margin:0;">Thank you — this ${graduation ? "graduation" : "tuition"} payment is on your record.</p>
              <p style="margin:14px 0 0;">${escapeHtml(nextStep)}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
                <tr>
                  <td style="background:#0f2a22;">
                    <a href="${paymentsUrl}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#eef6f1;text-decoration:none;">
                      Open payments →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 8px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);">
              ${paymentFooter(supportUrl, siteUrl, year)}
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

/** Bank-transfer proof approved by admin desk. */
export function buildPaymentApprovedEmail(input: PaymentMailInput) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const fee = escapeHtml(input.feeLabel.trim());
  const amount = escapeHtml(input.amountLabel.trim());
  const reference = escapeHtml(input.reference.trim());
  const paymentsUrl = escapeHtml(input.portalPaymentsUrl.trim());
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();
  const graduation = isGraduationFee(input);
  const nextStep = paidNextStep(input);

  const subject = `${firstName}, bank payment approved — ${input.feeLabel}`;
  const text = [
    `Dear ${firstName},`,
    ``,
    `Your bank transfer proof for ${input.feeLabel} (${input.amountLabel}) has been approved.`,
    `Reference: ${input.reference}`,
    ``,
    nextStep,
    `Portal: ${input.portalPaymentsUrl}`,
    ``,
    paymentTextCloser(
      input.portalSupportUrl,
      input.siteUrl,
      "You received this because your bank payment proof was approved.",
    ),
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#dde8e1;color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dde8e1;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <tr>
            <td style="padding:0 2px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#2f6b55;font-weight:700;">
                    School of Disciples
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(20,36,28,0.4);">
                    Desk approved
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Seal band -->
          <tr>
            <td style="background:#145c45;padding:36px 28px;text-align:center;">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td align="center" style="width:88px;height:88px;border:3px solid #9fd4bc;border-radius:50%;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#d7f0e4;line-height:1.25;">
                    Paid<br />seal
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;font-size:30px;line-height:1.05;letter-spacing:-0.03em;color:#f3faf6;">
                ${name}, your proof is accepted.
              </p>
              <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#a8d4c0;">
                Bank transfer · ${fee} · ${amount}
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:26px 28px;border:1px solid #c2d6cb;border-top:0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(20,36,28,0.78);">
                An administrator has marked your ${graduation ? "graduation" : "tuition"} bank proof as paid. Reference
                <span style="font-family:ui-monospace,Consolas,monospace;color:#145c45;">${reference}</span>
                is now complete.
              </p>
              <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(20,36,28,0.78);">
                ${escapeHtml(nextStep)}
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
                <tr>
                  <td style="background:#145c45;">
                    <a href="${paymentsUrl}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      View payments →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);">
              ${paymentFooter(supportUrl, siteUrl, year)}
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

/** Bank proof uploaded — awaiting admin review. */
export function buildPaymentProofReceivedEmail(input: PaymentMailInput) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const fee = escapeHtml(input.feeLabel.trim());
  const amount = escapeHtml(input.amountLabel.trim());
  const reference = escapeHtml(input.reference.trim());
  const paymentsUrl = escapeHtml(input.portalPaymentsUrl.trim());
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();
  const graduation = isGraduationFee(input);

  const subject = `${firstName}, we received your payment proof — ${input.feeLabel}`;
  const text = [
    `Dear ${firstName},`,
    ``,
    `We received your bank transfer proof for ${input.feeLabel} (${input.amountLabel}).`,
    `An administrator will review it shortly.`,
    `Reference: ${input.reference}`,
    ``,
    `Track status: ${input.portalPaymentsUrl}`,
    ``,
    paymentTextCloser(
      input.portalSupportUrl,
      input.siteUrl,
      "You received this because bank payment proof was uploaded for your enrolment.",
    ),
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ebe4d8;color:#2a2418;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ebe4d8;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <tr>
            <td style="padding:0 4px 14px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#8a6a3a;font-weight:700;">
              School of Disciples · Desk queue
            </td>
          </tr>

          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="12" style="background:#c4a574;"></td>
                  <td style="background:#2c2418;padding:30px 26px;color:#f5efe4;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#c4a574;">
                      Proof in review
                    </p>
                    <p style="margin:14px 0 0;font-size:32px;line-height:1.05;letter-spacing:-0.03em;">
                      ${name},
                    </p>
                    <p style="margin:8px 0 0;font-size:22px;line-height:1.15;color:#e0d2b8;">
                      your transfer is with the desk.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#faf6ef;padding:24px 26px;border:1px solid #d9cbb3;border-top:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;background:#ffffff;border:1px solid #e5d9c4;">
                <tr>
                  <td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5c4a2e;border-right:1px solid #e5d9c4;width:50%;">
                    <span style="display:block;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#a08050;margin-bottom:6px;">Fee</span>
                    ${fee}
                  </td>
                  <td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#5c4a2e;width:50%;">
                    <span style="display:block;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#a08050;margin-bottom:6px;">Amount</span>
                    ${amount}
                  </td>
                </tr>
              </table>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(42,36,24,0.78);">
                Thanks — your screenshot for the ${graduation ? "graduation" : "tuition"} fee is queued for review. You will get another email when it is approved or if we need a clearer image.
              </p>
              <p style="margin:14px 0 0;font-family:ui-monospace,Consolas,monospace;font-size:13px;color:#6b5530;">
                ${reference}
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
                <tr>
                  <td style="background:#8a6a3a;">
                    <a href="${paymentsUrl}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Track status →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(42,36,24,0.5);">
              ${paymentFooter(supportUrl, siteUrl, year)}
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

/** Bank proof returned — student must re-upload. */
export function buildPaymentReturnedEmail(input: PaymentMailInput) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const fee = escapeHtml(input.feeLabel.trim());
  const amount = escapeHtml(input.amountLabel.trim());
  const reference = escapeHtml(input.reference.trim());
  const paymentsUrl = escapeHtml(input.portalPaymentsUrl.trim());
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const year = new Date().getFullYear();
  const graduation = isGraduationFee(input);

  const subject = `${firstName}, please resubmit payment proof — ${input.feeLabel}`;
  const text = [
    `Dear ${firstName},`,
    ``,
    `Your bank transfer proof for ${input.feeLabel} (${input.amountLabel}) was returned.`,
    `Please upload a clearer screenshot from your payments page.`,
    `Reference: ${input.reference}`,
    `Portal: ${input.portalPaymentsUrl}`,
    ``,
    paymentTextCloser(
      input.portalSupportUrl,
      input.siteUrl,
      "You received this because a payment proof needed to be resubmitted.",
    ),
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f0e4dc;color:#2a1f18;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0e4dc;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <tr>
            <td style="padding:0 4px 14px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#9a4e32;font-weight:700;">
              School of Disciples
            </td>
          </tr>

          <tr>
            <td style="background:#5c2e1e;padding:28px 26px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#e0a890;">
                Action needed
              </p>
              <p style="margin:14px 0 0;font-size:32px;line-height:1.05;letter-spacing:-0.03em;color:#faf3ee;">
                ${name},
              </p>
              <p style="margin:8px 0 0;font-size:22px;line-height:1.2;color:#f0c4b0;">
                please upload again.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:0;border:1px solid #e0c4b4;border-top:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:20px 26px;background:#faf0ea;border-bottom:1px solid #e8d0c4;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#5c2e1e;">
                    An administrator returned your bank proof for
                    <strong>${fee}</strong> (${amount}).
                  </td>
                </tr>
                <tr>
                  <td style="padding:22px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(42,31,24,0.8);">
                    <p style="margin:0;">Upload a clear screenshot of the transfer that shows:</p>
                    <p style="margin:14px 0 0;padding-left:14px;border-left:3px solid #c4785a;">
                      the amount<br />
                      the date<br />
                      reference <span style="font-family:ui-monospace,Consolas,monospace;color:#5c2e1e;">${reference}</span>
                    </p>
                    <p style="margin:16px 0 0;">
                      This is for your ${graduation ? "graduation" : "tuition"} fee — once a clearer proof is approved, it will be marked paid.
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
                      <tr>
                        <td style="background:#5c2e1e;">
                          <a href="${paymentsUrl}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#faf3ee;text-decoration:none;">
                            Resubmit proof →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(42,31,24,0.5);">
              ${paymentFooter(supportUrl, siteUrl, year)}
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

export type LifecycleMailInput = {
  firstName: string;
  reference?: string;
  /** Student login URL — required for temp-password mail. */
  portalLoginUrl?: string;
  /** Support page on the portal (student desk or public /support). */
  portalSupportUrl: string;
  /** Main public website (schoolofdisciples.org). */
  siteUrl: string;
  /** Enrol URL for removed accounts who may re-apply. */
  enrolUrl?: string;
  temporaryPassword?: string;
};

function lifecycleFooter(
  supportUrl: string,
  siteUrl: string,
  year: number,
): string {
  const address = escapeHtml(orgAddressLine(config.orgAddress));
  return `You received this because of an account update on the School of Disciples portal.<br /><br />
              Questions?
              <a href="${supportUrl}" style="color:inherit;text-decoration:underline;">Open Support</a><br /><br />
              Automated notice — please do not reply.<br />
              ${address}<br />
              <a href="${siteUrl}" style="color:inherit;text-decoration:underline;">schoolofdisciples.org</a>
              · © ${year}`;
}

/** Admin issued a fresh temporary password. */
export function buildStudentTempPasswordEmail(
  input: LifecycleMailInput & { temporaryPassword: string; email: string },
) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const email = escapeHtml(input.email.trim());
  const password = escapeHtml(input.temporaryPassword);
  const loginUrl = escapeHtml((input.portalLoginUrl || "").trim());
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const reference = input.reference?.trim()
    ? escapeHtml(input.reference.trim())
    : "";
  const year = new Date().getFullYear();

  const subject = `${firstName}, your new temporary portal password`;
  const text = [
    `Dear ${firstName},`,
    ``,
    `An administrator issued a new temporary password for your student portal.`,
    `Email: ${input.email}`,
    `Temporary password: ${input.temporaryPassword}`,
    input.portalLoginUrl ? `Sign in: ${input.portalLoginUrl}` : "",
    input.reference ? `Reference: ${input.reference}` : "",
    ``,
    `You can change this password after signing in.`,
    ``,
    paymentTextCloser(
      input.portalSupportUrl,
      input.siteUrl,
      "You received this because a temporary password was issued for your portal account.",
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#dce6e2;color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dce6e2;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <tr>
            <td style="padding:0 4px 14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#3d6b58;font-weight:700;">
                    School of Disciples
                  </td>
                  <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(20,36,28,0.4);">
                    New key
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#0f2a22;padding:30px 26px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#8fb8a3;">
                Temporary password
              </p>
              <p style="margin:14px 0 0;font-size:32px;line-height:1.05;letter-spacing:-0.03em;color:#f4f7f5;">
                ${name},
              </p>
              <p style="margin:8px 0 0;font-size:22px;line-height:1.15;color:#b8d9c8;">
                a fresh key is ready.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:24px 26px;border:1px solid #c5d6cc;border-top:0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(20,36,28,0.78);">
                An administrator reset your student portal password. Sign in with the email below, then change it if you wish.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0;background:#0f2a22;">
                <tr>
                  <td style="padding:18px 20px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#8fb8a3;">
                      Sign-in email
                    </p>
                    <p style="margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#eef6f1;">
                      ${email}
                    </p>
                    <p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.16em;text-transform:uppercase;color:#8fb8a3;">
                      Temporary password
                    </p>
                    <p style="margin:8px 0 0;font-family:ui-monospace,Consolas,monospace;font-size:18px;letter-spacing:0.06em;color:#c5e0d2;">
                      ${password}
                    </p>
                  </td>
                </tr>
              </table>
              ${
                reference
                  ? `<p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:rgba(20,36,28,0.55);">Reference <span style="font-family:ui-monospace,Consolas,monospace;color:#0f2a22;">${reference}</span></p>`
                  : ""
              }
              ${
                loginUrl
                  ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
                <tr>
                  <td style="background:#0f2a22;">
                    <a href="${loginUrl}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#eef6f1;text-decoration:none;">
                      Sign in →
                    </a>
                  </td>
                </tr>
              </table>`
                  : ""
              }
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.5);">
              ${lifecycleFooter(supportUrl, siteUrl, year)}
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

/** Seat paused — portal access unavailable until reactivated. */
export function buildStudentSuspendedEmail(input: LifecycleMailInput) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const reference = input.reference?.trim()
    ? escapeHtml(input.reference.trim())
    : "";
  const year = new Date().getFullYear();

  const subject = `${firstName}, your School of Disciples seat is paused`;
  const text = [
    `Dear ${firstName},`,
    ``,
    `Your student seat has been paused. Portal access is temporarily unavailable.`,
    input.reference ? `Reference: ${input.reference}` : "",
    ``,
    `You will not be able to sign in until an administrator reactivates your account.`,
    `If this is unexpected, open Support: ${input.portalSupportUrl}`,
    ``,
    orgAddressLine(config.orgAddress),
    input.siteUrl,
    ``,
    "You received this because your student account was suspended.",
    "This is an automated message. Please do not reply to this email.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#e2e6ea;color:#1a2228;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e2e6ea;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <tr>
            <td style="padding:0 4px 14px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#4a6674;font-weight:700;">
              School of Disciples
            </td>
          </tr>

          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="72" valign="middle" align="center" style="background:#3d5560;padding:28px 8px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#b8cdd6;writing-mode:vertical-rl;transform:rotate(180deg);">
                      Paused
                    </p>
                  </td>
                  <td style="background:#1a2f38;padding:32px 26px;color:#eef3f5;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#7eb0c0;">
                      Seat status
                    </p>
                    <p style="margin:14px 0 0;font-size:30px;line-height:1.05;letter-spacing:-0.03em;">
                      ${name},
                    </p>
                    <p style="margin:8px 0 0;font-size:22px;line-height:1.15;color:#a8d0dc;">
                      your seat is on hold.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="background:#ffffff;padding:24px 26px;border:1px solid #c8d2d8;border-top:0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(26,34,40,0.78);">
                The School has paused your student seat. You will not be able to sign in until an administrator reactivates your account.
              </p>
              ${
                reference
                  ? `<p style="margin:16px 0 0;padding:14px 16px;background:#eef2f4;font-family:ui-monospace,Consolas,monospace;font-size:13px;color:#1a2f38;">${reference}</p>`
                  : ""
              }
              <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(26,34,40,0.78);">
                If this is unexpected, open Support — you do not need to be signed in.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
                <tr>
                  <td style="background:#1a2f38;">
                    <a href="${supportUrl}" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#eef3f5;text-decoration:none;">
                      Open Support →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(26,34,40,0.48);">
              ${lifecycleFooter(supportUrl, siteUrl, year)}
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

/** Account wiped — credentials no longer work; may re-enrol. */
export function buildStudentRemovedEmail(input: LifecycleMailInput) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const enrolUrl = escapeHtml(
    (input.enrolUrl || input.siteUrl).trim(),
  );
  const year = new Date().getFullYear();

  const subject = `${firstName}, your School of Disciples account has been removed`;
  const text = [
    `Dear ${firstName},`,
    ``,
    `Your student account and application have been removed from the School of Disciples portal.`,
    `Sign-in credentials for this email will no longer work.`,
    ``,
    `If you wish to apply again, you may start a new enrolment: ${input.enrolUrl || input.siteUrl}`,
    `If you believe this was a mistake, open Support: ${input.portalSupportUrl}`,
    ``,
    orgAddressLine(config.orgAddress),
    input.siteUrl,
    ``,
    "You received this because your student account was removed.",
    "This is an automated message. Please do not reply to this email.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#ebe4de;color:#2a221c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ebe4de;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <tr>
            <td style="padding:0 4px 14px;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#7a5c48;font-weight:700;">
              School of Disciples
            </td>
          </tr>

          <tr>
            <td style="background:#3a2c24;padding:34px 28px;text-align:center;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#c4a890;">
                Account closed
              </p>
              <p style="margin:18px 0 0;font-size:34px;line-height:1.05;letter-spacing:-0.03em;color:#f7f1eb;">
                ${name},
              </p>
              <p style="margin:10px 0 0;font-size:22px;line-height:1.2;color:#d4b8a0;">
                this chapter is closed.
              </p>
            </td>
          </tr>

          <tr>
            <td style="height:6px;background:#c4a890;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="background:#faf6f2;padding:26px 28px;border:1px solid #d9cdc2;border-top:0;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(42,34,28,0.8);">
                Your student account has been removed from the portal. Sign-in for this email will no longer work.
              </p>
              <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:rgba(42,34,28,0.8);">
                If you wish to walk with the School again, you may begin a new enrolment. If this was unexpected, open Support.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
                <tr>
                  <td style="background:#3a2c24;">
                    <a href="${enrolUrl}" style="display:inline-block;padding:13px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#f7f1eb;text-decoration:none;">
                      Enrol again →
                    </a>
                  </td>
                  <td width="10"></td>
                  <td style="border:1px solid #3a2c24;">
                    <a href="${supportUrl}" style="display:inline-block;padding:12px 20px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#3a2c24;text-decoration:none;">
                      Open Support
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 6px 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(42,34,28,0.5);">
              ${lifecycleFooter(supportUrl, siteUrl, year)}
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

/** Course manuals / materials marked sent by the desk. */
export function buildManualsSentEmail(input: LifecycleMailInput) {
  const firstName = input.firstName.trim() || "friend";
  const name = escapeHtml(firstName);
  const supportUrl = escapeHtml(input.portalSupportUrl.trim());
  const siteUrl = escapeHtml(input.siteUrl.trim());
  const loginUrl = escapeHtml((input.portalLoginUrl || "").trim());
  const year = new Date().getFullYear();

  const subject = `${firstName}, your course manuals are on the way`;
  const text = [
    `Dear ${firstName},`,
    ``,
    `The School of Disciples desk has marked your course manuals as sent.`,
    `Please watch for delivery, and contact Support in the student portal if anything is missing.`,
    input.portalLoginUrl ? `Portal: ${input.portalLoginUrl}` : "",
    ``,
    paymentTextCloser(
      input.portalSupportUrl,
      input.siteUrl,
      "You received this because your course manuals were marked as sent.",
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#dce6e2;color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dce6e2;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#f4f7f5;border:1px solid #c5d4cc;">
          <tr>
            <td style="padding:28px 24px 8px;font-size:22px;color:#14352c;">Your manuals are on the way</td>
          </tr>
          <tr>
            <td style="padding:8px 24px 24px;font-size:15px;line-height:1.65;color:#24362e;">
              <p style="margin:0 0 14px;">Dear ${name},</p>
              <p style="margin:0 0 14px;">The School of Disciples desk has marked your course manuals as sent. Please watch for delivery.</p>
              ${
                loginUrl
                  ? `<p style="margin:0 0 14px;"><a href="${loginUrl}" style="color:#14352c;">Open the student portal</a></p>`
                  : ""
              }
              <p style="margin:0;">If anything is missing, use Support in the student portal.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(42,34,28,0.5);">
              ${lifecycleFooter(supportUrl, siteUrl, year)}
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
