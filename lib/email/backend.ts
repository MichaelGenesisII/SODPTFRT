export type SendTicketEmailPayload = {
  to: string;
  toName: string;
  subject: string;
  message: string;
  reference: string;
  topic: string;
  adminName?: string;
  portalSupportUrl: string;
  siteUrl: string;
};

export type SendTicketEmailResult = {
  ok: boolean;
  message: string;
  messageId?: string;
  subject?: string;
};

export type SendEnrolmentEmailPayload = {
  to: string;
  firstName: string;
  reference: string;
  temporaryPassword: string;
  programmeLabel: string;
  portalLoginUrl: string;
  portalSupportUrl: string;
  siteUrl: string;
};

async function postEmailApi<TPayload extends object>(
  path: string,
  payload: TPayload,
): Promise<SendTicketEmailResult> {
  const baseUrl = process.env.EMAIL_API_URL?.replace(/\/$/, "");
  const secret = process.env.EMAIL_API_SECRET;

  if (!baseUrl || !secret) {
    return {
      ok: false,
      message:
        "Email backend is not configured. Set EMAIL_API_URL and EMAIL_API_SECRET in sod_portal/.env.local, and run sod_portal_be.",
    };
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SOD-Email-Secret": secret,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      messageId?: string;
      subject?: string;
    } | null;

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        message:
          data?.message ||
          `Email service returned ${response.status}. Is sod_portal_be running?`,
      };
    }

    return {
      ok: true,
      message: data.message || "Email sent.",
      messageId: data.messageId,
      subject: data.subject,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? `Could not reach email service: ${error.message}`
          : "Could not reach email service.",
    };
  }
}

export async function sendTicketEmailViaBackend(
  payload: SendTicketEmailPayload,
): Promise<SendTicketEmailResult> {
  return postEmailApi("/api/email/ticket-reply", payload);
}

export async function sendEnrolmentEmailViaBackend(
  payload: SendEnrolmentEmailPayload,
): Promise<SendTicketEmailResult> {
  return postEmailApi("/api/email/enrolment-confirmation", payload);
}

export async function sendEnrolmentAccessRecoveryViaBackend(
  payload: SendEnrolmentEmailPayload,
): Promise<SendTicketEmailResult> {
  return postEmailApi("/api/email/enrolment-access-recovery", payload);
}

export type SendAdminWelcomeEmailPayload = {
  to: string;
  fullName?: string;
  temporaryPassword: string;
  deskScopeLabel: string;
  inviterName: string;
  adminLoginUrl: string;
  portalSupportUrl: string;
  siteUrl: string;
  deskKind?: "national" | "parish";
  parishName?: string;
  inviterDeskKind?: "national" | "parish";
};

export async function sendAdminWelcomeEmailViaBackend(
  payload: SendAdminWelcomeEmailPayload,
): Promise<SendTicketEmailResult> {
  return postEmailApi("/api/email/admin-welcome", payload);
}

export type SendAdminAccessRecoveryEmailPayload = {
  to: string;
  fullName?: string;
  temporaryPassword: string;
  deskScopeLabel: string;
  adminLoginUrl: string;
  portalSupportUrl: string;
  siteUrl: string;
  deskKind?: "national" | "parish";
  parishName?: string;
};

export function sendAdminAccessRecoveryViaBackend(
  payload: SendAdminAccessRecoveryEmailPayload,
): Promise<SendTicketEmailResult> {
  return postEmailApi("/api/email/admin-access-recovery", payload);
}

export type SendStudentScorecardEmailPayload = {
  to: string;
  studentName: string;
  studentEmail: string;
  reference?: string;
  parishName?: string;
  batchName?: string;
  batchYear?: number | null;
  enrolledAtLabel: string;
  completedAtLabel: string;
  attendancePercent: number | null;
  examAveragePercent: number | null;
  sessions: { date: string; label: string; present: boolean }[];
  entries: {
    label: string;
    percent: number;
    passed: boolean;
    includeInTotal: boolean;
    source: string;
  }[];
  issuedAtLabel: string;
  issuedByName: string;
  portalRecordsUrl: string;
  /** Stable portal page for certificates (optional companion to signed download). */
  portalCertificatesUrl?: string;
  /** Signed HTTPS URL for the student’s passport photo (optional). */
  passportImageUrl?: string;
  /** Signed download URL for course certificate — only when on file & appropriate. */
  certificateDownloadUrl?: string;
};

export async function sendStudentScorecardViaBackend(
  payload: SendStudentScorecardEmailPayload,
): Promise<SendTicketEmailResult> {
  return postEmailApi("/api/email/student-scorecard", payload);
}

export type SendExamResultCertificatePayload = {
  to: string;
  candidateName: string;
  candidateEmail: string;
  examTitle: string;
  percent: number;
  passPercent: number;
  passed: boolean;
  totalScore: number;
  maxScore: number;
  submittedAtLabel: string;
  issuedAtLabel: string;
  church?: string;
  portalSupportUrl: string;
  siteUrl: string;
  examUrl?: string;
};

export async function sendExamResultCertificateViaBackend(
  payload: SendExamResultCertificatePayload,
): Promise<SendTicketEmailResult> {
  return postEmailApi("/api/email/exam-result-certificate", payload);
}

export type CampaignRecipientPayload = {
  to: string;
  firstName: string;
  parishName?: string;
};

export type SendCampaignEmailPayload = {
  templateId: string;
  portalUrl: string;
  portalSupportUrl: string;
  siteUrl: string;
  personalNote?: string;
  customSubject?: string;
  customHeadline?: string;
  customBody?: string;
  recipients: CampaignRecipientPayload[];
};

export type SendCampaignEmailResult = SendTicketEmailResult & {
  sent?: number;
  failed?: number;
  remaining?: number;
  results?: { to: string; ok: boolean; message?: string; subject?: string }[];
};

export async function sendCampaignViaBackend(
  payload: SendCampaignEmailPayload,
): Promise<SendCampaignEmailResult> {
  const baseUrl = process.env.EMAIL_API_URL?.replace(/\/$/, "");
  const secret = process.env.EMAIL_API_SECRET;

  if (!baseUrl || !secret) {
    return {
      ok: false,
      message:
        "Email backend is not configured. Set EMAIL_API_URL and EMAIL_API_SECRET in sod_portal/.env.local, and run sod_portal_be.",
    };
  }

  try {
    const response = await fetch(`${baseUrl}/api/email/campaign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SOD-Email-Secret": secret,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      sent?: number;
      failed?: number;
      remaining?: number;
      results?: SendCampaignEmailResult["results"];
    } | null;

    if (!response.ok || !data) {
      return {
        ok: false,
        message:
          data?.message ||
          `Email service returned ${response.status}. Is sod_portal_be running?`,
        remaining: data?.remaining,
      };
    }

    return {
      ok: Boolean(data.ok),
      message: data.message || "Campaign sent.",
      sent: data.sent,
      failed: data.failed,
      remaining: data.remaining,
      results: data.results,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? `Could not reach email service: ${error.message}`
          : "Could not reach email service.",
    };
  }
}

export function defaultTicketEmailSubject(topic: string, reference: string) {
  return `School of Disciples · ${topic} (${reference})`;
}

export function portalBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.EMAIL_PORTAL_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}
