/**
 * Fixed programme intakes (v3): November, January, February.
 * Students are auto-assigned — they never pick an intake on the form.
 */

export const INTAKE_KEYS = ["november", "january", "february"] as const;
export type IntakeKey = (typeof INTAKE_KEYS)[number];

export const INTAKE_LABELS: Record<IntakeKey, string> = {
  november: "Cohort 1 — November intake",
  january: "Cohort 2 — January intake",
  february: "Cohort 3 — February intake",
};

export const INTAKE_SLUGS: Record<IntakeKey, string> = {
  november: "cohort-1-november",
  january: "cohort-2-january",
  february: "cohort-3-february",
};

/** Programme years when C2/C3 merge with C1 / all. */
export const MERGE_C2_C1_AT_YEAR = 5;
export const MERGE_ALL_AT_YEAR = 7;

export type EnrolIntakeAssignment = {
  intakeKey: IntakeKey;
  label: string;
  /** Saturday slots (1–4) offered on the enrolment form for Year 1. */
  year1SaturdaySlots: readonly (1 | 2 | 3 | 4)[];
  /** True when only one Year-1 Saturday remains (late join → that class). */
  saturdayForced: boolean;
  enrolOpen: boolean;
  enrolClosesLabel: string | null;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Calendar month of Year 1 classes for an intake. */
export function year1ClassMonth(
  intakeKey: IntakeKey,
  cycleYear: number,
): {
  year: number;
  monthIndex: number;
  baseSlots: readonly (1 | 2 | 3 | 4)[];
} {
  switch (intakeKey) {
    case "november":
      return { year: cycleYear, monthIndex: 10, baseSlots: [1, 2, 3, 4] };
    case "january":
      return { year: cycleYear + 1, monthIndex: 0, baseSlots: [3, 4] };
    case "february":
      return { year: cycleYear + 1, monthIndex: 1, baseSlots: [3, 4] };
    default:
      return { year: cycleYear, monthIndex: 10, baseSlots: [1, 2, 3, 4] };
  }
}

/**
 * Year-1 Saturday slots whose class day has not yet passed.
 * Late enrolment only offers remaining classes — often just the last Saturday.
 */
export function availableYear1SaturdaySlots(
  intakeKey: IntakeKey,
  cycleYear: number,
  asOf: Date = new Date(),
): (1 | 2 | 3 | 4)[] {
  const { year, monthIndex, baseSlots } = year1ClassMonth(intakeKey, cycleYear);
  const today = startOfDay(asOf);
  const remaining: (1 | 2 | 3 | 4)[] = [];
  for (const slot of baseSlots) {
    const classDate = nthSaturdayOfMonth(year, monthIndex, slot);
    if (!classDate) continue;
    if (!isAfter(today, startOfDay(classDate))) {
      remaining.push(slot);
    }
  }
  if (remaining.length === 0 && baseSlots.length > 0) {
    return [baseSlots[baseSlots.length - 1]!];
  }
  return remaining;
}

/** Nth Saturday of a calendar month (1-based). Returns null if month has fewer. */
export function nthSaturdayOfMonth(year: number, monthIndex: number, n: 1 | 2 | 3 | 4): Date | null {
  let count = 0;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, monthIndex, day);
    if (d.getDay() === 6) {
      count += 1;
      if (count === n) return d;
    }
  }
  return null;
}

/** Friday immediately before a given date (same week). */
export function fridayBefore(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 5 ? 0 : day === 6 ? 1 : day + 2;
  d.setDate(d.getDate() - diff);
  return d;
}

export function year1EnrolDeadline(intakeKey: IntakeKey, cycleYear: number): Date {
  switch (intakeKey) {
    case "november": {
      const fourth = nthSaturdayOfMonth(cycleYear, 10, 4);
      if (!fourth) return new Date(cycleYear, 10, 28);
      return fridayBefore(fourth);
    }
    case "january": {
      const year = cycleYear + 1;
      const fourth = nthSaturdayOfMonth(year, 0, 4);
      if (!fourth) return new Date(year, 0, 28);
      return fridayBefore(fourth);
    }
    case "february": {
      const year = cycleYear + 1;
      const fourth = nthSaturdayOfMonth(year, 1, 4);
      if (!fourth) return new Date(year, 1, 28);
      return fridayBefore(fourth);
    }
    default:
      return new Date(cycleYear, 10, 28);
  }
}

function dayAfter(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Enrolment windows (not class start dates):
 * - C1: from 1 Sep of the cycle year
 * - C2: day after C1 closes (covers Dec → early Jan)
 * - C3: day after C2 closes
 */
function year1EnrolOpens(intakeKey: IntakeKey, cycleYear: number): Date {
  switch (intakeKey) {
    case "november":
      return new Date(cycleYear, 8, 1);
    case "january":
      return dayAfter(year1EnrolDeadline("november", cycleYear));
    case "february":
      return dayAfter(year1EnrolDeadline("january", cycleYear));
    default:
      return new Date(cycleYear, 8, 1);
  }
}

/** Programme cycle year: November intake anchor (Nov in cycleYear → Feb in cycleYear+1). */
export function programmeCycleYear(asOf: Date = new Date()): number {
  const y = asOf.getFullYear();
  const m = asOf.getMonth();
  return m >= 10 ? y : y - 1;
}

function isAfter(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() > startOfDay(b).getTime();
}

function isBefore(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() < startOfDay(b).getTime();
}

function formatEnrolClose(deadline: Date): string {
  return deadline.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Resolve which fixed intake a new applicant joins from today's date.
 * Windows: C1 until Fri before 4th Sat Nov → C2 until Fri before 4th Sat Jan →
 * C3 until Fri before 4th Sat Feb → next C1 (November).
 */
export function resolveIntakeForEnrolment(
  asOf: Date = new Date(),
): EnrolIntakeAssignment {
  const cycle = programmeCycleYear(asOf);
  const d = startOfDay(asOf);

  const windows: { key: IntakeKey; slots: readonly (1 | 2 | 3 | 4)[] }[] = [
    { key: "november", slots: [1, 2, 3, 4] },
    { key: "january", slots: [3, 4] },
    { key: "february", slots: [3, 4] },
  ];

  for (const w of windows) {
    const opens = year1EnrolOpens(w.key, cycle);
    const closes = year1EnrolDeadline(w.key, cycle);
    if (!isBefore(d, opens) && !isAfter(d, closes)) {
      const slots = availableYear1SaturdaySlots(w.key, cycle, d);
      return {
        intakeKey: w.key,
        label: INTAKE_LABELS[w.key],
        year1SaturdaySlots: slots,
        saturdayForced: slots.length === 1,
        enrolOpen: true,
        enrolClosesLabel: formatEnrolClose(closes),
      };
    }
  }

  // Between windows: assign next upcoming intake.
  for (const w of windows) {
    const opens = year1EnrolOpens(w.key, cycle);
    if (isBefore(d, opens)) {
      return {
        intakeKey: w.key,
        label: INTAKE_LABELS[w.key],
        year1SaturdaySlots: w.slots,
        saturdayForced: false,
        enrolOpen: false,
        enrolClosesLabel: formatEnrolClose(year1EnrolDeadline(w.key, cycle)),
      };
    }
  }

  // After February close → next November cycle.
  const nextCycle = cycle + 1;
  return {
    intakeKey: "november",
    label: INTAKE_LABELS.november,
    year1SaturdaySlots: [1, 2, 3, 4],
    saturdayForced: false,
    enrolOpen: false,
    enrolClosesLabel: formatEnrolClose(year1EnrolDeadline("november", nextCycle)),
  };
}

/**
 * Saturday slots allowed for a student's home Saturday.
 * After full merge (Year 7+), or C2 from Year 5 with C1: all 4.
 * Fast-track before merge: odd Years → 3rd/4th; even Years → 1st/2nd.
 */
export function allowedSaturdaySlots(input: {
  intakeKey: IntakeKey;
  programmeYear: number;
  mergedAll?: boolean;
}): (1 | 2 | 3 | 4)[] {
  if (input.mergedAll || input.programmeYear >= MERGE_ALL_AT_YEAR) {
    return [1, 2, 3, 4];
  }
  if (input.intakeKey === "november") {
    return [1, 2, 3, 4];
  }
  if (
    input.intakeKey === "january" &&
    input.programmeYear >= MERGE_C2_C1_AT_YEAR
  ) {
    return [1, 2, 3, 4];
  }
  if (input.programmeYear % 2 === 1) {
    return [3, 4];
  }
  return [1, 2];
}

/** Whether intake C2 has merged into C1 pace (programme year ≥ 5 from March). */
export function isMergedWithC1(intakeKey: IntakeKey, programmeYear: number): boolean {
  if (intakeKey === "november") return true;
  if (intakeKey === "january") return programmeYear >= MERGE_C2_C1_AT_YEAR;
  return programmeYear >= MERGE_ALL_AT_YEAR;
}

export function isFullyMerged(intakeKey: IntakeKey, programmeYear: number): boolean {
  return programmeYear >= MERGE_ALL_AT_YEAR || intakeKey === "november";
}
