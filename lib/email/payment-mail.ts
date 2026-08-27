import { sendTemplatedEmail } from "@/lib/email/post-api";

export type PaymentEmailPayload = {
  to: string;
  firstName: string;
  feeLabel: string;
  amountLabel: string;
  reference: string;
  methodLabel: string;
  portalPaymentsUrl: string;
  portalSupportUrl: string;
  siteUrl: string;
  feeType?: "tuition" | "graduation";
};

export type StudentLifecycleEmailPayload = {
  to: string;
  firstName: string;
  reference?: string;
  portalLoginUrl?: string;
  portalSupportUrl: string;
  siteUrl: string;
  enrolUrl?: string;
  temporaryPassword?: string;
};

export function sendPaymentReceivedEmail(payload: PaymentEmailPayload) {
  return sendTemplatedEmail("/api/email/payment-received", payload);
}

export function sendPaymentApprovedEmail(payload: PaymentEmailPayload) {
  return sendTemplatedEmail("/api/email/payment-approved", payload);
}

export function sendPaymentProofReceivedEmail(payload: PaymentEmailPayload) {
  return sendTemplatedEmail("/api/email/payment-proof-received", payload);
}

export function sendPaymentReturnedEmail(payload: PaymentEmailPayload) {
  return sendTemplatedEmail("/api/email/payment-returned", payload);
}

export function sendStudentSuspendedEmail(payload: StudentLifecycleEmailPayload) {
  return sendTemplatedEmail("/api/email/student-suspended", payload);
}

export function sendStudentRemovedEmail(payload: StudentLifecycleEmailPayload) {
  return sendTemplatedEmail("/api/email/student-removed", payload);
}

export function sendStudentTempPasswordEmail(
  payload: StudentLifecycleEmailPayload & { temporaryPassword: string },
) {
  return sendTemplatedEmail("/api/email/student-temp-password", payload);
}

export function sendManualsSentEmail(payload: StudentLifecycleEmailPayload) {
  return sendTemplatedEmail("/api/email/manuals-sent", payload);
}
