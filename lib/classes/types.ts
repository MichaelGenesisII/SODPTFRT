export type ZoomClassStatus = "scheduled" | "live" | "ended" | "cancelled";

export type ClassAudience = "everyone" | "parish" | "batch" | "cohort" | "year";

export type AttendanceSource = "zoom" | "code" | "manual";

export type ZoomClass = {
  id: string;
  title: string;
  description: string | null;
  audience: ClassAudience;
  parish_id: string | null;
  batch_id: string | null;
  cohort_id: string | null;
  year: number | null;
  /**
   * Which programme month (1–10) this Saturday class unlocks for year exams.
   * Null = attendance does not unlock a year paper.
   */
  programme_month: number | null;
  scheduled_start: string;
  scheduled_end: string;
  duration_minutes: number;
  attendance_threshold_percent: number;
  attendance_code: string | null;
  zoom_meeting_id: string | null;
  zoom_meeting_uuid: string | null;
  zoom_join_url: string | null;
  zoom_start_url: string | null;
  zoom_passcode: string | null;
  status: ZoomClassStatus;
  created_by: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  parish_name?: string | null;
  batch_name?: string | null;
  batch_year?: number | null;
  cohort_name?: string | null;
  present_count?: number;
  matched_count?: number;
  attendance_rows?: number;
};

export type ZoomClassAttendance = {
  id: string;
  class_id: string;
  user_id: string | null;
  matched_email: string;
  zoom_display_name: string | null;
  duration_seconds: number;
  required_seconds: number;
  present: boolean;
  source: AttendanceSource;
  join_time: string | null;
  leave_time: string | null;
  synced_at: string;
  student_name?: string | null;
  student_email?: string | null;
};

export const DEFAULT_ATTENDANCE_THRESHOLD = 90;

export function requiredSecondsForClass(
  durationMinutes: number,
  thresholdPercent: number = DEFAULT_ATTENDANCE_THRESHOLD,
): number {
  const mins = Math.max(1, durationMinutes);
  const pct = Math.min(100, Math.max(1, thresholdPercent));
  return Math.ceil((mins * 60 * pct) / 100);
}

export function isPresentByDuration(
  durationSeconds: number,
  requiredSeconds: number,
): boolean {
  return durationSeconds >= requiredSeconds;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function audienceLabel(
  audience: ClassAudience,
  parishName?: string | null,
  batchName?: string | null,
  cohortName?: string | null,
  year?: number | null,
): string {
  if (audience === "everyone") return "Everyone";
  if (audience === "parish") {
    return parishName ? `Parish · ${parishName}` : "Parish";
  }
  if (audience === "cohort") {
    return cohortName ? `Cohort · ${cohortName}` : "Cohort";
  }
  if (audience === "year") {
    return year != null ? `Year · ${year}` : "Year";
  }
  return batchName ? `Batch · ${batchName}` : "Batch";
}
