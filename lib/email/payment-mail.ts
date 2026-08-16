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
  feeType?: "application" | "graduation";
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

async function postEmailApi<TPayload extends object>(
  path: string,
  payload: TPayload,
): Promise<{ ok: boolean; message: string; subject?: string }> {
  const baseUrl = process.env.EMAIL_API_URL?.replace(/\/$/, "");
  const secret = process.env.EMAIL_API_SECRET;

  if (!baseUrl || !secret) {
    return {
      ok: false,
      message: "Email backend is not configured.",
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
      subject?: string;
    } | null;

    if (!response.ok || !data?.ok) {
      return {
        ok: false,
        message: data?.message || `Email service returned ${response.status}.`,
      };
    }
    return {
      ok: true,
      message: data.message || "Email sent.",
      subject: data.subject,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Could not reach email service.",
    };
  }
}

export function sendPaymentReceivedEmail(payload: PaymentEmailPayload) {
  return postEmailApi("/api/email/payment-received", payload);
}

export function sendPaymentApprovedEmail(payload: PaymentEmailPayload) {
  return postEmailApi("/api/email/payment-approved", payload);
}

export function sendPaymentProofReceivedEmail(payload: PaymentEmailPayload) {
  return postEmailApi("/api/email/payment-proof-received", payload);
}

export function sendPaymentReturnedEmail(payload: PaymentEmailPayload) {
  return postEmailApi("/api/email/payment-returned", payload);
}

export function sendStudentSuspendedEmail(payload: StudentLifecycleEmailPayload) {
  return postEmailApi("/api/email/student-suspended", payload);
}

export function sendStudentRemovedEmail(payload: StudentLifecycleEmailPayload) {
  return postEmailApi("/api/email/student-removed", payload);
}

export function sendStudentTempPasswordEmail(
  payload: StudentLifecycleEmailPayload & { temporaryPassword: string },
) {
  return postEmailApi("/api/email/student-temp-password", payload);
}
