import type { Cohort } from "@/lib/cohorts";

export const COHORT_INSIGHT_PAGE_SIZE = 12;

export type CohortInsightSaturdaySlot = {
  slot: 1 | 2 | 3 | 4;
  label: string;
  count: number;
};

export type CohortInsightSummary = {
  cohort: Cohort;
  linkedBatches: number;
  studentTotal: number;
  saturdaySlots: CohortInsightSaturdaySlot[];
};

export type CohortInsightStudentRow = {
  profileId: string;
  displayName: string;
  email: string;
  parishName: string | null;
  batchLabel: string | null;
  saturdayLabel: string | null;
  status: string;
  isActive: boolean;
};
