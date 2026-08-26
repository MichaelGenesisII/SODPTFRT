"use server";

import {
  withSaturdayBalance,
  type SaturdayCohort,
  type SaturdayCohortOption,
} from "@/lib/cohorts/saturday";
import type { Cohort } from "@/lib/cohorts";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function listActiveProgrammeYearsForEnrol(): Promise<
  Pick<Cohort, "id" | "name" | "year_start" | "year_end" | "is_active">[]
> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("cohorts")
    .select("id, name, year_start, year_end, is_active")
    .eq("is_active", true)
    .order("year_start", { ascending: false });

  if (error) {
    console.error("[enrol] list programme years", error);
    return [];
  }
  return data ?? [];
}

export async function listSaturdayCohortsForEnrol(
  programmeCohortId?: string | null,
): Promise<SaturdayCohortOption[]> {
  const service = createServiceSupabaseClient();

  let yearId = programmeCohortId?.trim() || null;
  if (!yearId) {
    const years = await listActiveProgrammeYearsForEnrol();
    yearId = years[0]?.id ?? null;
  }
  if (!yearId) return [];

  const { data: rows, error } = await service
    .from("saturday_cohorts")
    .select("id, programme_cohort_id, saturday_slot, label, is_active")
    .eq("programme_cohort_id", yearId)
    .eq("is_active", true)
    .order("saturday_slot", { ascending: true });

  if (error) {
    console.error("[enrol] list saturday cohorts", error);
    return [];
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

  return withSaturdayBalance(cohorts);
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
    // Unique (parish_id, name) conflict — fetch again
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
