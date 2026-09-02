import type {
  EnrolmentStatus,
  PaymentStatus,
} from "@/lib/student/types";
import {
  isFeeFullyPaid,
  type FeeType,
} from "@/lib/payments/fees";

export type AdminEnrolmentRecord = {
  id: string;
  user_id: string;
  reference: string;
  reference_compact: string;
  status: EnrolmentStatus;
  payment_status: PaymentStatus;
  attendance_mode: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  address_line1: string;
  address_line2: string | null;
  town_city: string;
  county: string | null;
  postcode: string;
  country: string;
  mobile_number: string;
  home_telephone: string | null;
  email: string;
  nationality: string;
  date_of_birth: string;
  marital_status: string;
  born_again: string;
  born_again_date: string | null;
  born_again_where: string | null;
  baptised_holy_spirit: string;
  holy_spirit_date: string | null;
  holy_spirit_where: string | null;
  baptised_water: string;
  water_baptism_date: string | null;
  water_baptism_where: string | null;
  schools_attended: string;
  occupations: string[];
  occupation_other: string | null;
  parish_id: string | null;
  batch_id: string | null;
  cohort_id: string | null;
  legacy_app_com_no: string | null;
  local_church: string | null;
  church_leader: string;
  church_activities: string | null;
  declaration_accepted: boolean;
  declared_at: string;
  created_at: string;
  updated_at: string;
  parish_name?: string | null;
  parish_region?: string | null;
  batch_name?: string | null;
  batch_year?: number | null;
  cohort_name?: string | null;
  cohort_year_start?: number | null;
  cohort_year_end?: number | null;
  intake_key?: "november" | "january" | "february" | null;
  saturday_cohort_id?: string | null;
  saturday_slot?: 1 | 2 | 3 | 4 | null;
  saturday_label?: string | null;
};

export type StudentFeeSnap = {
  fee_type: "tuition" | "graduation";
  status: PaymentStatus;
  amount_gbp: number;
  amount_due_gbp: number;
  amount_paid_gbp: number;
  method: string | null;
  paid_at: string | null;
};

export type StudentPathSnap = {
  record_id: string | null;
  attendance_percent: number | null;
  exam_average: number | null;
  sessions_present: number;
  sessions_total: number;
  exam_entries: number;
};

export type AdminStudentRecord = {
  id: string;
  email: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  is_active: boolean;
  created_at: string;
  account_kind?: "student" | "alumni";
  manuals_status?: "not_sent" | "sent";
  manuals_sent_at?: string | null;
  manuals_1_sent_at?: string | null;
  manuals_2_sent_at?: string | null;
  manuals_3_sent_at?: string | null;
  passport_url?: string | null;
  enrolment: AdminEnrolmentRecord | null;
  fees: StudentFeeSnap[];
  path: StudentPathSnap;
};

export const ENROLMENT_STATUSES: EnrolmentStatus[] = [
  "submitted",
  "under_review",
  "accepted",
  "payment_pending",
  "paid",
  "rejected",
];

export const PAYMENT_STATUSES: PaymentStatus[] = [
  "unpaid",
  "pending_review",
  "paid",
];

export const ENROLMENT_STATUS_META: Record<
  EnrolmentStatus,
  { label: string; hint: string }
> = {
  submitted: { label: "Submitted", hint: "Just arrived" },
  under_review: { label: "Under review", hint: "Reading the form" },
  accepted: { label: "Accepted", hint: "Place offered" },
  payment_pending: { label: "Payment pending", hint: "Awaiting funds" },
  paid: { label: "Paid", hint: "Place secured" },
  rejected: { label: "Rejected", hint: "Not progressing" },
};

export const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; hint: string }
> = {
  unpaid: { label: "Unpaid", hint: "No payment yet" },
  pending_review: { label: "Proof in review", hint: "Bank proof uploaded" },
  paid: { label: "Paid", hint: "Confirmed" },
};

export function studentFullName(student: AdminStudentRecord): string {
  return [student.first_name, student.middle_name, student.last_name]
    .filter(Boolean)
    .join(" ");
}

export function studentFeeSnap(
  student: AdminStudentRecord,
  feeType: FeeType,
): StudentFeeSnap | undefined {
  return student.fees.find((fee) => fee.fee_type === feeType);
}

export function isStudentFeePaid(
  fee: StudentFeeSnap | null | undefined,
): boolean {
  if (!fee) return false;
  return fee.status === "paid" || isFeeFullyPaid(fee);
}

/** Programme fee payment lane for admin desk filters (tuition account holds £350). */
export type ProgrammeFeeLane = "paid_full" | "paid_part" | "not_paid";

export function studentProgrammeFeeLane(
  student: AdminStudentRecord,
): ProgrammeFeeLane {
  const fee = studentFeeSnap(student, "tuition");
  if (!fee) return "not_paid";
  if (isStudentFeePaid(fee)) return "paid_full";
  const paid = Number(fee.amount_paid_gbp) || 0;
  if (paid > 0 || fee.status === "pending_review") return "paid_part";
  return "not_paid";
}

export function formatAdminDate(iso?: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function isEnrolmentStatus(value: string): value is EnrolmentStatus {
  return ENROLMENT_STATUSES.includes(value as EnrolmentStatus);
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return PAYMENT_STATUSES.includes(value as PaymentStatus);
}
