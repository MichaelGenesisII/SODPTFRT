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
import {
  audienceLabel,
  DEFAULT_ATTENDANCE_THRESHOLD,
  isPresentByDuration,
  requiredSecondsForClass,
  type ClassAudience,
  type ZoomClass,
  type ZoomClassAttendance,
  type ZoomClassStatus,
} from "@/lib/classes/types";
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
  fetchMeetingParticipants,
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
      message: "Class not found or outside your parish scope.",
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
    if (!klass.parish_id || klass.parish_id !== actor.parish_id) {
      return {
        ok: false,
        message: "Class not found or outside your parish scope.",
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
    scheduled_start: row.scheduled_start as string,
    scheduled_end: row.scheduled_end as string,
    duration_minutes: Number(row.duration_minutes),
    attendance_threshold_percent: Number(row.attendance_threshold_percent),
    attendance_code: (row.attendance_code as string | null) ?? null,
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

function revalidateClassPaths() {
  revalidatePath("/admin/classes");
  revalidatePath("/admin/records");
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
  { ok: true; session: InPortalZoomSession } | { ok: false; message: string }
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

  const { actor, klass } = access;

  if (!klass.zoom_meeting_id) {
    return {
      ok: false,
      message: "This class has no Zoom meeting number.",
    };
  }

  try {
    const signature = createMeetingSdkSignature({
      meetingNumber: String(klass.zoom_meeting_id),
      role: 1,
    });
    const zak = await fetchHostZakToken();
    return {
      ok: true,
      session: {
        signature,
        sdkKey: process.env.ZOOM_MEETING_SDK_KEY!,
        meetingNumber: String(klass.zoom_meeting_id),
        password: klass.zoom_passcode ?? "",
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
    throw new Error(access.message);
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
    throw new Error(publicActionMessage(error, "Could not load classes."));
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
  scheduled_start: string;
  scheduled_end: string;
  duration_minutes: number;
  create_zoom_meeting: boolean;
  zoom_meeting_id?: string;
  zoom_join_url?: string;
  zoom_passcode?: string;
  generate_code?: boolean;
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
      scheduled_start: start.toISOString(),
      scheduled_end: end.toISOString(),
      duration_minutes: duration,
      attendance_threshold_percent: DEFAULT_ATTENDANCE_THRESHOLD,
      attendance_code: attendanceCode,
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

  if (error) return fail(error);

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

  revalidateClassPaths();

  const parts = [
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
  revalidateClassPaths();
  return {
    ok: true,
    message: `New check-in code: ${code}`,
    classId,
    code,
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
  });

  if (!wrote) {
    return {
      ok: false,
      message: "Attendance saved, but could not update student Records.",
    };
  }

  revalidateClassPaths();
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
  revalidateClassPaths();
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
  revalidateClassPaths();
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
    if (present) presentCount += 1;
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

  revalidateClassPaths();

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
