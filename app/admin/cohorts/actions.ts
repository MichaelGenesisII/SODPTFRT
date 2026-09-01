"use server";

import { revalidatePath } from "next/cache";
import {
  formatCohortLabel,
  slugifyCohortName,
  type Cohort,
  type ProgrammeType,
} from "@/lib/cohorts";
import {
  COHORT_INSIGHT_PAGE_SIZE,
  type CohortInsightStudentRow,
  type CohortInsightSummary,
} from "@/lib/admin/cohort-insight";
import { ENROLMENT_STATUS_META } from "@/lib/admin/students";
import { formatBatchLabel } from "@/lib/parishes";
import { SATURDAY_SLOT_LABELS } from "@/lib/cohorts/saturday";
import { isNationalAdmin, requireSessionAdmin } from "@/lib/admin/auth";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

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
      "id, name, slug, year_start, year_end, programme_type, is_active, intake_key, is_fixed_intake, created_at, updated_at",
    )
    .eq("is_fixed_intake", true)
    .order("intake_key", { ascending: true });

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

export async function createCohort(_input: {
  name: string;
  yearStart: number;
  yearEnd: number;
  programmeType: ProgrammeType;
}): Promise<CohortActionResult> {
  try {
    const gate = await requireNational();
    if (gate) return gate;

    return {
      ok: false,
      message:
        "Programme intakes are fixed (November, January, February). Manage students inside each cohort on the Desk.",
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

    revalidatePath("/admin/students");
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

    revalidatePath("/admin/students");
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

function enrolmentDisplayName(row: {
  first_name: string;
  middle_name: string | null;
  last_name: string;
}): string {
  return [row.first_name, row.middle_name, row.last_name]
    .filter(Boolean)
    .join(" ");
}

export async function getCohortInsightSummary(
  cohortId: string,
): Promise<CohortInsightSummary | null> {
  const gate = await requireNational();
  if (gate) return null;
  if (!cohortId) return null;

  const supabase = await createServerSupabaseClient();

  const [{ data: cohort }, { count: batchCount }, { data: saturdayRows }] =
    await Promise.all([
      supabase
        .from("cohorts")
        .select(
          "id, name, slug, year_start, year_end, programme_type, is_active, created_at, updated_at",
        )
        .eq("id", cohortId)
        .maybeSingle(),
      supabase
        .from("batches")
        .select("id", { count: "exact", head: true })
        .eq("cohort_id", cohortId),
      supabase
        .from("saturday_cohorts")
        .select("id, saturday_slot, label")
        .eq("programme_cohort_id", cohortId)
        .order("saturday_slot", { ascending: true }),
    ]);

  if (!cohort) return null;

  const { data: enrolRows } = await supabase
    .from("enrolments")
    .select("saturday_cohort_id")
    .eq("cohort_id", cohortId);

  const countBySaturday = new Map<string, number>();
  for (const row of enrolRows ?? []) {
    const id = row.saturday_cohort_id as string | null;
    if (!id) continue;
    countBySaturday.set(id, (countBySaturday.get(id) ?? 0) + 1);
  }

  const saturdaySlots = (saturdayRows ?? []).map((row) => ({
    slot: row.saturday_slot as 1 | 2 | 3 | 4,
    label: String(row.label),
    count: countBySaturday.get(row.id as string) ?? 0,
  }));

  return {
    cohort: cohort as Cohort,
    linkedBatches: batchCount ?? 0,
    studentTotal: enrolRows?.length ?? 0,
    saturdaySlots,
  };
}

export async function searchCohortInsightStudents(input: {
  cohortId: string;
  query?: string;
  saturdaySlot?: number | null;
  page?: number;
}): Promise<{
  rows: CohortInsightStudentRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const gate = await requireNational();
  if (gate) {
    return { rows: [], total: 0, page: 1, pageSize: COHORT_INSIGHT_PAGE_SIZE };
  }

  const pageSize = COHORT_INSIGHT_PAGE_SIZE;
  const page = Math.max(input.page ?? 1, 1);
  const offset = (page - 1) * pageSize;
  const q = (input.query ?? "").trim().toLowerCase();

  const supabase = await createServerSupabaseClient();

  let saturdayIds: string[] | null = null;
  if (input.saturdaySlot != null) {
    const { data: satRows } = await supabase
      .from("saturday_cohorts")
      .select("id")
      .eq("programme_cohort_id", input.cohortId)
      .eq("saturday_slot", input.saturdaySlot);
    saturdayIds = (satRows ?? []).map((r) => r.id as string);
    if (saturdayIds.length === 0) {
      return { rows: [], total: 0, page, pageSize };
    }
  }

  let request = supabase
    .from("enrolments")
    .select(
      "user_id, first_name, middle_name, last_name, email, status, parish_id, batch_id, saturday_cohort_id",
      { count: "exact" },
    )
    .eq("cohort_id", input.cohortId)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (saturdayIds) {
    request = request.in("saturday_cohort_id", saturdayIds);
  }

  if (q) {
    const safe = q.replace(/[%_,.()]/g, " ").replace(/\s+/g, " ").trim();
    if (safe) {
      const like = `%${safe}%`;
      request = request.or(
        [
          `first_name.ilike.${like}`,
          `last_name.ilike.${like}`,
          `middle_name.ilike.${like}`,
          `email.ilike.${like}`,
        ].join(","),
      );
    }
  }

  const { data: enrolments, count, error } = await request;
  if (error) {
    console.error("[cohort insight students]", error.message);
    return { rows: [], total: 0, page, pageSize };
  }

  const userIds = [...new Set((enrolments ?? []).map((e) => e.user_id as string))];
  const parishIds = [
    ...new Set(
      (enrolments ?? [])
        .map((e) => e.parish_id as string | null)
        .filter(Boolean),
    ),
  ] as string[];
  const batchIds = [
    ...new Set(
      (enrolments ?? [])
        .map((e) => e.batch_id as string | null)
        .filter(Boolean),
    ),
  ] as string[];
  const saturdayCohortIds = [
    ...new Set(
      (enrolments ?? [])
        .map((e) => e.saturday_cohort_id as string | null)
        .filter(Boolean),
    ),
  ] as string[];

  const [
    { data: profiles },
    { data: parishes },
    { data: batches },
    { data: saturdayCohorts },
  ] = await Promise.all([
    userIds.length
      ? supabase
          .from("student_profiles")
          .select("id, email, is_active")
          .in("id", userIds)
      : Promise.resolve({ data: [] as never[] }),
    parishIds.length
      ? supabase.from("parishes").select("id, name").in("id", parishIds)
      : Promise.resolve({ data: [] as never[] }),
    batchIds.length
      ? supabase.from("batches").select("id, name, year").in("id", batchIds)
      : Promise.resolve({ data: [] as never[] }),
    saturdayCohortIds.length
      ? supabase
          .from("saturday_cohorts")
          .select("id, label, saturday_slot")
          .in("id", saturdayCohortIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const profileByUser = new Map(
    (profiles ?? []).map((p) => [p.id as string, p]),
  );
  const parishName = new Map(
    (parishes ?? []).map((p) => [p.id as string, p.name as string]),
  );
  const batchLabel = new Map(
    (batches ?? []).map((b) => [
      b.id as string,
      formatBatchLabel({ name: b.name as string, year: b.year as number }),
    ]),
  );
  const saturdayLabel = new Map(
    (saturdayCohorts ?? []).map((s) => [
      s.id as string,
      (s.label as string) ||
        SATURDAY_SLOT_LABELS[s.saturday_slot as 1 | 2 | 3 | 4],
    ]),
  );

  const rows: CohortInsightStudentRow[] = (enrolments ?? []).map((row) => {
    const userId = row.user_id as string;
    const profile = profileByUser.get(userId);
    const statusKey = row.status as keyof typeof ENROLMENT_STATUS_META;
    return {
      profileId: userId,
      displayName: enrolmentDisplayName({
        first_name: row.first_name as string,
        middle_name: (row.middle_name as string | null) ?? null,
        last_name: row.last_name as string,
      }),
      email: (profile?.email as string) ?? (row.email as string),
      parishName: row.parish_id
        ? (parishName.get(row.parish_id as string) ?? null)
        : null,
      batchLabel: row.batch_id
        ? (batchLabel.get(row.batch_id as string) ?? null)
        : null,
      saturdayLabel: row.saturday_cohort_id
        ? (saturdayLabel.get(row.saturday_cohort_id as string) ?? null)
        : null,
      status: ENROLMENT_STATUS_META[statusKey]?.label ?? String(row.status),
      isActive: profile?.is_active !== false,
    };
  });

  return {
    rows,
    total: count ?? rows.length,
    page,
    pageSize,
  };
}
