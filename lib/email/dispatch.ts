import { isEmailConfigured } from "@/lib/email/config";
import {
  sendAdminAccessRecoveryEmail,
  sendAdminWelcomeEmail,
  sendTeacherWelcomeEmail,
  sendSingleCampaignEmail,
  sendClassInviteEmail,
  sendClassTeacherAssignmentEmail,
  sendEnrolmentAccessRecoveryEmail,
  sendEnrolmentAcceptanceEmail,
  sendEnrolmentConfirmationEmail,
  sendExamResultCertificateEmail,
  sendManualsSentEmail,
  sendPaymentApprovedEmail,
  sendPaymentProofReceivedEmail,
  sendPaymentReceivedEmail,
  sendPaymentReturnedEmail,
  sendStudentRemovedEmail,
  sendStudentScorecardEmail,
  sendStudentSuspendedEmail,
  sendStudentTempPasswordEmail,
  sendTicketReplyEmail,
  type TemplateOverride,
} from "@/lib/email/mailer";
import type { SendCampaignEmailPayload } from "@/lib/email/campaigns";

const PUBLIC_CAMPAIGN_RECIPIENT_FAILURE =
  "This message could not be delivered. Please try again later.";

export const CAMPAIGN_MAX_BATCH = 40;
export const CAMPAIGN_MIN_GAP_MS = 400;
export const CAMPAIGN_WINDOW_MS = 15 * 60 * 1000;
export const CAMPAIGN_MAX_PER_WINDOW = 120;

const campaignSendTimestamps: number[] = [];

function pruneCampaignWindow(now: number) {
  while (
    campaignSendTimestamps.length > 0 &&
    now - campaignSendTimestamps[0]! > CAMPAIGN_WINDOW_MS
  ) {
    campaignSendTimestamps.shift();
  }
}

export function campaignQuotaRemaining(now = Date.now()): number {
  pruneCampaignWindow(now);
  return Math.max(0, CAMPAIGN_MAX_PER_WINDOW - campaignSendTimestamps.length);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function paymentTemplate(body: {
  firstName: string;
  feeLabel: string;
  amountLabel: string;
  reference: string;
  methodLabel: string;
  portalPaymentsUrl: string;
  portalSupportUrl: string;
  siteUrl: string;
  feeType?: "tuition" | "graduation";
}) {
  return {
    firstName: body.firstName,
    feeLabel: body.feeLabel,
    amountLabel: body.amountLabel,
    reference: body.reference,
    methodLabel: body.methodLabel,
    portalPaymentsUrl: body.portalPaymentsUrl,
    portalSupportUrl: body.portalSupportUrl,
    siteUrl: body.siteUrl,
    feeType: body.feeType,
  };
}

export async function dispatchTemplateEmail(
  path: string,
  payload: Record<string, unknown>,
  override?: TemplateOverride | null,
): Promise<{ messageId?: string; subject: string }> {
  switch (path) {
    case "/api/email/ticket-reply":
      return sendTicketReplyEmail({
        to: String(payload.to),
        template: {
          toName: String(payload.toName),
          subject: String(payload.subject),
          message: String(payload.message),
          reference: String(payload.reference),
          topic: String(payload.topic),
          adminName: payload.adminName ? String(payload.adminName) : undefined,
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
        },
        override: override ?? undefined,
      });

    case "/api/email/enrolment-confirmation":
      return sendEnrolmentConfirmationEmail({
        to: String(payload.to),
        template: {
          firstName: String(payload.firstName),
          email: String(payload.to),
          reference: String(payload.reference),
          temporaryPassword: String(payload.temporaryPassword),
          programmeLabel: String(payload.programmeLabel),
          portalLoginUrl: String(payload.portalLoginUrl),
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
        },
        override: override ?? undefined,
      });

    case "/api/email/enrolment-acceptance":
      return sendEnrolmentAcceptanceEmail({
        to: String(payload.to),
        template: {
          firstName: String(payload.firstName),
          email: String(payload.to),
          reference: String(payload.reference),
          programmeLabel: String(payload.programmeLabel),
          portalLoginUrl: String(payload.portalLoginUrl),
          portalPaymentsUrl: String(payload.portalPaymentsUrl),
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
        },
        override: override ?? undefined,
      });

    case "/api/email/enrolment-access-recovery":
      return sendEnrolmentAccessRecoveryEmail({
        to: String(payload.to),
        template: {
          firstName: String(payload.firstName),
          email: String(payload.to),
          reference: String(payload.reference),
          temporaryPassword: String(payload.temporaryPassword),
          programmeLabel: String(payload.programmeLabel),
          portalLoginUrl: String(payload.portalLoginUrl),
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
        },
        override: override ?? undefined,
      });

    case "/api/email/admin-welcome":
      return sendAdminWelcomeEmail({
        to: String(payload.to),
        template: {
          fullName: payload.fullName ? String(payload.fullName) : "",
          email: String(payload.to),
          temporaryPassword: String(payload.temporaryPassword),
          deskScopeLabel: String(payload.deskScopeLabel),
          inviterName: String(payload.inviterName),
          adminLoginUrl: String(payload.adminLoginUrl),
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
          deskKind: payload.deskKind as "national" | "parish" | undefined,
          parishName: payload.parishName
            ? String(payload.parishName)
            : undefined,
          inviterDeskKind: payload.inviterDeskKind as
            | "national"
            | "parish"
            | undefined,
        },
        override: override ?? undefined,
      });

    case "/api/email/teacher-welcome":
      return sendTeacherWelcomeEmail({
        to: String(payload.to),
        template: {
          fullName: payload.fullName ? String(payload.fullName) : "",
          email: String(payload.to),
          temporaryPassword: String(payload.temporaryPassword),
          inviterName: String(payload.inviterName),
          teacherLoginUrl: String(payload.teacherLoginUrl),
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
        },
        override: override ?? undefined,
      });

    case "/api/email/admin-access-recovery":
      return sendAdminAccessRecoveryEmail({
        to: String(payload.to),
        template: {
          fullName: payload.fullName ? String(payload.fullName) : "",
          email: String(payload.to),
          temporaryPassword: String(payload.temporaryPassword),
          deskScopeLabel: String(payload.deskScopeLabel),
          adminLoginUrl: String(payload.adminLoginUrl),
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
          deskKind: payload.deskKind as "national" | "parish" | undefined,
          parishName: payload.parishName
            ? String(payload.parishName)
            : undefined,
        },
        override: override ?? undefined,
      });

    case "/api/email/payment-received":
      return sendPaymentReceivedEmail({
        to: String(payload.to),
        template: paymentTemplate(payload as never),
        override: override ?? undefined,
      });

    case "/api/email/payment-approved":
      return sendPaymentApprovedEmail({
        to: String(payload.to),
        template: paymentTemplate(payload as never),
        override: override ?? undefined,
      });

    case "/api/email/payment-proof-received":
      return sendPaymentProofReceivedEmail({
        to: String(payload.to),
        template: paymentTemplate(payload as never),
        override: override ?? undefined,
      });

    case "/api/email/payment-returned":
      return sendPaymentReturnedEmail({
        to: String(payload.to),
        template: paymentTemplate(payload as never),
        override: override ?? undefined,
      });

    case "/api/email/student-suspended":
      return sendStudentSuspendedEmail({
        to: String(payload.to),
        template: {
          firstName: String(payload.firstName),
          reference: payload.reference ? String(payload.reference) : undefined,
          portalLoginUrl: payload.portalLoginUrl
            ? String(payload.portalLoginUrl)
            : undefined,
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
          enrolUrl: payload.enrolUrl ? String(payload.enrolUrl) : undefined,
        },
        override: override ?? undefined,
      });

    case "/api/email/student-removed":
      return sendStudentRemovedEmail({
        to: String(payload.to),
        template: {
          firstName: String(payload.firstName),
          reference: payload.reference ? String(payload.reference) : undefined,
          portalLoginUrl: payload.portalLoginUrl
            ? String(payload.portalLoginUrl)
            : undefined,
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
          enrolUrl: payload.enrolUrl ? String(payload.enrolUrl) : undefined,
        },
        override: override ?? undefined,
      });

    case "/api/email/student-temp-password":
      return sendStudentTempPasswordEmail({
        to: String(payload.to),
        template: {
          firstName: String(payload.firstName),
          reference: payload.reference ? String(payload.reference) : undefined,
          portalLoginUrl: payload.portalLoginUrl
            ? String(payload.portalLoginUrl)
            : undefined,
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
          enrolUrl: payload.enrolUrl ? String(payload.enrolUrl) : undefined,
          temporaryPassword: String(payload.temporaryPassword),
          email: String(payload.to),
        },
        override: override ?? undefined,
      });

    case "/api/email/manuals-sent":
      return sendManualsSentEmail({
        to: String(payload.to),
        template: {
          firstName: String(payload.firstName),
          reference: payload.reference ? String(payload.reference) : undefined,
          portalLoginUrl: payload.portalLoginUrl
            ? String(payload.portalLoginUrl)
            : undefined,
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
          enrolUrl: payload.enrolUrl ? String(payload.enrolUrl) : undefined,
        },
        override: override ?? undefined,
      });

    case "/api/email/class-invite":
      return sendClassInviteEmail({
        to: String(payload.to),
        template: {
          firstName: String(payload.firstName),
          classTitle: String(payload.classTitle),
          whenLabel: String(payload.whenLabel),
          durationMinutes: Number(payload.durationMinutes),
          audienceLabel: String(payload.audienceLabel),
          portalClassesUrl: String(payload.portalClassesUrl),
          joinUrl: payload.joinUrl ? String(payload.joinUrl) : undefined,
          passcode: payload.passcode ? String(payload.passcode) : undefined,
          attendanceCode: payload.attendanceCode
            ? String(payload.attendanceCode)
            : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
        },
        override: override ?? undefined,
      });

    case "/api/email/class-teacher-assignment":
      return sendClassTeacherAssignmentEmail({
        to: String(payload.to),
        template: {
          firstName: String(payload.firstName),
          classTitle: String(payload.classTitle),
          whenLabel: String(payload.whenLabel),
          durationMinutes: Number(payload.durationMinutes),
          audienceLabel: String(payload.audienceLabel),
          teacherPortalUrl: String(payload.teacherPortalUrl),
          joinUrl: payload.joinUrl ? String(payload.joinUrl) : undefined,
          passcode: payload.passcode ? String(payload.passcode) : undefined,
          notes: payload.notes ? String(payload.notes) : undefined,
          assignedByName: payload.assignedByName
            ? String(payload.assignedByName)
            : undefined,
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
        },
        override: override ?? undefined,
      });

    case "/api/email/student-scorecard": {
      const to = String(payload.to);
      const studentEmail = String(payload.studentEmail);
      if (to.toLowerCase() !== studentEmail.toLowerCase()) {
        throw new Error("Scorecard email must be addressed to the student only.");
      }
      return sendStudentScorecardEmail({
        to: studentEmail,
        template: {
          studentName: String(payload.studentName),
          studentEmail,
          reference: payload.reference ? String(payload.reference) : undefined,
          parishName: payload.parishName
            ? String(payload.parishName)
            : undefined,
          batchName: payload.batchName ? String(payload.batchName) : undefined,
          batchYear:
            payload.batchYear === null || payload.batchYear === undefined
              ? null
              : Number(payload.batchYear),
          enrolledAtLabel: String(payload.enrolledAtLabel),
          completedAtLabel: String(payload.completedAtLabel),
          attendancePercent:
            payload.attendancePercent === null ||
            payload.attendancePercent === undefined
              ? null
              : Number(payload.attendancePercent),
          examAveragePercent:
            payload.examAveragePercent === null ||
            payload.examAveragePercent === undefined
              ? null
              : Number(payload.examAveragePercent),
          sessions: payload.sessions as never,
          entries: payload.entries as never,
          issuedAtLabel: String(payload.issuedAtLabel),
          issuedByName: String(payload.issuedByName),
          portalRecordsUrl: String(payload.portalRecordsUrl),
          portalCertificatesUrl: payload.portalCertificatesUrl
            ? String(payload.portalCertificatesUrl)
            : undefined,
          passportImageUrl: payload.passportImageUrl
            ? String(payload.passportImageUrl)
            : undefined,
          certificateDownloadUrl: payload.certificateDownloadUrl
            ? String(payload.certificateDownloadUrl)
            : undefined,
        },
        override: override ?? undefined,
      });
    }

    case "/api/email/exam-result-certificate": {
      const to = String(payload.to);
      const candidateEmail = String(payload.candidateEmail);
      if (to.toLowerCase() !== candidateEmail.toLowerCase()) {
        throw new Error(
          "Certificate email must be addressed to the candidate only.",
        );
      }
      return sendExamResultCertificateEmail({
        to: candidateEmail,
        template: {
          candidateName: String(payload.candidateName),
          candidateEmail,
          examTitle: String(payload.examTitle),
          percent: Number(payload.percent),
          passPercent: Number(payload.passPercent),
          passed: Boolean(payload.passed),
          totalScore: Number(payload.totalScore),
          maxScore: Number(payload.maxScore),
          submittedAtLabel: String(payload.submittedAtLabel),
          issuedAtLabel: String(payload.issuedAtLabel),
          church: payload.church ? String(payload.church) : undefined,
          portalSupportUrl: String(payload.portalSupportUrl),
          siteUrl: String(payload.siteUrl),
          examUrl: payload.examUrl ? String(payload.examUrl) : undefined,
        },
        override: override ?? undefined,
      });
    }

    default:
      throw new Error(`Unknown email template route: ${path}`);
  }
}

export async function sendCampaignBatch(
  payload: SendCampaignEmailPayload,
  override?: TemplateOverride | null,
) {
  if (!isEmailConfigured()) {
    return {
      ok: false as const,
      message: "Email is not configured.",
    };
  }

  if (!payload.customSubject?.trim() || !payload.customBody?.trim()) {
    return {
      ok: false as const,
      message: "Campaigns need a subject and body.",
    };
  }

  const remaining = campaignQuotaRemaining();
  if (remaining < payload.recipients.length) {
    return {
      ok: false as const,
      message: `Rate limit: only ${remaining} campaign emails left in this 15-minute window (max ${CAMPAIGN_MAX_PER_WINDOW}).`,
      remaining,
    };
  }

  const mailAttachments =
    payload.attachments?.map((item) => ({
      filename: item.filename,
      content: Buffer.from(item.content, "base64"),
      contentType: item.contentType,
    })) ?? [];

  const results: {
    to: string;
    ok: boolean;
    message?: string;
    subject?: string;
  }[] = [];

  for (let i = 0; i < payload.recipients.length; i += 1) {
    const recipient = payload.recipients[i]!;
    if (i > 0) await sleep(CAMPAIGN_MIN_GAP_MS);

    try {
      const result = await sendSingleCampaignEmail({
        to: recipient.to,
        template: {
          templateId: "custom",
          firstName: recipient.firstName,
          parishName: recipient.parishName,
          portalUrl: payload.portalUrl,
          portalSupportUrl: payload.portalSupportUrl,
          siteUrl: payload.siteUrl,
          unsubscribeUrl: recipient.unsubscribeUrl,
          personalNote: payload.personalNote,
          customSubject: payload.customSubject,
          customHeadline: payload.customHeadline,
          customBody: payload.customBody,
        },
        override: override ?? undefined,
        attachments: mailAttachments.length ? mailAttachments : undefined,
        listUnsubscribeUrl: recipient.listUnsubscribeUrl,
      });
      campaignSendTimestamps.push(Date.now());
      results.push({
        to: recipient.to,
        ok: true,
        subject: result.subject,
      });
    } catch (error) {
      console.error("[email/campaign]", recipient.to, error);
      results.push({
        to: recipient.to,
        ok: false,
        message: PUBLIC_CAMPAIGN_RECIPIENT_FAILURE,
      });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;

  return {
    ok: failed === 0,
    message:
      failed === 0
        ? `Sent ${sent} campaign email${sent === 1 ? "" : "s"}.`
        : `Sent ${sent}, failed ${failed}.`,
    sent,
    failed,
    remaining: campaignQuotaRemaining(),
    results,
  };
}
