export type FinanceProfile = {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  avatar_path?: string | null;
  /** Signed URL for UI avatar (short-lived). */
  avatarUrl?: string | null;
};

export function financeDisplayName(profile: Pick<FinanceProfile, "full_name" | "email">) {
  return profile.full_name?.trim() || profile.email;
}

export type TeacherPayRate = {
  id: string;
  amount_gbp: number;
  effective_from: string;
  label: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type TeacherPayPeriodMark = {
  id: string;
  period_key: string;
  teacher_id: string;
  marked_paid_at: string;
  marked_by: string | null;
  notes: string | null;
  created_at: string;
};

export type PayPeriodSessionRow = {
  deliveryId: string;
  classId: string;
  classTitle: string;
  scheduledStart: string;
  status: "delivered" | "covered";
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  rateId: string | null;
  rateAmountGbp: number;
  rateLabel: string | null;
};

export type PayPeriodTeacherTotal = {
  teacherId: string;
  teacherName: string;
  teacherEmail: string;
  sessionCount: number;
  grossGbp: number;
  ratesUsed: string[];
  markedPaidAt: string | null;
  sessions: PayPeriodSessionRow[];
  /** Phase 3.5 — payment details on file (masked). */
  hasPaymentDetails?: boolean;
  paymentMethodLabel?: string | null;
  paymentPayeeMask?: string | null;
  paymentRecentlyChanged?: boolean;
};

/** Calendar month key: YYYY-MM */
export function monthPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthPeriodKey(key: string): {
  year: number;
  month: number;
} | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;
  return { year, month };
}

/** Inclusive UTC bounds for a calendar month in Europe/London display terms — use local date strings. */
export function monthDateBounds(year: number, month: number): {
  startIso: string;
  endIso: string;
  label: string;
} {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const label = start.toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    label,
  };
}

export function formatGbp(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
}

/** Pick the rate in force on a class start date (YYYY-MM-DD or ISO). */
export function rateForClassDate(
  rates: TeacherPayRate[],
  scheduledStartIso: string,
): TeacherPayRate | null {
  if (!rates.length) return null;
  const day = scheduledStartIso.slice(0, 10);
  const eligible = rates
    .filter((r) => r.effective_from <= day)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  return eligible[0] ?? null;
}
