"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
  type AdminProfile,
} from "@/lib/admin/auth";
import {
  generateAttendanceCode,
  sessionDateFromStart,
  studentMatchesClassAudience,
  upsertClassAttendanceRow,
  writeAttendanceToStudentRecord,
} from "@/lib/classes/attendance";
import { listClassAudienceRecipients } from "@/lib/classes/recipients";
import type {
  ClassAttendanceRollup,
  ClassRollRow,
  ClassUnmatchedRow,
} from "@/lib/admin/class-roll";
import { feesLabel } from "@/lib/admin/class-roll";
import {
  audienceLabel,
  DEFAULT_ATTENDANCE_THRESHOLD,
  DEFAULT_CLASS_DURATION_MINUTES,
  isPresentByDuration,
  requiredSecondsForClass,
  type ClassAudience,
  type ZoomClass,
  type ZoomClassAttendance,
  type ZoomClassStatus,
} from "@/lib/classes/types";
import { isFeeFullyPaid, type FeeType } from "@/lib/payments/fees";
import {
  classPortalUrl,
  formatClassWhenLabel,
  sendClassInviteEmail,
} from "@/lib/email/class-mail";
import { portalBaseUrl } from "@/lib/email/backend";
import { publicActionMessage } from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  createZoomMeeting,
  endAllLiveHostMeetings,
  fetchMeetingParticipants,
  getZoomMeeting,
  listLiveHostMeetings,
  normalizeZoomMeetingNumber,
  zoomConfigured,
} from "@/lib/zoom/client";
import {
  createMeetingSdkSignature,
  fetchHostZakToken,
  meetingSdkConfigured,
} from "@/lib/zoom/sdk";
import type { InPortalZoomSession } from "@/lib/zoom/types";

export type ClassActionResult = {
  ok: boolean;
  message: string;
  classId?: string;
  code?: string;
  synced?: number;
  present?: number;
  unmatched?: number;
  emailed?: number;
  emailFailed?: number;
};

export type ClassInvitePreview = {
  recipientCount: number;
  sampleEmails: string[];
  audienceLabel: string;
};

export type ClassStudentOption = {
  id: string;
  email: string;
  name: string;
  parish_id: string | null;
  batch_id: string | null;
};

function unauthorized(): { ok: false; message: string } {
  return { ok: false, message: "Unauthorized." };
}

function fail(error: unknown, fallback?: string): { ok: false; message: string } {
  return { ok: false, message: publicActionMessage(error, fallback) };
}

type Supabase = ReturnType<typeof createServiceSupabaseClient>;

type ClassRow = {
  id: string;
  title: string;
  description: string | null;
  audience: ClassAudience;
  parish_id: string | null;
  batch_id: string | null;
  cohort_id: string | null;
  year: number | null;
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
};

/**
 * Cookie/RLS gate — parish desks only manage classes for their parish
 * (parish or batch audience). National “everyone” classes are national-only.
 */
async function requireAccessibleClass(classId: string): Promise<
  | {
      ok: true;
      supabase: Supabase;
      actor: AdminProfile;
      klass: ClassRow;
    }
  | { ok: false; message: string }
> {
  let actor: AdminProfile;
  try {
    actor = await requireSessionAdmin();
  } catch {
    return { ok: false, message: "Unauthorized." };
  }

  if (!classId) {
    return { ok: false, message: "Class id is required." };
  }

  // Service role: attendance_code / zoom_start_url are revoked from authenticated JWT.
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("zoom_classes")
    .select("*")
    .eq("id", classId)
    .maybeSingle();

  if (error) return fail(error);
  if (!data) {
    return {
      ok: false,
      message: "Class not found. It may have been removed.",
    };
  }

  const klass = data as ClassRow;

  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return {
        ok: false,
        message: "Parish desk is not assigned to a parish.",
      };
    }
    // National / cohort-wide classes (no parish) are national-desk only.
    if (!klass.parish_id) {
      return {
        ok: false,
        message: "This class is managed by the national desk.",
      };
    }
    if (klass.parish_id !== actor.parish_id) {
      return {
        ok: false,
        message: "This class is outside your parish scope.",
      };
    }
  }

  return { ok: true, supabase, actor, klass };
}

function assertParishScope(
  actor: AdminProfile,
  parishId: string | null,
): ClassActionResult | null {
  if (isNationalAdmin(actor)) return null;
  if (!actor.parish_id) {
    return { ok: false, message: "Parish scope required." };
  }
  if (!parishId || parishId !== actor.parish_id) {
    return { ok: false, message: "Outside your parish." };
  }
  return null;
}

function resolveAudienceScope(input: {
  audience: ClassAudience;
  parish_id: string | null;
  batch_id: string | null;
  cohort_id: string | null;
  year: number | null;
  batchParishId: string | null;
  actor: AdminProfile;
}):
  | {
      parish_id: string | null;
      batch_id: string | null;
      cohort_id: string | null;
      year: number | null;
    }
  | ClassActionResult {
  const { audience, actor } = input;

  if (audience === "everyone") {
    if (!isNationalAdmin(actor)) {
      return {
        ok: false,
        message: "Only national admins can schedule classes for everyone.",
      };
    }
    return {
      parish_id: null,
      batch_id: null,
      cohort_id: null,
      year: null,
    };
  }

  if (audience === "cohort" || audience === "year") {
    if (!isNationalAdmin(actor)) {
      return {
        ok: false,
        message: "Only national admins can schedule cohort or year classes.",
      };
    }
    if (audience === "cohort") {
      if (!input.cohort_id) {
        return { ok: false, message: "Choose a cohort for this class." };
      }
      return {
        parish_id: null,
        batch_id: null,
        cohort_id: input.cohort_id,
        year: null,
      };
    }
    if (input.year == null || !Number.isFinite(input.year)) {
      return { ok: false, message: "Choose a programme year for this class." };
    }
    return {
      parish_id: null,
      batch_id: null,
      cohort_id: null,
      year: input.year,
    };
  }

  if (audience === "parish") {
    const parishId = isNationalAdmin(actor)
      ? input.parish_id
      : actor.parish_id;
    if (!parishId) {
      return { ok: false, message: "Choose a parish for this class." };
    }
    const scope = assertParishScope(actor, parishId);
    if (scope) return scope;
    return {
      parish_id: parishId,
      batch_id: null,
      cohort_id: null,
      year: null,
    };
  }

  // batch
  if (!input.batch_id) {
    return { ok: false, message: "Choose a batch for this class." };
  }
  const parishId =
    input.batchParishId ??
    (isNationalAdmin(actor) ? input.parish_id : actor.parish_id);
  if (!parishId) {
    return { ok: false, message: "Batch parish could not be resolved." };
  }
  const scope = assertParishScope(actor, parishId);
  if (scope) return scope;
  return {
    parish_id: parishId,
    batch_id: input.batch_id,
    cohort_id: null,
    year: null,
  };
}

function mapClass(row: Record<string, unknown>): ZoomClass {
  const parish = row.parishes as { name?: string } | null;
  const batch = row.batches as { name?: string; year?: number } | null;
  const cohort = row.cohorts as
    | { name?: string; year_start?: number; year_end?: number }
    | null;
  return {
    id: row.id as string,
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    audience: (row.audience as ClassAudience) || "everyone",
    parish_id: (row.parish_id as string | null) ?? null,
    batch_id: (row.batch_id as string | null) ?? null,
    cohort_id: (row.cohort_id as string | null) ?? null,
    year: row.year != null ? Number(row.year) : null,
    programme_month:
      row.programme_month != null ? Number(row.programme_month) : null,
    scheduled_start: row.scheduled_start as string,
    scheduled_end: row.scheduled_end as string,
    duration_minutes: Number(row.duration_minutes),
    attendance_threshold_percent: Number(row.attendance_threshold_percent),
    attendance_code: (row.attendance_code as string | null) ?? null,
    show_checkin_code_to_students: Boolean(
      (row as { show_checkin_code_to_students?: boolean })
        .show_checkin_code_to_students,
    ),
    zoom_meeting_id: (row.zoom_meeting_id as string | null) ?? null,
    zoom_meeting_uuid: (row.zoom_meeting_uuid as string | null) ?? null,
    zoom_join_url: (row.zoom_join_url as string | null) ?? null,
    zoom_start_url: (row.zoom_start_url as string | null) ?? null,
    zoom_passcode: (row.zoom_passcode as string | null) ?? null,
    status: row.status as ZoomClassStatus,
    created_by: (row.created_by as string | null) ?? null,
    last_synced_at: (row.last_synced_at as string | null) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    parish_name: parish?.name ?? null,
    batch_name: batch?.name ?? null,
    batch_year: batch?.year ?? null,
    cohort_name: cohort?.name ?? null,
  };
}

function revalidateClassPaths(classId?: string, recordUserId?: string) {
  revalidatePath("/admin/classes");
  if (classId) revalidatePath(`/admin/classes/${classId}`);
  revalidatePath("/admin/records");
  if (recordUserId) revalidatePath(`/admin/records/${recordUserId}`);
  revalidatePath("/student/classes");
  revalidatePath("/student/records");
}

export async function zoomIntegrationReady(): Promise<boolean> {
  return zoomConfigured();
}

export async function meetingSdkIntegrationReady(): Promise<boolean> {
  return meetingSdkConfigured();
}

export async function previewClassInvite(input: {
  audience: ClassAudience;
  parish_id: string | null;
  batch_id: string | null;
  cohort_id?: string | null;
  year?: number | null;
}): Promise<ClassInvitePreview> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();

  let batchParishId: string | null = null;
  let parishName: string | null = null;
  let batchName: string | null = null;
  let cohortName: string | null = null;

  if (input.batch_id) {
    const { data: batch } = await supabase
      .from("batches")
      .select("parish_id, name")
      .eq("id", input.batch_id)
      .maybeSingle();
    batchParishId = batch?.parish_id ?? null;
    batchName = batch?.name ?? null;
  }

  if (input.cohort_id) {
    const { data: cohort } = await supabase
      .from("cohorts")
      .select("name")
      .eq("id", input.cohort_id)
      .maybeSingle();
    cohortName = cohort?.name ?? null;
  }

  const resolved = resolveAudienceScope({
    audience: input.audience,
    parish_id: input.parish_id,
    batch_id: input.batch_id,
    cohort_id: input.cohort_id ?? null,
    year: input.year ?? null,
    batchParishId,
    actor,
  });
  if ("ok" in resolved) {
    return { recipientCount: 0, sampleEmails: [], audienceLabel: "—" };
  }

  if (resolved.parish_id) {
    const { data: parish } = await supabase
      .from("parishes")
      .select("name")
      .eq("id", resolved.parish_id)
      .maybeSingle();
    parishName = parish?.name ?? null;
  }

  const recipients = await listClassAudienceRecipients({
    audience: input.audience,
    parishId: resolved.parish_id,
    batchId: resolved.batch_id,
    cohortId: resolved.cohort_id,
    year: resolved.year,
  });

  return {
    recipientCount: recipients.length,
    sampleEmails: recipients.slice(0, 5).map((r) => r.email),
    audienceLabel: audienceLabel(
      input.audience,
      parishName,
      batchName,
      cohortName,
      resolved.year,
    ),
  };
}

export async function getInPortalHostSession(
  classId: string,
): Promise<
  | { ok: true; session: InPortalZoomSession; meetingRefreshed?: boolean }
  | { ok: false; message: string }
> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) return { ok: false, message: access.message };

  if (!meetingSdkConfigured()) {
    return {
      ok: false,
      message:
        "In-portal Zoom is not configured yet. Use Host in Zoom app instead.",
    };
  }

  if (!zoomConfigured()) {
    return {
      ok: false,
      message:
        "Zoom host setup is incomplete. Use Host in Zoom app instead.",
    };
  }

  const { actor, klass, supabase } = access;

  let meetingNumber = normalizeZoomMeetingNumber(klass.zoom_meeting_id);
  let password = klass.zoom_passcode ?? "";
  let meetingRefreshed = false;

  if (!meetingNumber && !klass.zoom_meeting_id) {
    return {
      ok: false,
      message: "This class has no Zoom meeting number.",
    };
  }

  try {
    // Meeting SDK always calls join(); hosting is role 1 + host ZAK.
    // 3610 "Meeting does not exist" means the stored id is gone on Zoom —
    // recreate so Host in portal can start as host.
    let meetingOk = meetingNumber
      ? await getZoomMeeting(meetingNumber)
      : null;

    if (!meetingOk) {
      console.warn(
        "[classes host session] Zoom meeting missing; recreating",
        {
          classId: klass.id,
          priorMeetingId: klass.zoom_meeting_id,
        },
      );
      const created = await createZoomMeeting({
        topic: klass.title,
        startTime: klass.scheduled_start,
        durationMinutes: Math.max(
          15,
          klass.duration_minutes || DEFAULT_CLASS_DURATION_MINUTES,
        ),
        agenda: klass.description ?? undefined,
      });
      const { error: updateError } = await supabase
        .from("zoom_classes")
        .update({
          zoom_meeting_id: created.id,
          zoom_meeting_uuid: created.uuid,
          zoom_join_url: created.join_url,
          zoom_start_url: created.start_url,
          zoom_passcode: created.password,
          updated_at: new Date().toISOString(),
        })
        .eq("id", klass.id);
      if (updateError) {
        console.error("classes host session recreate save:", updateError);
        return fail(
          updateError,
          "Could not refresh the Zoom meeting for hosting.",
        );
      }
      meetingNumber = normalizeZoomMeetingNumber(created.id);
      password = created.password ?? "";
      meetingRefreshed = true;
      revalidatePath("/admin/classes");
    } else {
      meetingNumber = normalizeZoomMeetingNumber(meetingOk.id) || meetingNumber;
      if (meetingOk.password != null && meetingOk.password !== "") {
        password = meetingOk.password;
      }
    }

    if (!meetingNumber) {
      return {
        ok: false,
        message: "This class has no Zoom meeting number.",
      };
    }

    const zak = await fetchHostZakToken();
    const signature = createMeetingSdkSignature({
      meetingNumber,
      role: 1,
    });

    return {
      ok: true,
      meetingRefreshed,
      session: {
        signature,
        sdkKey: process.env.ZOOM_MEETING_SDK_KEY!,
        meetingNumber,
        password,
        userName: actor.full_name || actor.email || "Host",
        userEmail: actor.email || "",
        zak,
        role: 1,
      },
    };
  } catch (err) {
    console.error("classes host session:", err);
    return {
      ok: false,
      message: publicActionMessage(err, "Could not start host session."),
    };
  }
}

/** Whether this class's Zoom meeting is currently live on the host account. */
export async function getClassZoomLiveStatus(
  classId: string,
): Promise<{ ok: true; live: boolean } | { ok: false; message: string }> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) return { ok: false, message: access.message };

  if (!zoomConfigured() || !access.klass.zoom_meeting_id) {
    return { ok: true, live: false };
  }

  try {
    const meetingId = normalizeZoomMeetingNumber(access.klass.zoom_meeting_id);
    if (!meetingId) return { ok: true, live: false };

    const liveMeetings = await listLiveHostMeetings();
    const live = liveMeetings.some(
      (row) => normalizeZoomMeetingNumber(row.id) === meetingId,
    );
    return { ok: true, live };
  } catch (err) {
    console.error("classes zoom live status:", err);
    return { ok: true, live: false };
  }
}

/**
 * End live Zoom meetings on the configured host account so in-portal Host
 * can start cleanly (clears “Already has other meetings in progress”).
 */
export async function endActiveZoomMeetings(input?: {
  classId?: string;
}): Promise<ClassActionResult & { endedCount?: number }> {
  try {
    await requireSessionAdmin();
    if (!zoomConfigured()) {
      return {
        ok: false,
        message:
          "Zoom API is not configured. Set App A credentials before ending meetings.",
      };
    }

    let alsoMeetingId: string | null = null;
    if (input?.classId) {
      const access = await requireAccessibleClass(input.classId);
      if (!access.ok) return { ok: false, message: access.message };
      alsoMeetingId = access.klass.zoom_meeting_id;
    }

    const { endedIds, topics } = await endAllLiveHostMeetings({
      alsoMeetingId,
    });

    revalidatePath("/admin/classes");

    if (!endedIds.length) {
      return {
        ok: true,
        message: "No live Zoom meetings were found on the host account.",
        endedCount: 0,
      };
    }

    const sample = topics.slice(0, 3).join(", ");
    return {
      ok: true,
      message:
        endedIds.length === 1
          ? `Ended live meeting${sample ? ` (${sample})` : ""}.`
          : `Ended ${endedIds.length} live meetings${sample ? ` (e.g. ${sample})` : ""}.`,
      endedCount: endedIds.length,
    };
  } catch (error) {
    console.error("[classes/end-live-zoom]", error);
    return {
      ok: false,
      message: publicActionMessage(
        error,
        "Could not end live Zoom meetings. On App A add meeting:update:status:admin and meeting:read:list_meetings:admin, Activate, then retry.",
      ),
    };
  }
}

export async function listAdminClasses(): Promise<ZoomClass[]> {
  const actor = await requireSessionAdmin();
  // Service role: desk needs attendance_code / zoom_start_url (revoked from JWT).
  const supabase = createServiceSupabaseClient();

  if (!isNationalAdmin(actor) && !actor.parish_id) {
    return [];
  }

  let q = supabase
    .from("zoom_classes")
    .select("*, parishes(name), batches(name, year), cohorts(name, year_start, year_end)")
    .order("scheduled_start", { ascending: false })
    .limit(200);

  // Parish desks: only classes scoped to their parish (not national “everyone”).
  if (!isNationalAdmin(actor) && actor.parish_id) {
    q = q.eq("parish_id", actor.parish_id);
  }

  const { data, error } = await q;
  if (error) {
    console.error("classes:", error.message);
    throw new Error(publicActionMessage(error, "Could not load classes."));
  }

  const classes = (data ?? []).map((row) =>
    mapClass(row as Record<string, unknown>),
  );
  const ids = classes.map((c) => c.id);
  if (!ids.length) return classes;

  const { data: attendance } = await supabase
    .from("zoom_class_attendance")
    .select("class_id, present, user_id")
    .in("class_id", ids);

  const stats = new Map<
    string,
    { rows: number; present: number; matched: number }
  >();
  for (const row of attendance ?? []) {
    const cur = stats.get(row.class_id) ?? { rows: 0, present: 0, matched: 0 };
    cur.rows += 1;
    if (row.present) cur.present += 1;
    if (row.user_id) cur.matched += 1;
    stats.set(row.class_id, cur);
  }

  return classes.map((c) => {
    const s = stats.get(c.id);
    return {
      ...c,
      attendance_rows: s?.rows ?? 0,
      present_count: s?.present ?? 0,
      matched_count: s?.matched ?? 0,
    };
  });
}

export async function getClassAttendance(
  classId: string,
): Promise<ZoomClassAttendance[]> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) {
    // Soft-fail: UI often refetches after delete / filter change.
    console.error("[classes/attendance]", access.message, classId);
    return [];
  }

  const { supabase } = access;
  const { data, error } = await supabase
    .from("zoom_class_attendance")
    .select("*")
    .eq("class_id", classId)
    .order("present", { ascending: false })
    .order("synced_at", { ascending: false });

  if (error) {
    console.error("classes:", error.message);
    return [];
  }

  const userIds = [
    ...new Set(
      (data ?? [])
        .map((r) => r.user_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const nameMap = new Map<string, { name: string; email: string }>();
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("student_profiles")
      .select("id, email, first_name, middle_name, last_name")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      nameMap.set(p.id, {
        email: p.email,
        name: [p.first_name, p.middle_name, p.last_name]
          .filter(Boolean)
          .join(" "),
      });
    }
  }

  return (data ?? []).map((row) => {
    const profile = row.user_id ? nameMap.get(row.user_id) : null;
    return {
      id: row.id,
      class_id: row.class_id,
      user_id: row.user_id,
      matched_email: row.matched_email,
      zoom_display_name: row.zoom_display_name,
      duration_seconds: row.duration_seconds,
      required_seconds: row.required_seconds,
      present: row.present,
      source: row.source ?? "zoom",
      join_time: row.join_time,
      leave_time: row.leave_time,
      synced_at: row.synced_at,
      student_name: profile?.name ?? null,
      student_email: profile?.email ?? null,
    } satisfies ZoomClassAttendance;
  });
}

function attachClassStats(
  klass: ZoomClass,
  attendance: { present: boolean; user_id: string | null }[],
): ZoomClass {
  let rows = 0;
  let present = 0;
  let matched = 0;
  for (const row of attendance) {
    rows += 1;
    if (row.present) present += 1;
    if (row.user_id) matched += 1;
  }
  return {
    ...klass,
    attendance_rows: rows,
    present_count: present,
    matched_count: matched,
  };
}

export async function getAdminClassById(
  classId: string,
): Promise<ZoomClass | null> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) return null;

  const { supabase } = access;
  const { data, error } = await supabase
    .from("zoom_classes")
    .select(
      "*, parishes(name), batches(name, year), cohorts(name, year_start, year_end)",
    )
    .eq("id", classId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[classes/get]", error.message);
    return null;
  }

  const klass = mapClass(data as Record<string, unknown>);
  const { data: attendance } = await supabase
    .from("zoom_class_attendance")
    .select("present, user_id")
    .eq("class_id", classId);

  return attachClassStats(klass, attendance ?? []);
}

export async function getClassAttendanceRollup(
  classId: string,
): Promise<ClassAttendanceRollup | null> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) return null;

  const { klass } = access;
  const attendance = await getClassAttendance(classId);

  const recipients = await listClassAudienceRecipients({
    audience: klass.audience,
    parishId: klass.parish_id,
    batchId: klass.batch_id,
    cohortId: klass.cohort_id,
    year: klass.year,
  });

  const attendanceByUser = new Map<string, ZoomClassAttendance>();
  const unmatched: ClassUnmatchedRow[] = [];

  for (const row of attendance) {
    if (row.user_id) {
      attendanceByUser.set(row.user_id, row);
    } else {
      unmatched.push({
        id: row.id,
        name: row.zoom_display_name || row.matched_email || "Unknown",
        email: row.matched_email,
        present: row.present,
        source: row.source,
        duration_seconds: row.duration_seconds,
        required_seconds: row.required_seconds,
      });
    }
  }

  const userIds = recipients.map((r) => r.id);
  const feePaid = new Map<string, { tuition: boolean; graduation: boolean }>();

  if (userIds.length) {
    const service = createServiceSupabaseClient();
    const { data: fees } = await service
      .from("student_fee_payments")
      .select("user_id, fee_type, status, amount_paid_gbp, amount_due_gbp")
      .in("user_id", userIds);

    for (const userId of userIds) {
      feePaid.set(userId, { tuition: false, graduation: false });
    }

    for (const fee of fees ?? []) {
      const uid = fee.user_id as string;
      const type = fee.fee_type as FeeType;
      const paid =
        fee.status === "paid" ||
        isFeeFullyPaid({
          amount_paid_gbp: Number(fee.amount_paid_gbp ?? 0),
          amount_due_gbp: Number(fee.amount_due_gbp ?? 0),
        });
      const current = feePaid.get(uid) ?? {
        tuition: false,
        graduation: false,
      };
      if (type === "tuition" && paid) current.tuition = true;
      if (type === "graduation" && paid) current.graduation = true;
      feePaid.set(uid, current);
    }
  }

  function toRollRow(
    userId: string,
    name: string,
    email: string,
    att: ZoomClassAttendance | undefined,
    present: boolean,
  ): ClassRollRow {
    const fees = feePaid.get(userId) ?? {
      tuition: false,
      graduation: false,
    };
    return {
      user_id: userId,
      name,
      email,
      present,
      source: att?.source ?? null,
      duration_seconds: att?.duration_seconds ?? null,
      required_seconds: att?.required_seconds ?? null,
      tuition_paid: fees.tuition,
      graduation_paid: fees.graduation,
      fees_label: feesLabel(fees.tuition, fees.graduation),
    };
  }

  const attended: ClassRollRow[] = [];
  const absent: ClassRollRow[] = [];

  for (const recipient of recipients) {
    const att = attendanceByUser.get(recipient.id);
    const name =
      att?.student_name ||
      [recipient.firstName].filter(Boolean).join(" ") ||
      recipient.email;
    const present = Boolean(att?.present);
    const row = toRollRow(recipient.id, name, recipient.email, att, present);
    if (present) attended.push(row);
    else absent.push(row);
  }

  const sortByName = (a: ClassRollRow, b: ClassRollRow) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

  attended.sort(sortByName);
  absent.sort(sortByName);

  return {
    attended,
    absent,
    unmatched,
    expected_total: recipients.length,
  };
}

export async function searchClassStudents(
  classId: string,
  query: string,
): Promise<ClassStudentOption[]> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) return [];

  const q = query.trim().toLowerCase().replace(/[%_,]/g, "");
  if (q.length < 2) return [];

  const { actor, klass } = access;
  const pattern = `%${q}%`;
  const service = createServiceSupabaseClient();
  const { data: profiles } = await service
    .from("student_profiles")
    .select("id, email, first_name, middle_name, last_name, is_active")
    .eq("is_active", true)
    .or(
      `email.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern}`,
    )
    .limit(40);

  if (!profiles?.length) return [];

  const ids = profiles.map((p) => p.id);
  let enrolmentQuery = service
    .from("enrolments")
    .select("user_id, parish_id, batch_id, cohort_id, created_at, cohorts(year_start)")
    .in("user_id", ids)
    .order("created_at", { ascending: false });

  // Parish desks never search outside their parish (even via service role).
  if (!isNationalAdmin(actor) && actor.parish_id) {
    enrolmentQuery = enrolmentQuery.eq("parish_id", actor.parish_id);
  }

  const { data: enrolments } = await enrolmentQuery;

  const enrolmentByUser = new Map<
    string,
    {
      parish_id: string | null;
      batch_id: string | null;
      cohort_id: string | null;
      cohort_year_start: number | null;
    }
  >();
  for (const e of enrolments ?? []) {
    if (!enrolmentByUser.has(e.user_id)) {
      const cohort = Array.isArray(e.cohorts) ? e.cohorts[0] : e.cohorts;
      enrolmentByUser.set(e.user_id, {
        parish_id: e.parish_id,
        batch_id: e.batch_id,
        cohort_id: (e.cohort_id as string | null) ?? null,
        cohort_year_start: cohort?.year_start ?? null,
      });
    }
  }

  return profiles
    .map((p) => {
      const enr = enrolmentByUser.get(p.id);
      if (!enr) return null;
      return {
        id: p.id,
        email: p.email,
        name: [p.first_name, p.middle_name, p.last_name]
          .filter(Boolean)
          .join(" "),
        parish_id: enr.parish_id,
        batch_id: enr.batch_id,
      };
    })
    .filter((p): p is ClassStudentOption => Boolean(p))
    .filter((p) =>
      studentMatchesClassAudience({
        audience: klass.audience || "everyone",
        classParishId: klass.parish_id,
        classBatchId: klass.batch_id,
        classCohortId: klass.cohort_id,
        classYear: klass.year,
        studentParishId: p.parish_id,
        studentBatchId: p.batch_id,
        studentCohortId: enrolmentByUser.get(p.id)?.cohort_id,
        studentCohortYearStart: enrolmentByUser.get(p.id)?.cohort_year_start,
      }),
    )
    .slice(0, 20);
}

export async function createZoomClass(input: {
  title: string;
  description?: string;
  audience: ClassAudience;
  parish_id: string | null;
  batch_id: string | null;
  cohort_id?: string | null;
  year?: number | null;
  programme_month?: number | null;
  scheduled_start: string;
  scheduled_end: string;
  duration_minutes: number;
  create_zoom_meeting: boolean;
  zoom_meeting_id?: string;
  zoom_join_url?: string;
  zoom_passcode?: string;
  generate_code?: boolean;
  show_checkin_code_to_students?: boolean;
  send_email?: boolean;
  email_notes?: string;
}): Promise<ClassActionResult> {
  let actor: AdminProfile;
  try {
    actor = await requireSessionAdmin();
  } catch {
    return unauthorized();
  }

  const title = input.title.trim();
  if (title.length < 2) return { ok: false, message: "Title is required." };

  const supabase = createServiceSupabaseClient();
  let batchParishId: string | null = null;
  if (input.batch_id) {
    const { data: batch } = await supabase
      .from("batches")
      .select("parish_id")
      .eq("id", input.batch_id)
      .maybeSingle();
    batchParishId = batch?.parish_id ?? null;
  }

  const resolved = resolveAudienceScope({
    audience: input.audience,
    parish_id: input.parish_id,
    batch_id: input.batch_id,
    cohort_id: input.cohort_id ?? null,
    year: input.year ?? null,
    batchParishId,
    actor,
  });
  if ("ok" in resolved) return resolved;

  const start = new Date(input.scheduled_start);
  const end = new Date(input.scheduled_end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, message: "Invalid schedule times." };
  }
  if (end <= start) {
    return { ok: false, message: "End must be after start." };
  }

  const duration = Math.min(
    480,
    Math.max(
      15,
      input.duration_minutes ||
        Math.round((end.getTime() - start.getTime()) / 60000),
    ),
  );

  let zoomMeetingId = input.zoom_meeting_id?.trim() || null;
  let zoomMeetingUuid: string | null = null;
  let zoomJoinUrl = input.zoom_join_url?.trim() || null;
  let zoomStartUrl: string | null = null;
  let zoomPasscode = input.zoom_passcode?.trim() || null;

  if (input.create_zoom_meeting) {
    if (!zoomConfigured()) {
      return {
        ok: false,
        message:
          "Zoom meeting create is not available. Paste a meeting ID / join link, or ask a national admin to finish Zoom setup.",
      };
    }
    try {
      const meeting = await createZoomMeeting({
        topic: title,
        startTime: start.toISOString(),
        durationMinutes: duration,
        agenda: input.description?.trim(),
      });
      zoomMeetingId = meeting.id;
      zoomMeetingUuid = meeting.uuid;
      zoomJoinUrl = meeting.join_url;
      zoomStartUrl = meeting.start_url;
      zoomPasscode = meeting.password;
    } catch (error) {
      console.error("classes zoom create:", error);
      return fail(
        error,
        "Could not create the Zoom meeting. Try again or paste a join link.",
      );
    }
  }

  const attendanceCode =
    input.generate_code === false ? null : generateAttendanceCode();

  const programmeMonth =
    input.programme_month != null &&
    Number.isInteger(Number(input.programme_month)) &&
    Number(input.programme_month) >= 1 &&
    Number(input.programme_month) <= 10
      ? Number(input.programme_month)
      : null;

  const { data, error } = await supabase
    .from("zoom_classes")
    .insert({
      title,
      description: input.description?.trim() || null,
      audience: input.audience,
      parish_id: resolved.parish_id,
      batch_id: resolved.batch_id,
      cohort_id: resolved.cohort_id,
      year: resolved.year,
      programme_month: programmeMonth,
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      duration_minutes: duration,
      attendance_threshold_percent: DEFAULT_ATTENDANCE_THRESHOLD,
      attendance_code: attendanceCode,
      show_checkin_code_to_students: Boolean(
        attendanceCode &&
          input.show_checkin_code_to_students === true,
      ),
      zoom_meeting_id: zoomMeetingId,
      zoom_meeting_uuid: zoomMeetingUuid,
      zoom_join_url: zoomJoinUrl,
      zoom_start_url: zoomStartUrl,
      zoom_passcode: zoomPasscode,
      status: "scheduled",
      created_by: actor.id,
    })
    .select("id, attendance_code")
    .single();

  if (error) {
    console.error("[classes/create] insert", error.message, error.code, error.details);
    return fail(
      error,
      "Could not save the class. Check the schedule and audience, then try again.",
    );
  }

  let emailed = 0;
  let emailFailed = 0;

  if (input.send_email) {
    const recipients = await listClassAudienceRecipients({
      audience: input.audience,
      parishId: resolved.parish_id,
      batchId: resolved.batch_id,
      cohortId: resolved.cohort_id,
      year: resolved.year,
    });

    let parishName: string | null = null;
    let batchName: string | null = null;
    let cohortName: string | null = null;
    if (resolved.parish_id) {
      const { data: parish } = await supabase
        .from("parishes")
        .select("name")
        .eq("id", resolved.parish_id)
        .maybeSingle();
      parishName = parish?.name ?? null;
    }
    if (resolved.batch_id) {
      const { data: batch } = await supabase
        .from("batches")
        .select("name")
        .eq("id", resolved.batch_id)
        .maybeSingle();
      batchName = batch?.name ?? null;
    }
    if (resolved.cohort_id) {
      const { data: cohort } = await supabase
        .from("cohorts")
        .select("name")
        .eq("id", resolved.cohort_id)
        .maybeSingle();
      cohortName = cohort?.name ?? null;
    }

    const whenLabel = formatClassWhenLabel(start.toISOString());
    const scopeLabel = audienceLabel(
      input.audience,
      parishName,
      batchName,
      cohortName,
      resolved.year,
    );
    const notes =
      [input.description?.trim(), input.email_notes?.trim()]
        .filter(Boolean)
        .join("\n\n") || undefined;

    for (const recipient of recipients) {
      const sent = await sendClassInviteEmail({
        to: recipient.email,
        firstName: recipient.firstName,
        classTitle: title,
        whenLabel,
        durationMinutes: duration,
        audienceLabel: scopeLabel,
        portalClassesUrl: classPortalUrl(),
        joinUrl: zoomJoinUrl || undefined,
        passcode: zoomPasscode || undefined,
        notes,
        portalSupportUrl: `${portalBaseUrl()}/student/support`,
        siteUrl: SOD_SITE,
      });
      if (sent.ok) emailed += 1;
      else emailFailed += 1;
    }
  }

  revalidateClassPaths(data.id);

  const parts = [
    zoomMeetingId ? "Zoom meeting created" : null,
    attendanceCode ? `check-in code ${attendanceCode}` : null,
    input.send_email
      ? `emailed ${emailed}${emailFailed ? ` (${emailFailed} failed)` : ""}`
      : null,
  ].filter(Boolean);

  return {
    ok: true,
    message: parts.length
      ? `Class scheduled · ${parts.join(" · ")}`
      : "Class scheduled.",
    classId: data.id,
    code: data.attendance_code ?? undefined,
    emailed,
    emailFailed,
  };
}

export async function regenerateClassAttendanceCode(
  classId: string,
): Promise<ClassActionResult> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) return { ok: false, message: access.message };

  const code = generateAttendanceCode();
  const { error } = await access.supabase
    .from("zoom_classes")
    .update({
      attendance_code: code,
      updated_at: new Date().toISOString(),
    })
    .eq("id", classId);

  if (error) return fail(error);
  revalidateClassPaths(classId);
  return {
    ok: true,
    message: `New check-in code: ${code}`,
    classId,
    code,
  };
}

export async function setClassCheckinCodeVisibility(
  classId: string,
  showOnStudentPortal: boolean,
): Promise<ClassActionResult> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) return { ok: false, message: access.message };

  const { data: existing } = await access.supabase
    .from("zoom_classes")
    .select("attendance_code")
    .eq("id", classId)
    .maybeSingle();

  if (showOnStudentPortal && !existing?.attendance_code?.trim()) {
    return {
      ok: false,
      message: "Generate a check-in code before showing it on the student portal.",
    };
  }

  const { error } = await access.supabase
    .from("zoom_classes")
    .update({
      show_checkin_code_to_students: showOnStudentPortal,
      updated_at: new Date().toISOString(),
    })
    .eq("id", classId);

  if (error) return fail(error);
  revalidateClassPaths(classId);
  return {
    ok: true,
    message: showOnStudentPortal
      ? "Check-in code is visible on the student portal for this class."
      : "Check-in code hidden from the student portal — share it in the room only.",
    classId,
  };
}

export async function markManualAttendance(input: {
  classId: string;
  userId: string;
  present: boolean;
}): Promise<ClassActionResult> {
  const access = await requireAccessibleClass(input.classId);
  if (!access.ok) return { ok: false, message: access.message };

  const { actor, klass } = access;

  const service = createServiceSupabaseClient();
  const { data: profile } = await service
    .from("student_profiles")
    .select("id, email, is_active")
    .eq("id", input.userId)
    .maybeSingle();

  if (!profile?.is_active) {
    return { ok: false, message: "Student not found." };
  }

  const { data: enrolment } = await service
    .from("enrolments")
    .select("parish_id, batch_id, cohort_id, cohorts(year_start)")
    .eq("user_id", input.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cohort = Array.isArray(enrolment?.cohorts)
    ? enrolment?.cohorts[0]
    : enrolment?.cohorts;

  if (
    !isNationalAdmin(actor) &&
    actor.parish_id &&
    enrolment?.parish_id !== actor.parish_id
  ) {
    return {
      ok: false,
      message: "That student is outside your parish scope.",
    };
  }

  if (
    !studentMatchesClassAudience({
      audience: (klass.audience as ClassAudience) || "everyone",
      classParishId: klass.parish_id,
      classBatchId: klass.batch_id,
      classCohortId: klass.cohort_id,
      classYear: klass.year,
      studentParishId: enrolment?.parish_id,
      studentBatchId: enrolment?.batch_id,
      studentCohortId: (enrolment?.cohort_id as string | null) ?? null,
      studentCohortYearStart: cohort?.year_start ?? null,
    })
  ) {
    return {
      ok: false,
      message: "That student is outside this class’s audience.",
    };
  }

  const saved = await upsertClassAttendanceRow({
    classId: input.classId,
    userId: input.userId,
    matchedEmail: profile.email,
    present: input.present,
    source: "manual",
    durationSeconds: input.present
      ? requiredSecondsForClass(
          Number(klass.duration_minutes),
          Number(klass.attendance_threshold_percent) ||
            DEFAULT_ATTENDANCE_THRESHOLD,
        )
      : 0,
    requiredSeconds: requiredSecondsForClass(
      Number(klass.duration_minutes),
      Number(klass.attendance_threshold_percent) ||
        DEFAULT_ATTENDANCE_THRESHOLD,
    ),
  });

  if (!saved.ok) return saved;

  const wrote = await writeAttendanceToStudentRecord({
    userId: input.userId,
    sessionDate: sessionDateFromStart(klass.scheduled_start),
    label: klass.title,
    present: input.present,
    monthIndex: klass.programme_month ?? null,
  });

  if (!wrote) {
    return {
      ok: false,
      message: "Attendance saved, but could not update student Records.",
    };
  }

  revalidateClassPaths(input.classId, input.userId);
  return {
    ok: true,
    message: input.present
      ? "Marked present on roster and Records."
      : "Marked absent on roster and Records.",
    classId: input.classId,
  };
}

export async function setZoomClassStatus(
  classId: string,
  status: ZoomClassStatus,
): Promise<ClassActionResult> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) return { ok: false, message: access.message };

  const { error } = await access.supabase
    .from("zoom_classes")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", classId);

  if (error) return fail(error);
  revalidateClassPaths(classId);
  return { ok: true, message: `Marked ${status}.`, classId };
}

export async function deleteZoomClass(
  classId: string,
): Promise<ClassActionResult> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) return { ok: false, message: access.message };

  const { error } = await access.supabase
    .from("zoom_classes")
    .delete()
    .eq("id", classId);
  if (error) return fail(error);
  revalidateClassPaths(classId);
  return { ok: true, message: "Class removed." };
}

export async function syncZoomClassAttendance(
  classId: string,
): Promise<ClassActionResult> {
  const access = await requireAccessibleClass(classId);
  if (!access.ok) return { ok: false, message: access.message };

  if (!zoomConfigured()) {
    return {
      ok: false,
      message:
        "Zoom sync is not available yet. Use the check-in code or mark attendance manually.",
    };
  }

  const { supabase, klass } = access;

  if (!klass.zoom_meeting_id && !klass.zoom_meeting_uuid) {
    return {
      ok: false,
      message:
        "This class has no Zoom meeting. Use the check-in code or mark attendance manually.",
    };
  }

  let participants;
  try {
    participants = await fetchMeetingParticipants({
      meetingUuid: klass.zoom_meeting_uuid,
      meetingId: klass.zoom_meeting_id,
    });
  } catch (error) {
    console.error("classes zoom sync:", error);
    return fail(
      error,
      "Could not fetch Zoom participants. End the meeting first, then sync.",
    );
  }

  const service = createServiceSupabaseClient();
  const { data: profiles } = await service
    .from("student_profiles")
    .select("id, email, zoom_email, is_active");

  const emailToUser = new Map<string, string>();
  for (const p of profiles ?? []) {
    if (!p.is_active) continue;
    emailToUser.set(String(p.email).trim().toLowerCase(), p.id);
    if (p.zoom_email) {
      emailToUser.set(String(p.zoom_email).trim().toLowerCase(), p.id);
    }
  }

  // Enrolments for audience gate (parish / batch classes).
  const profileIds = [...new Set([...emailToUser.values()])];
  const enrolByUser = new Map<
    string,
    {
      parish_id: string | null;
      batch_id: string | null;
      cohort_id: string | null;
      cohort_year_start: number | null;
    }
  >();
  if (profileIds.length) {
    const { data: enrolments } = await service
      .from("enrolments")
      .select("user_id, parish_id, batch_id, cohort_id, created_at, cohorts(year_start)")
      .in("user_id", profileIds)
      .order("created_at", { ascending: false });
    for (const row of enrolments ?? []) {
      if (!enrolByUser.has(row.user_id)) {
        const cohort = Array.isArray(row.cohorts) ? row.cohorts[0] : row.cohorts;
        enrolByUser.set(row.user_id, {
          parish_id: row.parish_id,
          batch_id: row.batch_id,
          cohort_id: (row.cohort_id as string | null) ?? null,
          cohort_year_start: cohort?.year_start ?? null,
        });
      }
    }
  }

  const required = requiredSecondsForClass(
    Number(klass.duration_minutes),
    Number(klass.attendance_threshold_percent) || DEFAULT_ATTENDANCE_THRESHOLD,
  );

  const sessionDate = sessionDateFromStart(klass.scheduled_start);
  const label = klass.title;
  const classAudience = (klass.audience as ClassAudience) || "everyone";

  let synced = 0;
  let presentCount = 0;
  let unmatched = 0;
  let outOfAudience = 0;

  for (const participant of participants) {
    const email = participant.user_email.trim().toLowerCase();
    const userId = emailToUser.get(email) ?? null;
    const present = isPresentByDuration(participant.duration, required);
    if (!userId) unmatched += 1;

    if (userId) {
      const enrolment = enrolByUser.get(userId);
      if (
        !studentMatchesClassAudience({
          audience: classAudience,
          classParishId: klass.parish_id,
          classBatchId: klass.batch_id,
          classCohortId: klass.cohort_id,
          classYear: klass.year,
          studentParishId: enrolment?.parish_id,
          studentBatchId: enrolment?.batch_id,
          studentCohortId: enrolment?.cohort_id,
          studentCohortYearStart: enrolment?.cohort_year_start,
        })
      ) {
        outOfAudience += 1;
        synced += 1;
        continue;
      }

      // Only count present for matched, in-audience students (Records credit).
      if (present) presentCount += 1;

      const saved = await upsertClassAttendanceRow({
        classId,
        userId,
        matchedEmail: email,
        present,
        source: "zoom",
        durationSeconds: participant.duration,
        requiredSeconds: required,
        zoomDisplayName: participant.name || null,
        joinTime: participant.join_time,
        leaveTime: participant.leave_time,
        raw: participant as unknown as Record<string, unknown>,
      });
      if (!saved.ok) return saved;

      await writeAttendanceToStudentRecord({
        userId,
        sessionDate,
        label,
        present,
        monthIndex: klass.programme_month ?? null,
      });
    } else {
      const { error: upsertError } = await service
        .from("zoom_class_attendance")
        .upsert(
          {
            class_id: classId,
            user_id: null,
            matched_email: email,
            zoom_display_name: participant.name || null,
            duration_seconds: participant.duration,
            required_seconds: required,
            present,
            source: "zoom",
            join_time: participant.join_time,
            leave_time: participant.leave_time,
            synced_at: new Date().toISOString(),
            raw: participant,
          },
          { onConflict: "class_id,matched_email" },
        );
      if (upsertError) return fail(upsertError);
    }

    synced += 1;
  }

  await supabase
    .from("zoom_classes")
    .update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", classId);

  revalidateClassPaths(classId);

  const audienceNote =
    outOfAudience > 0
      ? ` · ${outOfAudience} outside audience (not credited on Records)`
      : "";

  return {
    ok: true,
    message: `Synced ${synced} participant${synced === 1 ? "" : "s"} · ${presentCount} present (≥${klass.attendance_threshold_percent}%) · ${unmatched} unmatched${audienceNote}.`,
    classId,
    synced,
    present: presentCount,
    unmatched,
  };
}
