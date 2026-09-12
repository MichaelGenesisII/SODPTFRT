export function formatGbp(amount: number): string {

  return new Intl.NumberFormat("en-GB", {

    style: "currency",

    currency: "GBP",

    maximumFractionDigits: 0,

  }).format(amount);

}



export type FeeType = "tuition" | "graduation";

export type FeePaymentMethod = "stripe" | "bank_transfer";

export type FeePaymentStatus = "unpaid" | "pending_review" | "paid";



export const MIN_INSTALLMENT_GBP = 30;



export type FeeDefinition = {

  type: FeeType;

  label: string;

  amountGbp: number;

  hint: string;

};



/** Combined programme fee — £300 tuition + £50 graduation (one payment account). */
export const PROGRAMME_FEE_TOTAL_GBP = 350;
export const PROGRAMME_FEE_TUITION_PART_GBP = 300;
export const PROGRAMME_FEE_GRADUATION_PART_GBP = 50;

/** Student-facing summary of the combined programme fee. */
export function programmeFeeBreakdownLabel(): string {
  return `${formatGbp(PROGRAMME_FEE_TOTAL_GBP)} programme fee (${formatGbp(PROGRAMME_FEE_TUITION_PART_GBP)} tuition + ${formatGbp(PROGRAMME_FEE_GRADUATION_PART_GBP)} graduation)`;
}

export function programmeFeeInstallmentHint(): string {
  return `Pay in full or in instalments — minimum ${formatGbp(MIN_INSTALLMENT_GBP)} each time (unless you clear the remaining balance).`;
}

/** Tuition account holds the full programme balance. Application to join is free. */
export const TUITION_FEE: FeeDefinition = {
  type: "tuition",
  label: "Programme fee",
  amountGbp: PROGRAMME_FEE_TOTAL_GBP,
  hint: `${programmeFeeBreakdownLabel()}. ${programmeFeeInstallmentHint()}`,
};



/** Graduation portion — tracked internally; included in programme fee. */

export const GRADUATION_FEE: FeeDefinition = {

  type: "graduation",

  label: "Graduation (included)",

  amountGbp: 0,

  hint: "Included in your programme fee — no separate payment.",

};



/** Rows shown on student/admin payment desks (single combined fee). */
export const STUDENT_PAYMENT_CATALOGUE: FeeDefinition[] = [TUITION_FEE];

/** Internal fee accounts (tuition balance + graduation tracking). */
export const FEE_CATALOGUE: FeeDefinition[] = [TUITION_FEE, GRADUATION_FEE];



export function feeDefinition(type: FeeType): FeeDefinition {

  return type === "graduation" ? GRADUATION_FEE : TUITION_FEE;

}



export function feeAmountLabel(type: FeeType): string {

  return formatGbp(feeDefinition(type).amountGbp);

}



export type StudentFeePayment = {

  id: string;

  user_id: string;

  fee_type: FeeType;

  /** @deprecated Prefer amount_due_gbp */

  amount_gbp: number;

  amount_due_gbp: number;

  amount_paid_gbp: number;

  status: FeePaymentStatus;

  method: FeePaymentMethod | null;

  stripe_session_id: string | null;

  stripe_payment_intent: string | null;

  proof_path: string | null;

  proof_mime: string | null;

  proof_note: string | null;

  paid_at: string | null;

  reviewed_at: string | null;

  reviewed_by: string | null;

  created_at: string;

  updated_at: string;

};



export type FeeTransaction = {

  id: string;

  fee_account_id: string;

  user_id: string;

  fee_type: FeeType;

  amount_gbp: number;

  status: FeePaymentStatus;

  method: FeePaymentMethod | null;

  stripe_session_id: string | null;

  stripe_payment_intent: string | null;

  proof_path: string | null;

  proof_mime: string | null;

  proof_note: string | null;

  paid_at: string | null;

  reviewed_at: string | null;

  reviewed_by: string | null;

  created_at: string;

  updated_at: string;

};



export const FEE_STATUS_META: Record<

  FeePaymentStatus,

  { label: string; hint: string }

> = {

  unpaid: { label: "Unpaid", hint: "Balance outstanding" },

  pending_review: { label: "In review", hint: "Bank proof with admin" },

  paid: { label: "Paid", hint: "Confirmed" },

};



export const MAX_PROOF_BYTES = 10 * 1024 * 1024;

export const PROOF_MIME_TYPES = [

  "image/jpeg",

  "image/png",

  "image/webp",

  "image/gif",

] as const;



const LEGACY_FEE_ALIASES: Record<string, FeeType> = {

  application: "tuition",

  tuition: "tuition",

  graduation: "graduation",

};



export function normalizeFeeType(value: string | null | undefined): FeeType | null {

  if (!value) return null;

  const key = value.trim().toLowerCase();

  return LEGACY_FEE_ALIASES[key] ?? null;

}



export function isFeeType(value: string): value is FeeType {

  return normalizeFeeType(value) !== null;

}



export function isFeePaymentStatus(value: string): value is FeePaymentStatus {

  return (

    value === "unpaid" || value === "pending_review" || value === "paid"

  );

}



export function feeRemaining(account: Pick<StudentFeePayment, "amount_due_gbp" | "amount_paid_gbp">): number {

  return Math.max(0, Number(account.amount_due_gbp) - Number(account.amount_paid_gbp));

}



export function isFeeFullyPaid(

  account: Pick<StudentFeePayment, "amount_due_gbp" | "amount_paid_gbp">,

): boolean {

  return feeRemaining(account) <= 0;

}



/** First confirmed tuition instalment — unlocks passport upload. */

export function hasTuitionInstallmentPaid(

  account: Pick<StudentFeePayment, "amount_paid_gbp"> | null | undefined,

): boolean {

  return account != null && Number(account.amount_paid_gbp) > 0;

}



export function validateInstallmentAmount(

  amountGbp: number,

  remainingGbp: number,

): { ok: true } | { ok: false; message: string } {

  if (!Number.isFinite(amountGbp) || amountGbp <= 0) {

    return { ok: false, message: "Enter a valid amount." };

  }

  const rounded = Math.round(amountGbp * 100) / 100;

  if (rounded > remainingGbp + 0.001) {

    return {

      ok: false,

      message: `Amount cannot exceed the remaining balance (${formatGbp(remainingGbp)}).`,

    };

  }

  if (rounded < remainingGbp - 0.001 && rounded < MIN_INSTALLMENT_GBP) {

    return {

      ok: false,

      message: `Minimum instalment is ${formatGbp(MIN_INSTALLMENT_GBP)} unless you pay the full remaining balance.`,

    };

  }

  return { ok: true };

}



export function normalizeStudentFeePayment(row: Record<string, unknown>): StudentFeePayment {

  const feeType = normalizeFeeType(String(row.fee_type)) ?? "tuition";

  const amountDue = Number(row.amount_due_gbp ?? row.amount_gbp ?? feeDefinition(feeType).amountGbp);

  const amountPaid = Number(row.amount_paid_gbp ?? 0);

  return {

    ...(row as unknown as StudentFeePayment),

    fee_type: feeType,

    amount_due_gbp: amountDue,

    amount_paid_gbp: amountPaid,

    amount_gbp: amountDue,

  };

}


