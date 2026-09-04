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
  /** When true, desk allows listing check-in code on the student portal. */
  show_checkin_code_to_students?: boolean;
  /** Populated on student reads when admin enabled portal visibility. */
  student_checkin_code?: string | null;
  zoom_meeting_id: string | null;
  zoom_meeting_uuid: string | null;
  zoom_join_url: string | null;
  zoom_start_url: string | null;
  zoom_passcode: string | null;
  status: ZoomClassStatus;
  created_by: string | null;
  /** Assigned teacher for delivery / Finance (nullable until set). */
  primary_teacher_id?: string | null;
  primary_teacher_name?: string | null;
  primary_teacher_email?: string | null;
  /** Signed avatar URL for class detail UI (not stored). */
  primary_teacher_avatar_url?: string | null;
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
  /** From class_teaching_deliveries when joined. */
  teaching_delivery_status?: string | null;
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

/** Default scheduled class / Zoom length (6 hours). */
export const DEFAULT_CLASS_DURATION_MINUTES = 360;

export type ClassSessionPhase =
  | "upcoming"
  | "in_window"
  | "past"
  | "cancelled"
  | "ended";

export function requiredSecondsForClass(
  durationMinutes: number,
  thresholdPercent: number = DEFAULT_ATTENDANCE_THRESHOLD,
): number {
  const mins = Math.max(1, durationMinutes);
  const pct = Math.min(100, Math.max(1, thresholdPercent));
  return Math.ceil((mins * 60 * pct) / 100);
}

/** Present when a student stayed for at least threshold% of class duration. */
export function isPresentByDuration(
  durationSeconds: number,
  requiredSeconds: number,
): boolean {
  return Math.max(0, durationSeconds) >= Math.max(0, requiredSeconds);
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export function formatDurationMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h}h ${r}m`;
  if (h > 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${m} min`;
}

const classDateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatClassDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return classDateTimeFmt.format(date);
}

export function formatClassScheduleRange(
  startIso: string,
  endIso: string,
): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "—";
  }
  const sameDay =
    start.toDateString() === end.toDateString() &&
    start.getFullYear() === end.getFullYear();
  if (sameDay) {
    const day = classDateTimeFmt.format(start);
    const endTime = end.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${day} – ${endTime}`;
  }
  return `${formatClassDateTime(startIso)} – ${formatClassDateTime(endIso)}`;
}

export function classSessionPhase(
  item: Pick<ZoomClass, "scheduled_start" | "scheduled_end" | "status">,
  now: Date = new Date(),
): ClassSessionPhase {
  if (item.status === "cancelled") return "cancelled";
  if (item.status === "ended") return "ended";
  const start = new Date(item.scheduled_start);
  const end = new Date(item.scheduled_end);
  const t = now.getTime();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return item.status === "live" ? "in_window" : "upcoming";
  }
  if (t < start.getTime()) return "upcoming";
  if (t <= end.getTime()) return "in_window";
  return "past";
}

export function classSessionPhaseLabel(phase: ClassSessionPhase): string {
  switch (phase) {
    case "upcoming":
      return "Upcoming";
    case "in_window":
      return "In session window";
    case "past":
      return "Past scheduled window";
    case "cancelled":
      return "Cancelled";
    case "ended":
      return "Ended";
  }
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

/** External/pasted Zoom link — not an API-created meeting with a host start URL. */
export function classUsesExternalJoinLink(
  klass: Pick<ZoomClass, "zoom_join_url" | "zoom_start_url">,
): boolean {
  return Boolean(klass.zoom_join_url?.trim()) && !klass.zoom_start_url?.trim();
}
