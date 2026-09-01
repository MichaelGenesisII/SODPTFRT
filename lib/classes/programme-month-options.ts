import type { ClassAudience } from "@/lib/classes/types";
import {
  INTAKE_LABELS,
  type IntakeKey,
} from "@/lib/cohorts/intake";

/** Programme years unlocked per calendar month (0 = Jan … 11 = Dec). */
const C1_MONTH_YEARS: Record<number, number[]> = {
  10: [1],
  11: [2],
  0: [3],
  1: [4],
  2: [5],
  3: [6],
  4: [7],
  5: [8],
  6: [9],
  7: [10],
};

const C2_MONTH_YEARS: Record<number, number[]> = {
  0: [1],
  1: [2, 3],
  2: [4, 5],
  3: [6],
  4: [7],
  5: [8],
  6: [9],
  7: [10],
};

const C3_MONTH_YEARS: Record<number, number[]> = {
  1: [1],
  2: [2, 3],
  3: [4, 5],
  4: [6, 7],
  5: [8],
  6: [9],
  7: [10],
};

const INTAKE_KEYS: IntakeKey[] = ["november", "january", "february"];

export type ProgrammeMonthOption = {
  value: number;
  label: string;
  hint?: string;
};

export function programmeYearsForIntakeMonth(
  intakeKey: IntakeKey,
  calendarMonthIndex: number,
): number[] {
  switch (intakeKey) {
    case "november":
      return C1_MONTH_YEARS[calendarMonthIndex] ?? [];
    case "january":
      return C2_MONTH_YEARS[calendarMonthIndex] ?? [];
    case "february":
      return C3_MONTH_YEARS[calendarMonthIndex] ?? [];
  }
}

export function programmeYearsForCalendarMonth(
  calendarMonthIndex: number,
): number[] {
  const years = new Set<number>();
  for (const intakeKey of INTAKE_KEYS) {
    for (const year of programmeYearsForIntakeMonth(
      intakeKey,
      calendarMonthIndex,
    )) {
      years.add(year);
    }
  }
  return [...years].sort((a, b) => a - b);
}

function optionHint(
  years: number[],
  index: number,
  intakeKey: IntakeKey | null,
): string | undefined {
  if (years.length <= 1) return undefined;
  if (intakeKey === "january" || intakeKey === "february") {
    return index === 0
      ? "Earlier class this month (1st–2nd Saturday pace)"
      : "Later class this month (3rd–4th Saturday pace)";
  }
  return index === 0 ? "Earlier class this month" : "Later class this month";
}

export function buildProgrammeMonthOptions(input: {
  audience: ClassAudience;
  intakeKey?: IntakeKey | null;
  programmeYear?: number | null;
  scheduleDate: Date;
}): ProgrammeMonthOption[] {
  const monthIndex = input.scheduleDate.getMonth();
  let years: number[] = [];

  if (input.audience === "year" && input.programmeYear) {
    years = [input.programmeYear];
  } else if (input.audience === "cohort") {
    years = input.intakeKey
      ? programmeYearsForIntakeMonth(input.intakeKey, monthIndex)
      : [];
  } else {
    years = programmeYearsForCalendarMonth(monthIndex);
  }

  return years.map((year, index) => ({
    value: year,
    label: `Year ${year} → Exam Year ${year}`,
    hint: optionHint(years, index, input.intakeKey ?? null),
  }));
}

export function programmeMonthFieldCopy(input: {
  audience: ClassAudience;
  intakeKey?: IntakeKey | null;
  scheduleDate: Date;
  optionCount: number;
}): string {
  const monthName = input.scheduleDate.toLocaleDateString("en-GB", {
    month: "long",
  });

  if (input.optionCount === 0) {
    if (input.audience === "cohort") {
      if (input.intakeKey) {
        return `${INTAKE_LABELS[input.intakeKey]} has no programme class in ${monthName}. Pick another start date or leave unlock off.`;
      }
      return `Choose a cohort first, then pick the exam year this class unlocks.`;
    }
    return `No programme years are scheduled in ${monthName} for the fixed intakes. Pick another start date or leave unlock off.`;
  }

  if (input.optionCount > 1) {
    if (input.audience === "cohort" && input.intakeKey) {
      return `${INTAKE_LABELS[input.intakeKey]} covers ${input.optionCount} programme years in ${monthName} — choose which exam year this session unlocks.`;
    }
    return `Several programme years run in ${monthName} across Cohorts 2 and 3 — choose which exam year this session unlocks.`;
  }

  return "Present attendance for this class unlocks that year paper on Records.";
}
