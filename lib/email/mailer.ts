import { Resend } from "resend";
import {
  emailConfig,
  formatFromAddress,
  resendApiKey,
} from "@/lib/email/config";
import {
  buildMailHeaders,
  resolveReplyTo,
} from "@/lib/email/deliverability";
import {
  mergeTemplateOverride,
  type TemplateOverride,
} from "@/lib/email/template-override";
import {
  buildAdminWelcomeEmail,
  type AdminWelcomeInput,
} from "@/lib/email/templates/admin-welcome";
import {
  buildAdminAccessRecoveryEmail,
  type AdminAccessRecoveryInput,
} from "@/lib/email/templates/admin-access-recovery";
import {
  buildTeacherWelcomeEmail,
  type TeacherWelcomeInput,
} from "@/lib/email/templates/teacher-welcome";
import {
  buildEnrolmentConfirmationEmail,
  type EnrolmentConfirmationInput,
} from "@/lib/email/templates/enrolment-confirmation";
import {
  buildEnrolmentAcceptanceEmail,
  type EnrolmentAcceptanceInput,
} from "@/lib/email/templates/enrolment-acceptance";
import {
  buildEnrolmentAccessRecoveryEmail,
  type EnrolmentAccessRecoveryInput,
} from "@/lib/email/templates/enrolment-access-recovery";
import {
  buildPaymentApprovedEmail,
  buildPaymentProofReceivedEmail,
  buildPaymentReceivedEmail,
  buildPaymentReturnedEmail,
  buildStudentRemovedEmail,
  buildStudentSuspendedEmail,
  buildStudentTempPasswordEmail,
  buildManualsSentEmail,
  type LifecycleMailInput,
  type PaymentMailInput,
} from "@/lib/email/templates/payment-lifecycle";
import {
  buildClassInviteEmail,
  type ClassInviteInput,
} from "@/lib/email/templates/class-invite";
import {
  buildClassTeacherAssignmentEmail,
  type ClassTeacherAssignmentInput,
} from "@/lib/email/templates/class-teacher-assignment";
import {
  buildTicketReplyEmail,
  type TicketReplyTemplateInput,
} from "@/lib/email/templates/ticket-reply";
import {
  buildStudentScorecardEmail,
  type StudentScorecardTemplateInput,
} from "@/lib/email/templates/student-scorecard";
import {
  buildExamResultCertificateEmail,
  type ExamResultCertificateInput,
} from "@/lib/email/templates/exam-result-certificate";
import {
  buildCampaignEmail,
  type CampaignMailInput,
} from "@/lib/email/templates/campaign";
import {
  buildPortalMigrationEmail,
  type PortalMigrationEmailInput,
} from "@/lib/email/templates/portal-migration";

export type { TemplateOverride };

let resendClient: Resend | null = null;

function getResend(): Resend {
  const key = resendApiKey();
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured.");
  }
  if (!resendClient) {
    resendClient = new Resend(key);
  }
  return resendClient;
}

async function dispatch(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  channel: string;
  reference?: string;
  unsubscribeUrl?: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[];
}) {
  const from = formatFromAddress();
  if (!from) {
    throw new Error("EMAIL_FROM_ADDRESS is not configured.");
  }

  const replyTo = resolveReplyTo(input.channel);
  const headers = buildMailHeaders({
    channel: input.channel,
    reference: input.reference,
    unsubscribeUrl: input.unsubscribeUrl,
  });

  const sendStartedAt = Date.now();
  const { data, error } = await getResend().emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo,
    headers,
    attachments: input.attachments?.map((item) => ({
      filename: item.filename,
      content: item.content,
      contentType: item.contentType,
    })),
  });

  if (error) {
    console.error(
      `[mailer] ${input.channel} Resend failed after ${Date.now() - sendStartedAt}ms`,
      error,
    );
    const message =
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message
        : "Email could not be sent.";
    throw new Error(message);
  }

  console.info(
    `[mailer] ${input.channel} accepted in ${Date.now() - sendStartedAt}ms → ${input.to}`,
  );

  return {
    messageId: data?.id,
    subject: input.subject,
  };
}

export async function sendTicketReplyEmail(input: {
  to: string;
  template: TicketReplyTemplateInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildTicketReplyEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "listening-desk",
    reference: input.template.reference,
  });
}

export async function sendEnrolmentConfirmationEmail(input: {
  to: string;
  template: EnrolmentConfirmationInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildEnrolmentConfirmationEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "enrolment",
    reference: input.template.reference,
  });
}

export async function sendEnrolmentAcceptanceEmail(input: {
  to: string;
  template: EnrolmentAcceptanceInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildEnrolmentAcceptanceEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "enrolment-acceptance",
    reference: input.template.reference,
  });
}

export async function sendEnrolmentAccessRecoveryEmail(input: {
  to: string;
  template: EnrolmentAccessRecoveryInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildEnrolmentAccessRecoveryEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "enrolment-access",
    reference: input.template.reference,
  });
}

export async function sendPaymentReceivedEmail(input: {
  to: string;
  template: PaymentMailInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildPaymentReceivedEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "payment-received",
    reference: input.template.reference,
  });
}

export async function sendPaymentApprovedEmail(input: {
  to: string;
  template: PaymentMailInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildPaymentApprovedEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "payment-approved",
    reference: input.template.reference,
  });
}

export async function sendPaymentProofReceivedEmail(input: {
  to: string;
  template: PaymentMailInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildPaymentProofReceivedEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "payment-proof",
    reference: input.template.reference,
  });
}

export async function sendPaymentReturnedEmail(input: {
  to: string;
  template: PaymentMailInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildPaymentReturnedEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "payment-returned",
    reference: input.template.reference,
  });
}

export async function sendStudentSuspendedEmail(input: {
  to: string;
  template: LifecycleMailInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildStudentSuspendedEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "student-suspended",
    reference: input.template.reference,
  });
}

export async function sendStudentRemovedEmail(input: {
  to: string;
  template: LifecycleMailInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildStudentRemovedEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "student-removed",
    reference: input.template.reference,
  });
}

export async function sendStudentTempPasswordEmail(input: {
  to: string;
  template: LifecycleMailInput & { temporaryPassword: string; email: string };
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildStudentTempPasswordEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "student-temp-password",
    reference: input.template.reference,
  });
}

export async function sendManualsSentEmail(input: {
  to: string;
  template: LifecycleMailInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildManualsSentEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "manuals-sent",
    reference: input.template.reference,
  });
}

export async function sendAdminWelcomeEmail(input: {
  to: string;
  template: AdminWelcomeInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildAdminWelcomeEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "admin-welcome",
  });
}

export async function sendTeacherWelcomeEmail(input: {
  to: string;
  template: TeacherWelcomeInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildTeacherWelcomeEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "teacher-welcome",
  });
}

export async function sendAdminAccessRecoveryEmail(input: {
  to: string;
  template: AdminAccessRecoveryInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildAdminAccessRecoveryEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "admin-access-recovery",
  });
}

export async function sendClassInviteEmail(input: {
  to: string;
  template: ClassInviteInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildClassInviteEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "class-invite",
  });
}

export async function sendClassTeacherAssignmentEmail(input: {
  to: string;
  template: ClassTeacherAssignmentInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildClassTeacherAssignmentEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "class-teacher-assignment",
  });
}

export async function sendStudentScorecardEmail(input: {
  to: string;
  template: StudentScorecardTemplateInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildStudentScorecardEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "student-scorecard",
    reference: input.template.reference,
  });
}

export async function sendExamResultCertificateEmail(input: {
  to: string;
  template: ExamResultCertificateInput;
  override?: TemplateOverride;
}) {
  const built = mergeTemplateOverride(
    buildExamResultCertificateEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "exam-result-certificate",
  });
}

export async function sendPortalMigrationEmail(input: {
  to: string;
  template: PortalMigrationEmailInput;
}) {
  const built = buildPortalMigrationEmail(input.template);
  return dispatch({
    to: input.to,
    ...built,
    channel: "enrolment-confirmation",
  });
}

export async function sendSingleCampaignEmail(input: {
  to: string;
  template: CampaignMailInput;
  override?: TemplateOverride;
  listUnsubscribeUrl?: string;
  attachments?: {
    filename: string;
    content: Buffer;
    contentType: string;
  }[];
}) {
  const built = mergeTemplateOverride(
    buildCampaignEmail(input.template),
    input.override,
  );
  return dispatch({
    to: input.to,
    ...built,
    channel: "campaign",
    unsubscribeUrl:
      input.listUnsubscribeUrl || input.template.unsubscribeUrl,
    attachments: input.attachments,
  });
}
