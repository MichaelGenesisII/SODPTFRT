import { createServiceSupabaseClient } from "@/lib/supabase/service";

import type { ClassAudience } from "@/lib/classes/types";



export type ClassInviteRecipient = {

  id: string;

  email: string;

  firstName: string;

};



export async function listClassAudienceRecipients(input: {

  audience: ClassAudience;

  parishId: string | null;

  batchId: string | null;

  cohortId?: string | null;

  year?: number | null;

}): Promise<ClassInviteRecipient[]> {

  const service = createServiceSupabaseClient();



  if (input.audience === "everyone") {

    const { data } = await service

      .from("student_profiles")

      .select("id, email, first_name")

      .eq("is_active", true)

      .limit(2500);

    return (data ?? []).map((row) => ({

      id: row.id,

      email: row.email,

      firstName: row.first_name || "friend",

    }));

  }



  let enrolmentQuery = service

    .from("enrolments")

    .select("user_id, created_at, cohorts(year_start)")

    .order("created_at", { ascending: false })

    .limit(5000);



  if (input.audience === "parish" && input.parishId) {

    enrolmentQuery = enrolmentQuery.eq("parish_id", input.parishId);

  } else if (input.audience === "batch" && input.batchId) {

    enrolmentQuery = enrolmentQuery.eq("batch_id", input.batchId);

  } else if (input.audience === "cohort" && input.cohortId) {

    enrolmentQuery = enrolmentQuery.eq("cohort_id", input.cohortId);

  } else if (input.audience === "year" && input.year != null) {
    enrolmentQuery = enrolmentQuery.not("cohort_id", "is", null);
  } else {

    return [];

  }



  const { data: enrolments } = await enrolmentQuery;



  function cohortYearStart(row: {

    cohorts?: { year_start: number } | { year_start: number }[] | null;

  }): number | null {

    const value = row.cohorts;

    if (!value) return null;

    const cohort = Array.isArray(value) ? value[0] : value;

    return cohort?.year_start ?? null;

  }



  const userIds = [

    ...new Set(

      (enrolments ?? [])

        .filter((row) => {

          if (input.audience !== "year" || input.year == null) return true;

          return cohortYearStart(row) === input.year;

        })

        .map((e) => e.user_id)

        .filter(Boolean),

    ),

  ] as string[];

  if (!userIds.length) return [];



  const { data: profiles } = await service

    .from("student_profiles")

    .select("id, email, first_name")

    .eq("is_active", true)

    .in("id", userIds);



  return (profiles ?? []).map((row) => ({

    id: row.id,

    email: row.email,

    firstName: row.first_name || "friend",

  }));

}

