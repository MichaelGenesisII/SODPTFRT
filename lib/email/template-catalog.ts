export type EmailTemplateSlug =
  | "enrolment-confirmation"
  | "enrolment-access-recovery"
  | "payment-received"
  | "payment-approved"
  | "payment-proof-received"
  | "payment-returned"
  | "student-suspended"
  | "student-removed"
  | "student-temp-password"
  | "class-invite"
  | "student-scorecard"
  | "exam-result-certificate"
  | "ticket-reply"
  | "admin-welcome"
  | "admin-access-recovery"
  | "campaign"
  | "manuals-sent";

export type EmailTemplateCatalogEntry = {
  slug: EmailTemplateSlug;
  label: string;
  description: string;
  variables: string[];
  defaultSubject: string;
  defaultHtml: string;
  defaultText?: string;
};

/**
 * Shared SOD email shell — table layout, readable markup for the editor,
 * and full document structure so inbox preview styles apply correctly.
 */
function wrapEmailHtml(title: string, bodyHtml: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#dfe8e2;color:#14241c;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dfe8e2;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;">
          <tr>
            <td style="background:#0f2a22;padding:24px 28px 22px;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#8fb8a3;font-weight:700;">
                School of Disciples
              </p>
              <p style="margin:18px 0 0;font-size:30px;line-height:1.1;letter-spacing:-0.03em;color:#f4f7f5;">
                ${title}
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#95bfa8;height:4px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="background:#fafcfb;padding:26px 28px 18px;border-left:1px solid #c5d6cc;border-right:1px solid #c5d6cc;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.7;color:rgba(20,36,28,0.84);">
${indentBlock(bodyHtml, 14)}
            </td>
          </tr>
          <tr>
            <td style="background:#eef4f0;padding:16px 28px 20px;border:1px solid #c5d6cc;border-top:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:rgba(20,36,28,0.62);">
              This address is not monitored. For help, open Support in the portal.
            </td>
          </tr>
          <tr>
            <td style="padding:16px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.65;color:rgba(20,36,28,0.48);">
              School of Disciples · Belfast · schoolofdisciples.org<br />
              © ${year}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function indentBlock(html: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return html
    .trim()
    .split("\n")
    .map((line) => (line.trim() ? `${pad}${line.trim()}` : ""))
    .join("\n");
}

/** Pretty-print minified email HTML for the template editor. */
export function formatEmailHtmlForEditor(html: string): string {
  const source = html.trim();
  if (!source) return source;
  const newlineCount = (source.match(/\n/g) ?? []).length;
  if (newlineCount >= 8) return source;

  let out = "";
  let indent = 0;
  const tokens = source.replace(/>\s*</g, "><").split(/(?=<)|(?<=>)/g).filter(Boolean);

  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;

    const isClosing = /^<\//.test(token);
    const isSelfClosing =
      /\/>$/.test(token) ||
      /^<(meta|br|hr|img|link|!DOCTYPE)\b/i.test(token);
    const isOpening =
      /^<[a-z]/i.test(token) && !isClosing && !isSelfClosing && !/^<!/.test(token);

    if (isClosing) indent = Math.max(0, indent - 1);
    out += `${"  ".repeat(indent)}${token}\n`;
    if (isOpening) indent += 1;
  }

  return out.trim() + "\n";
}

export const EMAIL_TEMPLATE_CATALOG: EmailTemplateCatalogEntry[] = [
  {
    slug: "enrolment-confirmation",
    label: "Enrolment confirmation",
    description: "Sent when a new student submits their application.",
    variables: [
      "{{firstName}}",
      "{{email}}",
      "{{reference}}",
      "{{temporaryPassword}}",
      "{{programmeLabel}}",
      "{{portalLoginUrl}}",
      "{{portalSupportUrl}}",
    ],
    defaultSubject: "{{firstName}}, your application is received — {{reference}}",
    defaultHtml: wrapEmailHtml(
      "Application received",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0 0 14px;">Thank you for applying to {{programmeLabel}}.</p>
<p style="margin:0 0 14px;">Reference: <strong>{{reference}}</strong></p>
<p style="margin:0 0 14px;">Sign in: <a href="{{portalLoginUrl}}" style="color:#14352c;">{{portalLoginUrl}}</a></p>
<p style="margin:0;">Temporary password: <strong>{{temporaryPassword}}</strong></p>`,
    ),
  },
  {
    slug: "enrolment-access-recovery",
    label: "Enrolment access recovery",
    description: "Forgot-password email for students.",
    variables: ["{{firstName}}", "{{portalLoginUrl}}", "{{portalSupportUrl}}"],
    defaultSubject: "Reset your School of Disciples portal password",
    defaultHtml: wrapEmailHtml(
      "Password reset",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0 0 14px;">Use the link from your auth provider to set a new password, then sign in at the portal.</p>
<p style="margin:0;"><a href="{{portalLoginUrl}}" style="color:#14352c;">{{portalLoginUrl}}</a></p>`,
    ),
  },
  {
    slug: "payment-received",
    label: "Payment received",
    description: "Card or approved bank payment recorded.",
    variables: [
      "{{firstName}}",
      "{{feeLabel}}",
      "{{amountLabel}}",
      "{{reference}}",
      "{{portalPaymentsUrl}}",
    ],
    defaultSubject: "Payment received — {{feeLabel}}",
    defaultHtml: wrapEmailHtml(
      "Payment received",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0 0 14px;">We received your {{feeLabel}} payment of {{amountLabel}}.</p>
<p style="margin:0;">Reference: <strong>{{reference}}</strong></p>`,
    ),
  },
  {
    slug: "payment-approved",
    label: "Bank payment approved",
    description: "Admin approved a bank transfer proof.",
    variables: ["{{firstName}}", "{{feeLabel}}", "{{amountLabel}}", "{{reference}}"],
    defaultSubject: "Bank payment approved — {{feeLabel}}",
    defaultHtml: wrapEmailHtml(
      "Payment approved",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0;">Your bank transfer for {{feeLabel}} ({{amountLabel}}) has been approved.</p>`,
    ),
  },
  {
    slug: "payment-proof-received",
    label: "Bank proof received",
    description: "Proof uploaded — awaiting desk review.",
    variables: ["{{firstName}}", "{{feeLabel}}", "{{amountLabel}}"],
    defaultSubject: "We received your bank transfer proof",
    defaultHtml: wrapEmailHtml(
      "Proof received",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0;">Your {{feeLabel}} proof for {{amountLabel}} is with the desk for review.</p>`,
    ),
  },
  {
    slug: "payment-returned",
    label: "Payment returned",
    description: "Bank proof rejected or returned.",
    variables: ["{{firstName}}", "{{feeLabel}}", "{{portalPaymentsUrl}}"],
    defaultSubject: "Action needed on your payment",
    defaultHtml: wrapEmailHtml(
      "Payment update",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0 0 14px;">We could not accept your recent {{feeLabel}} proof. Please upload again from Payments.</p>
<p style="margin:0;"><a href="{{portalPaymentsUrl}}" style="color:#14352c;">Open Payments</a></p>`,
    ),
  },
  {
    slug: "student-suspended",
    label: "Student seat paused",
    description: "Account paused by admin.",
    variables: ["{{firstName}}", "{{portalSupportUrl}}"],
    defaultSubject: "Your portal access is paused",
    defaultHtml: wrapEmailHtml(
      "Access paused",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0;">Your student seat is temporarily paused. Contact the desk if you have questions.</p>`,
    ),
  },
  {
    slug: "student-removed",
    label: "Student removed",
    description: "Account removed from the portal.",
    variables: ["{{firstName}}", "{{enrolUrl}}"],
    defaultSubject: "Your portal account has been closed",
    defaultHtml: wrapEmailHtml(
      "Account closed",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0;">Your portal account has been removed. You may apply again at <a href="{{enrolUrl}}" style="color:#14352c;">{{enrolUrl}}</a> if appropriate.</p>`,
    ),
  },
  {
    slug: "student-temp-password",
    label: "New temporary password",
    description: "Admin issued a new temporary password.",
    variables: ["{{firstName}}", "{{temporaryPassword}}", "{{portalLoginUrl}}"],
    defaultSubject: "Your new temporary password",
    defaultHtml: wrapEmailHtml(
      "New password",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0 0 14px;">Temporary password: <strong>{{temporaryPassword}}</strong></p>
<p style="margin:0;">Sign in: <a href="{{portalLoginUrl}}" style="color:#14352c;">{{portalLoginUrl}}</a></p>`,
    ),
  },
  {
    slug: "manuals-sent",
    label: "Manuals sent",
    description: "Sent when an admin marks course manuals as sent.",
    variables: ["{{firstName}}", "{{portalLoginUrl}}", "{{portalSupportUrl}}"],
    defaultSubject: "{{firstName}}, your course manuals are on the way",
    defaultHtml: wrapEmailHtml(
      "Manuals on the way",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0 0 14px;">Your course manuals have been marked as sent. Watch for delivery, and use Support in the portal if anything is missing.</p>
<p style="margin:0;"><a href="{{portalLoginUrl}}" style="color:#14352c;">Open the portal</a></p>`,
    ),
  },
  {
    slug: "class-invite",
    label: "Class invite",
    description: "Zoom / class session invitation.",
    variables: ["{{firstName}}", "{{classTitle}}", "{{startsAtLabel}}", "{{joinUrl}}"],
    defaultSubject: "Class invite — {{classTitle}}",
    defaultHtml: wrapEmailHtml(
      "You're invited",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0 0 14px;"><strong>{{classTitle}}</strong> starts {{startsAtLabel}}.</p>
<p style="margin:0;"><a href="{{joinUrl}}" style="color:#14352c;">Join class</a></p>`,
    ),
  },
  {
    slug: "student-scorecard",
    label: "Scorecard released",
    description: "Records / scorecard available.",
    variables: ["{{firstName}}", "{{portalRecordsUrl}}"],
    defaultSubject: "Your scorecard is ready",
    defaultHtml: wrapEmailHtml(
      "Scorecard ready",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0 0 14px;">Your updated scorecard is available in the portal.</p>
<p style="margin:0;"><a href="{{portalRecordsUrl}}" style="color:#14352c;">View records</a></p>`,
    ),
  },
  {
    slug: "exam-result-certificate",
    label: "Exam certificate",
    description: "Exam result certificate notification.",
    variables: ["{{firstName}}", "{{examTitle}}", "{{portalCertificatesUrl}}"],
    defaultSubject: "Certificate ready — {{examTitle}}",
    defaultHtml: wrapEmailHtml(
      "Certificate ready",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0 0 14px;">Your certificate for {{examTitle}} is ready to download.</p>
<p style="margin:0;"><a href="{{portalCertificatesUrl}}" style="color:#14352c;">Open certificates</a></p>`,
    ),
  },
  {
    slug: "ticket-reply",
    label: "Desk reply",
    description: "Listening Desk reply on a support thread.",
    variables: ["{{firstName}}", "{{reference}}", "{{message}}", "{{portalSupportUrl}}"],
    defaultSubject: "Reply from the Listening Desk — {{reference}}",
    defaultHtml: wrapEmailHtml(
      "Desk reply",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<p style="margin:0 0 14px;">{{message}}</p>
<p style="margin:0;">Open Support: <a href="{{portalSupportUrl}}" style="color:#14352c;">{{portalSupportUrl}}</a></p>`,
    ),
  },
  {
    slug: "admin-welcome",
    label: "Admin welcome",
    description: "New admin desk invite.",
    variables: ["{{fullName}}", "{{temporaryPassword}}", "{{adminLoginUrl}}", "{{deskScopeLabel}}"],
    defaultSubject: "Your admin desk is ready",
    defaultHtml: wrapEmailHtml(
      "Welcome",
      `<p style="margin:0 0 14px;">Dear {{fullName}},</p>
<p style="margin:0 0 14px;">Your {{deskScopeLabel}} desk is ready.</p>
<p style="margin:0;">Sign in: <a href="{{adminLoginUrl}}" style="color:#14352c;">{{adminLoginUrl}}</a></p>`,
    ),
  },
  {
    slug: "admin-access-recovery",
    label: "Admin access recovery",
    description: "Admin password reset.",
    variables: ["{{fullName}}", "{{temporaryPassword}}", "{{adminLoginUrl}}"],
    defaultSubject: "Admin desk — new temporary password",
    defaultHtml: wrapEmailHtml(
      "Password reset",
      `<p style="margin:0 0 14px;">Dear {{fullName}},</p>
<p style="margin:0 0 14px;">Temporary password: <strong>{{temporaryPassword}}</strong></p>
<p style="margin:0;">Sign in: <a href="{{adminLoginUrl}}" style="color:#14352c;">{{adminLoginUrl}}</a></p>`,
    ),
  },
  {
    slug: "campaign",
    label: "Email campaign",
    description: "Custom outbound campaign to students.",
    variables: ["{{firstName}}", "{{headline}}", "{{bodyHtml}}", "{{portalLoginUrl}}"],
    defaultSubject: "{{headline}}",
    defaultHtml: wrapEmailHtml(
      "{{headline}}",
      `<p style="margin:0 0 14px;">Dear {{firstName}},</p>
<div style="margin:0 0 14px;">{{bodyHtml}}</div>
<p style="margin:0;"><a href="{{portalLoginUrl}}" style="color:#14352c;">Open student portal</a></p>`,
    ),
  },
];

export const EMAIL_TEMPLATE_BY_SLUG = new Map(
  EMAIL_TEMPLATE_CATALOG.map((entry) => [entry.slug, entry]),
);

export const EMAIL_SAMPLE_VALUES: Record<string, string> = {
  firstName: "Alex",
  email: "alex@example.com",
  reference: "SOD-26-K7MH-4QX2",
  temporaryPassword: "K7MH4QX2AB",
  programmeLabel: "School of Disciples",
  portalLoginUrl: "https://portal.schoolofdisciples.org/login/student",
  portalSupportUrl: "https://portal.schoolofdisciples.org/student/support",
  portalPaymentsUrl: "https://portal.schoolofdisciples.org/student/payments",
  portalRecordsUrl: "https://portal.schoolofdisciples.org/student/records",
  portalCertificatesUrl:
    "https://portal.schoolofdisciples.org/student/certificates",
  enrolUrl: "https://portal.schoolofdisciples.org/enrol",
  feeLabel: "Tuition",
  amountLabel: "£50.00",
  classTitle: "Session 12 — The Holy Spirit",
  startsAtLabel: "Saturday 10 March, 7:00pm",
  joinUrl: "https://portal.schoolofdisciples.org/student/classes",
  examTitle: "Exam Year 3",
  message: "Thank you for your patience — we are looking into this.",
  fullName: "Jordan Smith",
  adminLoginUrl: "https://portal.schoolofdisciples.org/login/admin",
  deskScopeLabel: "National desk",
  headline: "Important update for your cohort",
  bodyHtml:
    "<p style=\"margin:0;\">Classes resume next week. Check the portal for your schedule.</p>",
};

export function renderTemplatePreview(
  template: string,
  values: Record<string, string> = EMAIL_SAMPLE_VALUES,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? `{{${key}}}`);
}

export function catalogEntryForSlug(
  slug: string,
): EmailTemplateCatalogEntry | null {
  return EMAIL_TEMPLATE_BY_SLUG.get(slug as EmailTemplateSlug) ?? null;
}

export const EMAIL_API_SLUG_BY_PATH: Record<string, EmailTemplateSlug> = {
  "/api/email/enrolment-confirmation": "enrolment-confirmation",
  "/api/email/enrolment-access-recovery": "enrolment-access-recovery",
  "/api/email/payment-received": "payment-received",
  "/api/email/payment-approved": "payment-approved",
  "/api/email/payment-proof-received": "payment-proof-received",
  "/api/email/payment-returned": "payment-returned",
  "/api/email/student-suspended": "student-suspended",
  "/api/email/student-removed": "student-removed",
  "/api/email/student-temp-password": "student-temp-password",
  "/api/email/manuals-sent": "manuals-sent",
  "/api/email/class-invite": "class-invite",
  "/api/email/student-scorecard": "student-scorecard",
  "/api/email/exam-result-certificate": "exam-result-certificate",
  "/api/email/ticket-reply": "ticket-reply",
  "/api/email/admin-welcome": "admin-welcome",
  "/api/email/admin-access-recovery": "admin-access-recovery",
  "/api/email/campaign": "campaign",
};
