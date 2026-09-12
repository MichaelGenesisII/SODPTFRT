import { getFeePayment } from "@/lib/payments/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export const GRADUATION_MIN_ATTENDANCE_PERCENT = 75;
export const GRADUATION_MIN_EXAM_AVERAGE_PERCENT = 50;

export type GraduationChecklistItem = {
  id: string;
  label: string;
  met: boolean;
  detail: string;
};

export type GraduationEligibility = {
  eligible: boolean;
  bypassed: boolean;
  bypassReason: string | null;
  checklist: GraduationChecklistItem[];
};

type ProfileGateRow = {
  legacy_bypass_graduation_gate?: boolean | null;
  graduation_gate_override_note?: string | null;
};

export async function computeGraduationEligibility(
  supabase: SupabaseClient,
  userId: string,
  profile?: ProfileGateRow | null,
): Promise<GraduationEligibility> {
  let gateProfile = profile;
  if (!gateProfile) {
    const { data } = await supabase
      .from("student_profiles")
      .select(
        "legacy_bypass_graduation_gate, graduation_gate_override_note",
      )
      .eq("id", userId)
      .maybeSingle();
    gateProfile = data;
  }

  if (gateProfile?.legacy_bypass_graduation_gate) {
    return {
      eligible: true,
      bypassed: true,
      bypassReason: "Legacy alumni record",
      checklist: [],
    };
  }

  if (gateProfile?.graduation_gate_override_note?.trim()) {
    return {
      eligible: true,
      bypassed: true,
      bypassReason: gateProfile.graduation_gate_override_note.trim(),
      checklist: [],
    };
  }

  const graduationFee = await getFeePayment(supabase, userId, "graduation");
  const feePaid = graduationFee?.status === "paid";

  const { data: placement } = await supabase
    .from("student_placements")
    .select("id")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const placementId = placement?.id as string | undefined;

  let attendancePercent = 0;
  let sessionsTotal = 0;
  let sessionsPresent = 0;

  if (placementId) {
    const { data: sessions } = await supabase
      .from("student_record_sessions")
      .select("present")
      .eq("user_id", userId)
      .eq("placement_id", placementId);

    sessionsTotal = sessions?.length ?? 0;
    sessionsPresent =
      sessions?.filter((row) => row.present === true).length ?? 0;
    attendancePercent =
      sessionsTotal > 0
        ? Math.round((sessionsPresent / sessionsTotal) * 100)
        : 0;
  }

  const attendanceMet =
    sessionsTotal > 0 &&
    attendancePercent >= GRADUATION_MIN_ATTENDANCE_PERCENT;

  let examAverage = 0;
  let examCount = 0;

  if (placementId) {
    const { data: entries } = await supabase
      .from("student_record_entries")
      .select("percent")
      .eq("user_id", userId)
      .eq("placement_id", placementId)
      .not("percent", "is", null);

    const percents = (entries ?? [])
      .map((row) => Number(row.percent))
      .filter((value) => Number.isFinite(value));
    examCount = percents.length;
    if (examCount > 0) {
      examAverage = Math.round(
        percents.reduce((sum, value) => sum + value, 0) / examCount,
      );
    }
  }

  const examsMet =
    examCount > 0 && examAverage >= GRADUATION_MIN_EXAM_AVERAGE_PERCENT;

  const checklist: GraduationChecklistItem[] = [
    {
      id: "fee",
      label: "Graduation fee paid",
      met: feePaid,
      detail: feePaid ? "Paid in full" : "Outstanding on Payments",
    },
    {
      id: "attendance",
      label: `Attendance at least ${GRADUATION_MIN_ATTENDANCE_PERCENT}%`,
      met: attendanceMet,
      detail:
        sessionsTotal === 0
          ? "Not started — no sessions recorded yet"
          : attendanceMet
            ? `${attendancePercent}% (${sessionsPresent}/${sessionsTotal} sessions)`
            : `${attendancePercent}% — below ${GRADUATION_MIN_ATTENDANCE_PERCENT}% (${sessionsPresent}/${sessionsTotal} sessions)`,
    },
    {
      id: "exams",
      label: `Exam average at least ${GRADUATION_MIN_EXAM_AVERAGE_PERCENT}%`,
      met: examsMet,
      detail:
        examCount === 0
          ? "Not started — no scored exam entries yet"
          : examsMet
            ? `${examAverage}% across ${examCount} scored entries`
            : `${examAverage}% — below ${GRADUATION_MIN_EXAM_AVERAGE_PERCENT}% across ${examCount} scored entries`,
    },
  ];

  const eligible = checklist.every((item) => item.met);

  return {
    eligible,
    bypassed: false,
    bypassReason: null,
    checklist,
  };
}
