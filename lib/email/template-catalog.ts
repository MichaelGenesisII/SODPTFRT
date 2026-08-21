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

const wrap = (title: string, body: string) =>
  `<!DOCTYPE html><html><body style="font-family:Georgia,serif;color:#14352c;line-height:1.6;max-width:560px;margin:0 auto;padding:24px"><h1 style="font-size:22px;color:#14352c">${title}</h1>${body}<p style="margin-top:32px;font-size:12px;color:#5f8f7a">School of Disciples</p></body></html>`;

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
    defaultHtml: wrap(
      "Application received",
      "<p>Dear {{firstName}},</p><p>Thank you for applying to {{programmeLabel}}.</p><p>Reference: <strong>{{reference}}</strong></p><p>Sign in: {{portalLoginUrl}}</p><p>Temporary password: {{temporaryPassword}}</p>",
    ),
  },
  {
    slug: "enrolment-access-recovery",
    label: "Enrolment access recovery",
    description: "Forgot-password email for students.",
    variables: ["{{firstName}}", "{{portalLoginUrl}}", "{{portalSupportUrl}}"],
    defaultSubject: "Reset your School of Disciples portal password",
    defaultHtml: wrap(
      "Password reset",
      "<p>Dear {{firstName}},</p><p>Use the link from your auth provider to set a new password, then sign in at {{portalLoginUrl}}.</p>",
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
    defaultHtml: wrap(
      "Payment received",
      "<p>Dear {{firstName}},</p><p>We received your {{feeLabel}} payment of {{amountLabel}}.</p><p>Reference: {{reference}}</p>",
    ),
  },
  {
    slug: "payment-approved",
    label: "Bank payment approved",
    description: "Admin approved a bank transfer proof.",
    variables: ["{{firstName}}", "{{feeLabel}}", "{{amountLabel}}", "{{reference}}"],
    defaultSubject: "Bank payment approved — {{feeLabel}}",
    defaultHtml: wrap(
      "Payment approved",
      "<p>Dear {{firstName}},</p><p>Your bank transfer for {{feeLabel}} ({{amountLabel}}) has been approved.</p>",
    ),
  },
  {
    slug: "payment-proof-received",
    label: "Bank proof received",
    description: "Proof uploaded — awaiting desk review.",
    variables: ["{{firstName}}", "{{feeLabel}}", "{{amountLabel}}"],
    defaultSubject: "We received your bank transfer proof",
    defaultHtml: wrap(
      "Proof received",
      "<p>Dear {{firstName}},</p><p>Your {{feeLabel}} proof for {{amountLabel}} is with the desk for review.</p>",
    ),
  },
  {
    slug: "payment-returned",
    label: "Payment returned",
    description: "Bank proof rejected or returned.",
    variables: ["{{firstName}}", "{{feeLabel}}", "{{portalPaymentsUrl}}"],
    defaultSubject: "Action needed on your payment",
    defaultHtml: wrap(
      "Payment update",
      "<p>Dear {{firstName}},</p><p>We could not accept your recent {{feeLabel}} proof. Please upload again from Payments.</p>",
    ),
  },
  {
    slug: "student-suspended",
    label: "Student seat paused",
    description: "Account paused by admin.",
    variables: ["{{firstName}}", "{{portalSupportUrl}}"],
    defaultSubject: "Your portal access is paused",
    defaultHtml: wrap(
      "Access paused",
      "<p>Dear {{firstName}},</p><p>Your student seat is temporarily paused. Contact the desk if you have questions.</p>",
    ),
  },
  {
    slug: "student-removed",
    label: "Student removed",
    description: "Account removed from the portal.",
    variables: ["{{firstName}}", "{{enrolUrl}}"],
    defaultSubject: "Your portal account has been closed",
    defaultHtml: wrap(
      "Account closed",
      "<p>Dear {{firstName}},</p><p>Your portal account has been removed. You may apply again at {{enrolUrl}} if appropriate.</p>",
    ),
  },
  {
    slug: "student-temp-password",
    label: "New temporary password",
    description: "Admin issued a new temporary password.",
    variables: ["{{firstName}}", "{{temporaryPassword}}", "{{portalLoginUrl}}"],
    defaultSubject: "Your new temporary password",
    defaultHtml: wrap(
      "New password",
      "<p>Dear {{firstName}},</p><p>Temporary password: <strong>{{temporaryPassword}}</strong></p><p>Sign in: {{portalLoginUrl}}</p>",
    ),
  },
  {
    slug: "manuals-sent",
    label: "Manuals sent",
    description: "Sent when an admin marks course manuals as sent.",
    variables: ["{{firstName}}", "{{portalLoginUrl}}", "{{portalSupportUrl}}"],
    defaultSubject: "{{firstName}}, your course manuals are on the way",
    defaultHtml: wrap(
      "Manuals on the way",
      "<p>Dear {{firstName}},</p><p>Your course manuals have been marked as sent. Watch for delivery, and use Support in the portal if anything is missing.</p><p>{{portalLoginUrl}}</p>",
    ),
  },
  {
    slug: "class-invite",
    label: "Class invite",
    description: "Zoom / class session invitation.",
    variables: ["{{firstName}}", "{{classTitle}}", "{{startsAtLabel}}", "{{joinUrl}}"],
    defaultSubject: "Class invite — {{classTitle}}",
    defaultHtml: wrap(
      "You're invited",
      "<p>Dear {{firstName}},</p><p>{{classTitle}} starts {{startsAtLabel}}.</p><p><a href=\"{{joinUrl}}\">Join class</a></p>",
    ),
  },
  {
    slug: "student-scorecard",
    label: "Scorecard released",
    description: "Records / scorecard available.",
    variables: ["{{firstName}}", "{{portalRecordsUrl}}"],
    defaultSubject: "Your scorecard is ready",
    defaultHtml: wrap(
      "Scorecard ready",
      "<p>Dear {{firstName}},</p><p>Your updated scorecard is available in the portal.</p>",
    ),
  },
  {
    slug: "exam-result-certificate",
    label: "Exam certificate",
    description: "Exam result certificate notification.",
    variables: ["{{firstName}}", "{{examTitle}}", "{{portalCertificatesUrl}}"],
    defaultSubject: "Certificate ready — {{examTitle}}",
    defaultHtml: wrap(
      "Certificate ready",
      "<p>Dear {{firstName}},</p><p>Your certificate for {{examTitle}} is ready to download.</p>",
    ),
  },
  {
    slug: "ticket-reply",
    label: "Desk reply",
    description: "Listening Desk reply on a support thread.",
    variables: ["{{firstName}}", "{{reference}}", "{{message}}", "{{portalSupportUrl}}"],
    defaultSubject: "Reply from the Listening Desk — {{reference}}",
    defaultHtml: wrap(
      "Desk reply",
      "<p>Dear {{firstName}},</p><p>{{message}}</p><p>Open Support: {{portalSupportUrl}}</p>",
    ),
  },
  {
    slug: "admin-welcome",
    label: "Admin welcome",
    description: "New admin desk invite.",
    variables: ["{{fullName}}", "{{temporaryPassword}}", "{{adminLoginUrl}}", "{{deskScopeLabel}}"],
    defaultSubject: "Your admin desk is ready",
    defaultHtml: wrap(
      "Welcome",
      "<p>Dear {{fullName}},</p><p>Your {{deskScopeLabel}} desk is ready.</p><p>Sign in: {{adminLoginUrl}}</p>",
    ),
  },
  {
    slug: "admin-access-recovery",
    label: "Admin access recovery",
    description: "Admin password reset.",
    variables: ["{{fullName}}", "{{temporaryPassword}}", "{{adminLoginUrl}}"],
    defaultSubject: "Admin desk — new temporary password",
    defaultHtml: wrap(
      "Password reset",
      "<p>Dear {{fullName}},</p><p>Temporary password: {{temporaryPassword}}</p>",
    ),
  },
  {
    slug: "campaign",
    label: "Email campaign",
    description: "Custom outbound campaign to students.",
    variables: ["{{firstName}}", "{{headline}}", "{{bodyHtml}}", "{{portalLoginUrl}}"],
    defaultSubject: "{{headline}}",
    defaultHtml: wrap("{{headline}}", "<p>Dear {{firstName}},</p><div>{{bodyHtml}}</div>"),
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
  portalLoginUrl: "https://portal.example/login/student",
  portalSupportUrl: "https://portal.example/student/support",
  portalPaymentsUrl: "https://portal.example/student/payments",
  portalRecordsUrl: "https://portal.example/student/records",
  portalCertificatesUrl: "https://portal.example/student/certificates",
  enrolUrl: "https://portal.example/enrol",
  feeLabel: "Tuition",
  amountLabel: "£50.00",
  classTitle: "Session 12 — The Holy Spirit",
  startsAtLabel: "Saturday 10 March, 7:00pm",
  joinUrl: "https://portal.example/student/classes",
  examTitle: "Exam Year 3",
  message: "Thank you for your patience — we are looking into this.",
  fullName: "Jordan Smith",
  adminLoginUrl: "https://portal.example/login/admin",
  deskScopeLabel: "National desk",
  headline: "Important update for your cohort",
  bodyHtml: "<p>Classes resume next week. Check the portal for your schedule.</p>",
};

export function renderTemplatePreview(
  template: string,
  values: Record<string, string> = EMAIL_SAMPLE_VALUES,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? `{{${key}}}`);
}

export function catalogEntryForSlug(slug: string): EmailTemplateCatalogEntry | null {
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
