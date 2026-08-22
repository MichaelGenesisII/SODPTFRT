/** DB may still store legacy enum values; the platform only runs School of Disciples. */
export type ProgrammeType = "sp" | "ep" | "other";

export type Cohort = {
  id: string;
  name: string;
  slug: string;
  year_start: number;
  year_end: number;
  programme_type: ProgrammeType;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StudentPlacement = {
  id: string;
  user_id: string;
  enrolment_id: string | null;
  cohort_id: string | null;
  batch_id: string | null;
  parish_id: string | null;
  reason: string | null;
  started_at: string;
  ended_at: string | null;
  created_by: string | null;
  created_at: string;
  cohort_name?: string | null;
  batch_label?: string | null;
  parish_name?: string | null;
};

/** Only programme offered on this platform. */
export const DEFAULT_PROGRAMME_TYPE: ProgrammeType = "sp";

export const PROGRAMME_TYPE_LABELS: Record<ProgrammeType, string> = {
  sp: "School of Disciples",
  ep: "School of Disciples",
  other: "School of Disciples",
};

export function slugifyCohortName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

export function formatCohortLabel(
  cohort: Pick<Cohort, "name" | "year_start" | "year_end">,
): string {
  const years =
    cohort.year_start === cohort.year_end
      ? String(cohort.year_start)
      : `${cohort.year_start}/${String(cohort.year_end).slice(-2)}`;
  return `${cohort.name} (${years})`;
}

export function formatCohortYears(
  yearStart: number,
  yearEnd: number,
): string {
  if (yearStart === yearEnd) return String(yearStart);
  return `${yearStart}/${String(yearEnd).slice(-2)}`;
}
