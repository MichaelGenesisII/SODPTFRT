export function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export type FeeType = "application" | "graduation";
export type FeePaymentMethod = "stripe" | "bank_transfer";
export type FeePaymentStatus = "unpaid" | "pending_review" | "paid";

export type FeeDefinition = {
  type: FeeType;
  label: string;
  amountGbp: number;
  hint: string;
};

/** Application fee — required to secure a place. */
export const APPLICATION_FEE: FeeDefinition = {
  type: "application",
  label: "Application fee",
  amountGbp: 300,
  hint: "Secures your place on the programme.",
};

/** Graduation fee — required before completion. */
export const GRADUATION_FEE: FeeDefinition = {
  type: "graduation",
  label: "Graduation fee",
  amountGbp: 50,
  hint: "Due before graduation.",
};

export const FEE_CATALOGUE: FeeDefinition[] = [
  APPLICATION_FEE,
  GRADUATION_FEE,
];

export function feeDefinition(type: FeeType): FeeDefinition {
  return type === "graduation" ? GRADUATION_FEE : APPLICATION_FEE;
}

export function feeAmountLabel(type: FeeType): string {
  return formatGbp(feeDefinition(type).amountGbp);
}

export type StudentFeePayment = {
  id: string;
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
  unpaid: { label: "Unpaid", hint: "Not paid yet" },
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

export function isFeeType(value: string): value is FeeType {
  return value === "application" || value === "graduation";
}

export function isFeePaymentStatus(value: string): value is FeePaymentStatus {
  return (
    value === "unpaid" || value === "pending_review" || value === "paid"
  );
}
