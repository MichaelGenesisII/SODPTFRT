import type { IntakeKey } from "@/lib/cohorts/intake";

export type EnrolIntakeContext = {
  intakeKey: IntakeKey;
  intakeLabel: string;
  enrolOpen: boolean;
  enrolClosesLabel: string | null;
  year1SaturdaySlots: readonly (1 | 2 | 3 | 4)[];
  saturdayForced: boolean;
  programmeCohortId: string | null;
};
