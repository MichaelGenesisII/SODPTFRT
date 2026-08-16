import { APPLICATION_FEE } from "@/lib/payments/fees";
import { contact } from "@/lib/site-nav";

/** Programme tracks — application fee is shared across both. */
export const PROGRAMME_FEES = {
  standard: {
    label: "Standard Program",
    amountGbp: APPLICATION_FEE.amountGbp,
    duration: "10 months",
  },
  ignite: {
    label: "SOD Ignite",
    amountGbp: APPLICATION_FEE.amountGbp,
    duration: "Young adults 17–22",
  },
} as const;

export type ProgrammeFeeKey = keyof typeof PROGRAMME_FEES;

export const BANK_TRANSFER = {
  accountName: "The Redeemed Christian Church of God - School of Disciples",
  sortCode: "20-57-06",
  accountNumber: "20114502",
  swiftBic: "BUKBGB22",
  iban: "GB95 BUKB 2057 0620 1145 02",
} as const;

export function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function programmeLabelForMode(attendanceMode: string): string {
  if (attendanceMode in PROGRAMME_FEES) {
    return PROGRAMME_FEES[attendanceMode as ProgrammeFeeKey].label;
  }
  return "School of Disciples";
}

export type EnrolmentEmailPayload = {
  to: string;
  firstName: string;
  referenceDisplay: string;
  temporaryPassword: string;
};

/** Fallback subject when the email API does not return one. */
export function enrolmentConfirmationSubject(
  firstName: string,
  referenceDisplay: string,
) {
  const name = firstName.trim() || "friend";
  return `${name}, your School of Disciples application is received — ${referenceDisplay}`;
}

/** Plain-text preview used only as a last-resort log if SMTP is unavailable. */
export function buildEnrolmentConfirmationEmail(payload: EnrolmentEmailPayload) {
  const { to, firstName, referenceDisplay, temporaryPassword } = payload;
  const subject = enrolmentConfirmationSubject(firstName, referenceDisplay);
  const body = [
    `Dear ${firstName},`,
    ``,
    `Thank you for completing the School of Disciples course application.`,
    `We can confirm receipt of your application. We will give you further information within 2 business days.`,
    ``,
    `Your application reference: ${referenceDisplay}`,
    ``,
    `Temporary student portal login`,
    `Email: ${to}`,
    `Temporary password: ${temporaryPassword}`,
    `You can change this password anytime after signing in.`,
    ``,
    `Questions: ${contact.email}`,
    ``,
    `School of Disciples`,
  ].join("\n");

  return { subject, body, to };
}
