import { portalBaseUrl } from "@/lib/email/config";
import { sendCampaignBatch } from "@/lib/email/dispatch";
import type { SendCampaignEmailPayload } from "@/lib/email/campaigns";
import {
  sendTemplatedEmail,
  type EmailSendResult,
} from "@/lib/email/post-api";
import { getActiveTemplateOverridePayload } from "@/lib/email/template-overrides";

export { portalBaseUrl };
export type { SendCampaignEmailPayload };

export type EmailResult = EmailSendResult;
/** @deprecated Use EmailResult */
export type SendTicketEmailResult = EmailSendResult;
/** @deprecated Use EmailResult */
export type EmailApiResult = EmailSendResult;

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

export async function sendTicketEmail(
  payload: SendTicketEmailPayload,
): Promise<EmailResult> {
  return sendTemplatedEmail("/api/email/ticket-reply", payload);
}

export async function sendEnrolmentEmail(
  payload: SendEnrolmentEmailPayload,
): Promise<EmailResult> {
  return sendTemplatedEmail("/api/email/enrolment-confirmation", payload);
}

export type SendEnrolmentAcceptanceEmailPayload = {
  to: string;
  firstName: string;
  reference: string;
  programmeLabel: string;
  portalLoginUrl: string;
  portalPaymentsUrl: string;
  portalSupportUrl: string;
  siteUrl: string;
};

export async function sendEnrolmentAcceptanceEmail(
  payload: SendEnrolmentAcceptanceEmailPayload,
): Promise<EmailResult> {
  return sendTemplatedEmail("/api/email/enrolment-acceptance", payload);
}

export async function sendEnrolmentAccessRecoveryEmail(
  payload: SendEnrolmentEmailPayload,
): Promise<EmailResult> {
  return sendTemplatedEmail("/api/email/enrolment-access-recovery", payload);
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

export async function sendAdminWelcomeEmail(
  payload: SendAdminWelcomeEmailPayload,
): Promise<EmailResult> {
  return sendTemplatedEmail("/api/email/admin-welcome", payload);
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

export function sendAdminAccessRecoveryEmail(
  payload: SendAdminAccessRecoveryEmailPayload,
): Promise<EmailResult> {
  return sendTemplatedEmail("/api/email/admin-access-recovery", payload);
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
  portalCertificatesUrl?: string;
  passportImageUrl?: string;
  certificateDownloadUrl?: string;
};

export async function sendStudentScorecardEmail(
  payload: SendStudentScorecardEmailPayload,
): Promise<EmailResult> {
  return sendTemplatedEmail("/api/email/student-scorecard", payload);
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

export async function sendExamResultCertificateEmail(
  payload: SendExamResultCertificatePayload,
): Promise<EmailResult> {
  return sendTemplatedEmail("/api/email/exam-result-certificate", payload);
}

export type CampaignRecipientPayload = {
  to: string;
  firstName: string;
  parishName?: string;
  unsubscribeUrl?: string;
  listUnsubscribeUrl?: string;
};

export type SendCampaignEmailResult = EmailResult & {
  sent?: number;
  failed?: number;
  remaining?: number;
  results?: { to: string; ok: boolean; message?: string; subject?: string }[];
};

export async function sendCampaignEmail(
  payload: SendCampaignEmailPayload,
): Promise<SendCampaignEmailResult> {
  try {
    const override = await getActiveTemplateOverridePayload("campaign");
    const data = await sendCampaignBatch(payload, override);

    if (!data.ok && data.message.startsWith("Rate limit")) {
      return {
        ok: false,
        message: data.message,
        remaining: data.remaining,
      };
    }

    if (!data.ok && data.message === "Email is not configured.") {
      return {
        ok: false,
        message: "Email is not configured.",
      };
    }

    if (!data.ok && data.message === "Campaigns need a subject and body.") {
      return {
        ok: false,
        message: data.message,
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
    console.error("[email/campaign]", error);
    return {
      ok: false,
      message: "Campaign could not be sent. Please try again.",
    };
  }
}

export function defaultTicketEmailSubject(topic: string, reference: string) {
  return `School of Disciples · ${topic} (${reference})`;
}
