"use server";

import {
  resolveIntakeForEnrolment,
  type IntakeKey,
} from "@/lib/cohorts/intake";
import {
  withSaturdayBalance,
  type SaturdayCohort,
  type SaturdayCohortOption,
} from "@/lib/cohorts/saturday";
import type { Cohort } from "@/lib/cohorts";
import type { EnrolIntakeContext } from "@/lib/enrol/intake-context";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function getEnrolIntakeContext(
  asOf: Date = new Date(),
): Promise<EnrolIntakeContext> {
  const assignment = resolveIntakeForEnrolment(asOf);
  const service = createServiceSupabaseClient();
  const { data: cohortRow } = await service
    .from("cohorts")
    .select("id")
    .eq("is_fixed_intake", true)
    .eq("intake_key", assignment.intakeKey)
    .maybeSingle();

  return {
    intakeKey: assignment.intakeKey,
    intakeLabel: assignment.label,
    enrolOpen: assignment.enrolOpen,
    enrolClosesLabel: assignment.enrolClosesLabel,
    year1SaturdaySlots: assignment.year1SaturdaySlots,
    saturdayForced: assignment.saturdayForced,
    programmeCohortId: cohortRow?.id ?? null,
  };
}

export async function listActiveProgrammeYearsForEnrol(): Promise<
  Pick<Cohort, "id" | "name" | "year_start" | "year_end" | "is_active">[]
> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("cohorts")
    .select("id, name, year_start, year_end, is_active")
    .eq("is_fixed_intake", true)
    .eq("is_active", true)
    .order("intake_key", { ascending: true });

  if (error) {
    console.error("[enrol] list fixed intakes", error);
    return [];
  }
  return data ?? [];
}

export async function listSaturdayCohortsForEnrol(
  asOf: Date = new Date(),
): Promise<{
  context: EnrolIntakeContext;
  options: SaturdayCohortOption[];
}> {
  const context = await getEnrolIntakeContext(asOf);
  const service = createServiceSupabaseClient();

  if (!context.programmeCohortId) {
    console.error("[enrol] fixed intake cohort missing", context.intakeKey);
    return { context, options: [] };
  }

  const { data: rows, error } = await service
    .from("saturday_cohorts")
    .select("id, programme_cohort_id, saturday_slot, label, is_active")
    .eq("programme_cohort_id", context.programmeCohortId)
    .eq("is_active", true)
    .in("saturday_slot", [...context.year1SaturdaySlots])
    .order("saturday_slot", { ascending: true });

  if (error) {
    console.error("[enrol] list saturday cohorts", error);
    return { context, options: [] };
  }

  const cohorts: SaturdayCohort[] = [];
  for (const row of rows ?? []) {
    const { count, error: countError } = await service
      .from("enrolments")
      .select("id", { count: "exact", head: true })
      .eq("saturday_cohort_id", row.id)
      .neq("status", "rejected");
    if (countError) {
      console.error("[enrol] saturday count", countError);
    }
    cohorts.push({
      id: row.id,
      programme_cohort_id: row.programme_cohort_id,
      saturday_slot: row.saturday_slot as 1 | 2 | 3 | 4,
      label: row.label,
      is_active: row.is_active,
      enrolment_count: count ?? 0,
    });
  }

  return {
    context,
    options: withSaturdayBalance(cohorts),
  };
}

export async function resolveFixedIntakeCohortId(
  intakeKey: IntakeKey,
): Promise<string | null> {
  const service = createServiceSupabaseClient();
  const { data } = await service
    .from("cohorts")
    .select("id")
    .eq("is_fixed_intake", true)
    .eq("intake_key", intakeKey)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Find or create an open parish batch linked to the programme year,
 * so existing parish/batch triggers and Zoom scoping keep working.
 */
export async function ensureParishYearBatch(input: {
  parishId: string;
  programmeCohortId: string;
  year: number;
  yearLabel: string;
}): Promise<{ id: string } | { error: string }> {
  const service = createServiceSupabaseClient();
  const { data: existing } = await service
    .from("batches")
    .select("id")
    .eq("parish_id", input.parishId)
    .eq("cohort_id", input.programmeCohortId)
    .eq("is_active", true)
    .order("enrolment_open", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await service
      .from("batches")
      .update({ enrolment_open: true })
      .eq("id", existing.id);
    return { id: existing.id };
  }

  const name = input.yearLabel.slice(0, 120) || `Year ${input.year}`;
  const { data: created, error } = await service
    .from("batches")
    .insert({
      parish_id: input.parishId,
      cohort_id: input.programmeCohortId,
      name,
      year: input.year,
      enrolment_open: true,
      is_active: true,
    })
    .select("id")
    .maybeSingle();

  if (error || !created) {
    const { data: retry } = await service
      .from("batches")
      .select("id")
      .eq("parish_id", input.parishId)
      .eq("name", name)
      .maybeSingle();
    if (retry?.id) {
      await service
        .from("batches")
        .update({
          cohort_id: input.programmeCohortId,
          enrolment_open: true,
          is_active: true,
        })
        .eq("id", retry.id);
      return { id: retry.id };
    }
    console.error("[enrol] ensure parish year batch", error);
    return { error: "Could not reserve a seat for that parish." };
  }

  return { id: created.id };
}
