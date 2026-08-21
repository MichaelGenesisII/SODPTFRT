"use server";

import { revalidatePath } from "next/cache";
import {
  formatCohortLabel,
  slugifyCohortName,
  type Cohort,
  type ProgrammeType,
} from "@/lib/cohorts";
import { isNationalAdmin, requireSessionAdmin } from "@/lib/admin/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CohortActionResult = {
  ok: boolean;
  message: string;
  cohortId?: string;
};

function unauthorized(): CohortActionResult {
  return { ok: false, message: "Unauthorized." };
}

async function requireNational(): Promise<CohortActionResult | null> {
  const actor = await requireSessionAdmin();
  if (!isNationalAdmin(actor)) {
    return { ok: false, message: "National desk only." };
  }
  return null;
}

export async function listCohortsForAdmin(): Promise<Cohort[]> {
  await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cohorts")
    .select(
      "id, name, slug, year_start, year_end, programme_type, is_active, created_at, updated_at",
    )
    .order("year_start", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("[cohorts list]", error.message);
    return [];
  }
  return (data ?? []) as Cohort[];
}

export async function listActiveCohortsForEnrol(): Promise<
  Pick<Cohort, "id" | "name" | "year_start" | "year_end" | "programme_type">[]
> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("cohorts")
    .select("id, name, year_start, year_end, programme_type")
    .eq("is_active", true)
    .order("year_start", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("[cohorts enrol]", error.message);
    return [];
  }
  return data ?? [];
}

export async function createCohort(input: {
  name: string;
  yearStart: number;
  yearEnd: number;
  programmeType: ProgrammeType;
}): Promise<CohortActionResult> {
  try {
    const gate = await requireNational();
    if (gate) return gate;

    const name = input.name.trim();
    if (name.length < 2) {
      return { ok: false, message: "Cohort name is required." };
    }
    if (input.yearEnd < input.yearStart) {
      return { ok: false, message: "End year must be on or after start year." };
    }

    const slug = slugifyCohortName(name);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("cohorts")
      .insert({
        name,
        slug,
        year_start: input.yearStart,
        year_end: input.yearEnd,
        programme_type: input.programmeType,
        is_active: true,
      })
      .select("id")
      .maybeSingle();

    if (error) {
      if (/duplicate|unique/i.test(error.message)) {
        return { ok: false, message: "A cohort with that name already exists." };
      }
      return { ok: false, message: publicActionMessage(error.message) };
    }

    revalidatePath("/admin/cohorts");
    revalidatePath("/admin/parishes");
    return {
      ok: true,
      message: `Created ${formatCohortLabel({
        name,
        year_start: input.yearStart,
        year_end: input.yearEnd,
      })}.`,
      cohortId: data?.id,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return { ok: false, message: publicActionMessage(error) };
  }
}

export async function updateCohort(
  cohortId: string,
  input: {
    name: string;
    yearStart: number;
    yearEnd: number;
    programmeType: ProgrammeType;
    isActive: boolean;
  },
): Promise<CohortActionResult> {
  try {
    const gate = await requireNational();
    if (gate) return gate;
    if (!cohortId) return { ok: false, message: "Cohort is required." };

    const name = input.name.trim();
    if (name.length < 2) {
      return { ok: false, message: "Cohort name is required." };
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("cohorts")
      .update({
        name,
        slug: slugifyCohortName(name),
        year_start: input.yearStart,
        year_end: input.yearEnd,
        programme_type: input.programmeType,
        is_active: input.isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cohortId)
      .select("id")
      .maybeSingle();

    if (error) {
      return { ok: false, message: publicActionMessage(error.message) };
    }
    if (!data) {
      return { ok: false, message: "Cohort not found." };
    }

    revalidatePath("/admin/cohorts");
    revalidatePath("/admin/parishes");
    return { ok: true, message: "Cohort updated." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return { ok: false, message: publicActionMessage(error) };
  }
}

export async function assignBatchToCohort(
  batchId: string,
  cohortId: string | null,
): Promise<CohortActionResult> {
  try {
    const gate = await requireNational();
    if (gate) return gate;
    if (!batchId) return { ok: false, message: "Batch is required." };

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("batches")
      .update({
        cohort_id: cohortId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", batchId)
      .select("id")
      .maybeSingle();

    if (error) {
      return { ok: false, message: publicActionMessage(error.message) };
    }
    if (!data) {
      return { ok: false, message: "Batch not found." };
    }

    revalidatePath("/admin/cohorts");
    revalidatePath("/admin/parishes");
    return {
      ok: true,
      message: cohortId ? "Batch linked to cohort." : "Batch unlinked from cohort.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return { ok: false, message: publicActionMessage(error) };
  }
}
