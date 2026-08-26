export const SATURDAY_SLOT_LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: "1st Saturday",
  2: "2nd Saturday",
  3: "3rd Saturday",
  4: "4th Saturday",
};

export const SATURDAY_COHORT_HINT =
  "Classes run 10am–4pm once a month on your Saturday of the month.";

/** Soft-balance: year target used only to size the buffer. */
export const SATURDAY_YEAR_TARGET = 400;
export const SATURDAY_SOFT_BUFFER_FLOOR = 8;
export const SATURDAY_SOFT_BUFFER_PERCENT = 0.05;

export type SaturdayCohort = {
  id: string;
  programme_cohort_id: string;
  saturday_slot: 1 | 2 | 3 | 4;
  label: string;
  is_active: boolean;
  enrolment_count: number;
};

export type SaturdayCohortOption = SaturdayCohort & {
  selectable: boolean;
  recommended: boolean;
  relativeToFair: number;
};

export function softBalanceBuffer(yearTarget = SATURDAY_YEAR_TARGET): number {
  return Math.max(
    SATURDAY_SOFT_BUFFER_FLOOR,
    Math.ceil((SATURDAY_SOFT_BUFFER_PERCENT * yearTarget) / 4),
  );
}

export function withSaturdayBalance(
  cohorts: SaturdayCohort[],
): SaturdayCohortOption[] {
  if (!cohorts.length) return [];
  const counts = cohorts.map((c) => c.enrolment_count);
  const min = Math.min(...counts);
  const total = counts.reduce((a, b) => a + b, 0);
  const fair = total > 0 ? total / cohorts.length : 0;
  const buffer = softBalanceBuffer();
  const lowestId = [...cohorts].sort(
    (a, b) =>
      a.enrolment_count - b.enrolment_count ||
      a.saturday_slot - b.saturday_slot,
  )[0]?.id;

  return cohorts
    .map((c) => ({
      ...c,
      selectable: c.enrolment_count <= min + buffer,
      recommended: c.id === lowestId,
      relativeToFair: Math.round(c.enrolment_count - fair),
    }))
    .sort((a, b) => a.saturday_slot - b.saturday_slot);
}

export function monthStartIso(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function formatMonthLabel(monthIso: string): string {
  const d = new Date(`${monthIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return monthIso;
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
