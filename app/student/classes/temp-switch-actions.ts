"use server";

import { revalidatePath } from "next/cache";
import { requireSessionStudent } from "@/lib/student/auth";
import {
  formatMonthLabel,
  monthStartIso,
  withSaturdayBalance,
} from "@/lib/cohorts/saturday";
import { publicActionMessage } from "@/lib/safe-action-message";
import { supportHref } from "@/lib/site-nav";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type TempSwitchResult = {
  ok: boolean;
  message: string;
};

export async function listMyTempSwitchOptions(): Promise<{
  homeSaturdayCohortId: string | null;
  homeLabel: string | null;
  forMonth: string;
  forMonthLabel: string;
  existingGuestId: string | null;
  existingGuestLabel: string | null;
  options: {
    id: string;
    label: string;
    saturday_slot: number;
    selectable: boolean;
    recommended: boolean;
  }[];
  missMonthSupportHref: string;
}> {
  const profile = await requireSessionStudent();
  const forMonth = monthStartIso();
  const empty = {
    homeSaturdayCohortId: null,
    homeLabel: null,
    forMonth,
    forMonthLabel: formatMonthLabel(forMonth),
    existingGuestId: null,
    existingGuestLabel: null,
    options: [],
    missMonthSupportHref: supportHref,
  };

  const service = createServiceSupabaseClient();
  const { data: enrolment } = await service
    .from("enrolments")
    .select("id, saturday_cohort_id")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!enrolment?.saturday_cohort_id) return empty;

  const { data: home } = await service
    .from("saturday_cohorts")
    .select("id, label, programme_cohort_id, saturday_slot, is_active")
    .eq("id", enrolment.saturday_cohort_id)
    .maybeSingle();

  if (!home) return empty;

  const { data: existing } = await service
    .from("cohort_temp_switches")
    .select("id, guest_saturday_cohort_id")
    .eq("enrolment_id", enrolment.id)
    .eq("for_month", forMonth)
    .maybeSingle();

  let existingGuestLabel: string | null = null;
  if (existing?.guest_saturday_cohort_id) {
    const { data: guest } = await service
      .from("saturday_cohorts")
      .select("label")
      .eq("id", existing.guest_saturday_cohort_id)
      .maybeSingle();
    existingGuestLabel = guest?.label ?? null;
  }

  const { data: siblings } = await service
    .from("saturday_cohorts")
    .select("id, programme_cohort_id, saturday_slot, label, is_active")
    .eq("programme_cohort_id", home.programme_cohort_id)
    .eq("is_active", true)
    .neq("id", home.id)
    .order("saturday_slot", { ascending: true });

  const counted = [];
  for (const slot of siblings ?? []) {
    const { count } = await service
      .from("enrolments")
      .select("id", { count: "exact", head: true })
      .eq("saturday_cohort_id", slot.id)
      .neq("status", "rejected");
    counted.push({
      id: slot.id,
      programme_cohort_id: slot.programme_cohort_id,
      saturday_slot: slot.saturday_slot as 1 | 2 | 3 | 4,
      label: slot.label,
      is_active: slot.is_active,
      enrolment_count: count ?? 0,
    });
  }

  const balanced = withSaturdayBalance(counted);

  return {
    homeSaturdayCohortId: home.id,
    homeLabel: home.label,
    forMonth,
    forMonthLabel: formatMonthLabel(forMonth),
    existingGuestId: existing?.guest_saturday_cohort_id ?? null,
    existingGuestLabel,
    options: balanced.map((c) => ({
      id: c.id,
      label: c.label,
      saturday_slot: c.saturday_slot,
      selectable: c.selectable,
      recommended: c.recommended,
    })),
    missMonthSupportHref: supportHref,
  };
}

export async function requestTempCohortSwitch(input: {
  guestSaturdayCohortId: string;
  reason?: string;
}): Promise<TempSwitchResult> {
  try {
    const profile = await requireSessionStudent();
    const guestId = input.guestSaturdayCohortId.trim();
    if (!guestId) {
      return { ok: false, message: "Choose a Saturday to attend this month." };
    }

    const service = createServiceSupabaseClient();
    const forMonth = monthStartIso();

    const { data: enrolment } = await service
      .from("enrolments")
      .select("id, saturday_cohort_id")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!enrolment?.id || !enrolment.saturday_cohort_id) {
      return {
        ok: false,
        message: "No home Saturday cohort is on your record yet.",
      };
    }

    if (guestId === enrolment.saturday_cohort_id) {
      return {
        ok: false,
        message: "Pick a different Saturday from your home cohort.",
      };
    }

    const { data: home } = await service
      .from("saturday_cohorts")
      .select("id, programme_cohort_id")
      .eq("id", enrolment.saturday_cohort_id)
      .maybeSingle();
    const { data: guest } = await service
      .from("saturday_cohorts")
      .select("id, programme_cohort_id, label, is_active")
      .eq("id", guestId)
      .maybeSingle();

    if (!home || !guest?.is_active) {
      return { ok: false, message: "That Saturday cohort is not available." };
    }
    if (guest.programme_cohort_id !== home.programme_cohort_id) {
      return {
        ok: false,
        message: "Guest Saturday must be in the same programme year.",
      };
    }

    const { error } = await service.from("cohort_temp_switches").upsert(
      {
        user_id: profile.id,
        enrolment_id: enrolment.id,
        home_saturday_cohort_id: enrolment.saturday_cohort_id,
        guest_saturday_cohort_id: guestId,
        for_month: forMonth,
        reason: input.reason?.trim() || null,
        created_by: profile.id,
      },
      { onConflict: "enrolment_id,for_month" },
    );

    if (error) {
      console.error("[temp switch]", error);
      return {
        ok: false,
        message: publicActionMessage(
          error.message,
          "Could not save your temporary switch.",
        ),
      };
    }

    revalidatePath("/student/classes");
    return {
      ok: true,
      message: `Switched to ${guest.label} for ${formatMonthLabel(forMonth)}. Your home Saturday is unchanged.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Please sign in again." };
    }
    return { ok: false, message: publicActionMessage(error) };
  }
}

export async function clearTempCohortSwitch(): Promise<TempSwitchResult> {
  try {
    const profile = await requireSessionStudent();
    const service = createServiceSupabaseClient();
    const forMonth = monthStartIso();

    const { data: enrolment } = await service
      .from("enrolments")
      .select("id")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!enrolment?.id) {
      return { ok: false, message: "No enrolment found." };
    }

    await service
      .from("cohort_temp_switches")
      .delete()
      .eq("enrolment_id", enrolment.id)
      .eq("for_month", forMonth);

    revalidatePath("/student/classes");
    return {
      ok: true,
      message: "Temporary switch cleared for this month.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return { ok: false, message: "Please sign in again." };
    }
    return { ok: false, message: publicActionMessage(error) };
  }
}
