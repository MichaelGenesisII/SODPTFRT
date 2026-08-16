"use server";

import { isNationalAdmin, requireSessionAdmin } from "@/lib/admin/auth";
import { adminDeskScopeLabel } from "@/lib/admin/profile";
import type {
  OverviewStats,
  StatementReportBundle,
  StatementReportRow,
} from "@/lib/admin/overview-types";
import { publicActionMessage } from "@/lib/safe-action-message";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { activeQueueStatuses } from "@/lib/tickets";

export type {
  OverviewStats,
  StatementReportBundle,
  StatementReportRow,
} from "@/lib/admin/overview-types";

function formatDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function emptyEnrolmentByStatus(): OverviewStats["enrolmentByStatus"] {
  return {
    submitted: 0,
    under_review: 0,
    accepted: 0,
    payment_pending: 0,
    paid: 0,
    rejected: 0,
  };
}

function emptyStats(
  deskLabel: string,
  parishName: string | null,
  national: boolean,
): OverviewStats {
  const generatedAtLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
  return {
    deskLabel,
    parishName,
    national,
    generatedAtLabel,
    attentionTotal: 0,
    openTickets: 0,
    unsettledTickets: 0,
    pendingPayments: 0,
    examsNeedingGrade: 0,
    applicationsInReview: 0,
    students: 0,
    studentsActive: 0,
    studentsPaused: 0,
    paidSeats: 0,
    unpaidSeats: 0,
    paymentPendingSeats: 0,
    newEnrolments7d: 0,
    newEnrolments30d: 0,
    enrolmentByStatus: emptyEnrolmentByStatus(),
    publishedExams: 0,
    draftExams: 0,
    attemptsInProgress: 0,
    classesUpcoming: 0,
    classesLive: 0,
    scorecards: 0,
    recordsWithAttendance: 0,
    activeParishes: 0,
    openBatches: 0,
    activeAdmins: 0,
    liveNotices: 0,
  };
}

/**
 * Detailed Overview pulse — parish desks only see their scope (app-layer + RLS).
 */
export async function getOverviewStats(): Promise<OverviewStats> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  const national = isNationalAdmin(actor);

  let parishName: string | null = null;
  if (actor.parish_id) {
    const { data: parish } = await supabase
      .from("parishes")
      .select("name")
      .eq("id", actor.parish_id)
      .maybeSingle();
    parishName = parish?.name ?? null;
  }

  const deskLabel = adminDeskScopeLabel(actor, parishName);
  if (!national && !actor.parish_id) {
    return emptyStats(deskLabel, parishName, national);
  }

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const ago30d = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const nowIso = now.toISOString();

  let enrolQ = supabase
    .from("enrolments")
    .select("user_id, status, payment_status, created_at")
    .order("created_at", { ascending: false })
    .limit(2500);
  if (!national) enrolQ = enrolQ.eq("parish_id", actor.parish_id!);

  const noticesQ = national
    ? supabase
        .from("announcements")
        .select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .eq("audience", "general")
    : supabase
        .from("announcements")
        .select("*", { count: "exact", head: true })
        .eq("is_published", true)
        .eq("audience", "students")
        .eq("parish_id", actor.parish_id!);

  let upcomingClassesQ = supabase
    .from("zoom_classes")
    .select("*", { count: "exact", head: true })
    .eq("status", "scheduled")
    .gte("scheduled_start", nowIso)
    .lte("scheduled_start", in7d);
  if (!national) {
    upcomingClassesQ = upcomingClassesQ.eq("parish_id", actor.parish_id!);
  }

  let liveClassesQ = supabase
    .from("zoom_classes")
    .select("*", { count: "exact", head: true })
    .eq("status", "live");
  if (!national) {
    liveClassesQ = liveClassesQ.eq("parish_id", actor.parish_id!);
  }

  let batchesQ = supabase
    .from("batches")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("enrolment_open", true);
  if (!national) batchesQ = batchesQ.eq("parish_id", actor.parish_id!);

  let recordsQ = supabase
    .from("student_records")
    .select("id", { count: "exact", head: true });
  if (!national) recordsQ = recordsQ.eq("parish_id", actor.parish_id!);

  const [
    { data: enrolments },
    { count: openTickets },
    { count: unsettledTickets },
    examQueueResult,
    inProgressResult,
    proofsResult,
    { count: publishedExams },
    { count: draftExams },
    upcomingClassesResult,
    liveClassesResult,
    recordsResult,
    { count: activeParishes },
    openBatchesResult,
    { count: activeAdmins },
    noticesResult,
  ] = await Promise.all([
    enrolQ,
    supabase
      .from("support_tickets")
      .select("*", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("support_tickets")
      .select("*", { count: "exact", head: true })
      .in("status", activeQueueStatuses()),
    supabase
      .from("exam_attempts")
      .select("*", { count: "exact", head: true })
      .eq("status", "submitted"),
    supabase
      .from("exam_attempts")
      .select("*", { count: "exact", head: true })
      .eq("status", "in_progress"),
    supabase
      .from("student_fee_payments")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_review"),
    supabase
      .from("exams")
      .select("*", { count: "exact", head: true })
      .eq("status", "published"),
    supabase
      .from("exams")
      .select("*", { count: "exact", head: true })
      .eq("status", "draft"),
    upcomingClassesQ,
    liveClassesQ,
    recordsQ,
    national
      ? supabase
          .from("parishes")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true)
      : Promise.resolve({ count: actor.parish_id ? 1 : 0 }),
    batchesQ,
    supabase
      .from("admin_profiles")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true),
    noticesQ,
  ]);

  const latestByUser = new Map<
    string,
    {
      user_id: string;
      status: string;
      payment_status: string;
      created_at: string;
    }
  >();
  for (const row of enrolments ?? []) {
    const uid = row.user_id as string;
    if (!latestByUser.has(uid)) {
      latestByUser.set(uid, {
        user_id: uid,
        status: String(row.status ?? ""),
        payment_status: String(row.payment_status ?? ""),
        created_at: String(row.created_at ?? ""),
      });
    }
  }

  const enrolmentByStatus = emptyEnrolmentByStatus();
  let paidSeats = 0;
  let unpaidSeats = 0;
  let paymentPendingSeats = 0;
  let newEnrolments7d = 0;
  let newEnrolments30d = 0;
  let applicationsInReview = 0;

  for (const row of latestByUser.values()) {
    const st = row.status as keyof typeof enrolmentByStatus;
    if (st in enrolmentByStatus) enrolmentByStatus[st] += 1;
    if (row.status === "submitted" || row.status === "under_review") {
      applicationsInReview += 1;
    }
    if (row.payment_status === "paid") paidSeats += 1;
    else if (row.payment_status === "pending_review") paymentPendingSeats += 1;
    else unpaidSeats += 1;

    const created = Date.parse(row.created_at);
    if (!Number.isNaN(created)) {
      if (created >= Date.parse(ago7d)) newEnrolments7d += 1;
      if (created >= Date.parse(ago30d)) newEnrolments30d += 1;
    }
  }

  const userIds = [...latestByUser.keys()];
  let studentsActive = 0;
  let studentsPaused = 0;
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from("student_profiles")
      .select("id, is_active")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      if (p.is_active) studentsActive += 1;
      else studentsPaused += 1;
    }
  }

  let recordsWithAttendance = 0;
  const scorecards = recordsResult.error ? 0 : (recordsResult.count ?? 0);
  if (scorecards > 0) {
    let recordIdsQ = supabase.from("student_records").select("id").limit(800);
    if (!national) {
      recordIdsQ = recordIdsQ.eq("parish_id", actor.parish_id!);
    }
    const { data: recordRows } = await recordIdsQ;
    const ids = (recordRows ?? []).map((r) => r.id as string);
    if (ids.length) {
      const { data: sessions } = await supabase
        .from("student_record_sessions")
        .select("record_id")
        .in("record_id", ids);
      recordsWithAttendance = new Set(
        (sessions ?? []).map((s) => s.record_id as string),
      ).size;
    }
  }

  const pendingPayments = proofsResult.error
    ? 0
    : (proofsResult.count ?? 0);
  const examsNeedingGrade = examQueueResult.error
    ? 0
    : (examQueueResult.count ?? 0);
  const attemptsInProgress = inProgressResult.error
    ? 0
    : (inProgressResult.count ?? 0);
  const classesUpcoming = upcomingClassesResult.error
    ? 0
    : (upcomingClassesResult.count ?? 0);
  const classesLive = liveClassesResult.error
    ? 0
    : (liveClassesResult.count ?? 0);
  const openBatches = openBatchesResult.error
    ? 0
    : (openBatchesResult.count ?? 0);
  const liveNotices = noticesResult.error ? 0 : (noticesResult.count ?? 0);

  const attentionTotal =
    (openTickets ?? 0) +
    pendingPayments +
    examsNeedingGrade +
    applicationsInReview;

  const generatedAtLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  return {
    deskLabel,
    parishName,
    national,
    generatedAtLabel,
    attentionTotal,
    openTickets: openTickets ?? 0,
    unsettledTickets: unsettledTickets ?? 0,
    pendingPayments,
    examsNeedingGrade,
    applicationsInReview,
    students: latestByUser.size,
    studentsActive,
    studentsPaused,
    paidSeats,
    unpaidSeats,
    paymentPendingSeats,
    newEnrolments7d,
    newEnrolments30d,
    enrolmentByStatus,
    publishedExams: publishedExams ?? 0,
    draftExams: draftExams ?? 0,
    attemptsInProgress,
    classesUpcoming,
    classesLive,
    scorecards,
    recordsWithAttendance,
    activeParishes: activeParishes ?? 0,
    openBatches,
    activeAdmins: activeAdmins ?? 0,
    liveNotices,
  };
}

/**
 * Statement of Report rows — Proof of Application/Enrolment + Attendance.
 * Subject to tuition payment when paidOnly is true (default).
 */
export async function getStatementOfReport(input?: {
  parishId?: string;
  paidOnly?: boolean;
}): Promise<StatementReportBundle> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  const national = isNationalAdmin(actor);
  const paidOnly = input?.paidOnly !== false;

  let parishFilter = input?.parishId ?? "";
  if (!national) {
    if (!actor.parish_id) {
      throw new Error("Parish desk is not assigned to a parish.");
    }
    parishFilter = actor.parish_id;
  }

  let parishName: string | null = null;
  if (parishFilter) {
    const { data: parish } = await supabase
      .from("parishes")
      .select("name")
      .eq("id", parishFilter)
      .maybeSingle();
    parishName = parish?.name ?? null;
  } else if (actor.parish_id) {
    const { data: parish } = await supabase
      .from("parishes")
      .select("name")
      .eq("id", actor.parish_id)
      .maybeSingle();
    parishName = parish?.name ?? null;
  }

  let enrolQ = supabase
    .from("enrolments")
    .select(
      "id, user_id, reference, first_name, middle_name, last_name, email, parish_id, batch_id, status, payment_status, created_at, parishes(name), batches(name, year)",
    )
    .order("created_at", { ascending: false })
    .limit(1500);

  if (parishFilter) enrolQ = enrolQ.eq("parish_id", parishFilter);
  if (paidOnly) enrolQ = enrolQ.eq("payment_status", "paid");

  const { data: enrolments, error } = await enrolQ;
  if (error) throw new Error(publicActionMessage(error.message));

  const latest = new Map<string, (typeof enrolments)[number]>();
  for (const row of enrolments ?? []) {
    if (!latest.has(row.user_id as string)) {
      latest.set(row.user_id as string, row);
    }
  }

  const userIds = [...latest.keys()];
  const recordByUser = new Map<
    string,
    { id: string; present: number; total: number }
  >();

  if (userIds.length) {
    const { data: records } = await supabase
      .from("student_records")
      .select("id, user_id, batch_id")
      .in("user_id", userIds);

    const chosen = new Map<string, string>();
    for (const userId of userIds) {
      const enrol = latest.get(userId);
      const matches = (records ?? []).filter((r) => r.user_id === userId);
      const match =
        matches.find(
          (r) => (r.batch_id ?? null) === (enrol?.batch_id ?? null),
        ) ?? matches[0];
      if (match) chosen.set(userId, match.id as string);
    }

    const recordIds = [...chosen.values()];
    if (recordIds.length) {
      const { data: sessions } = await supabase
        .from("student_record_sessions")
        .select("record_id, present")
        .in("record_id", recordIds);

      const tallies = new Map<string, { present: number; total: number }>();
      for (const s of sessions ?? []) {
        const cur = tallies.get(s.record_id as string) ?? {
          present: 0,
          total: 0,
        };
        cur.total += 1;
        if (s.present) cur.present += 1;
        tallies.set(s.record_id as string, cur);
      }

      for (const [userId, recordId] of chosen) {
        const t = tallies.get(recordId) ?? { present: 0, total: 0 };
        recordByUser.set(userId, { id: recordId, ...t });
      }
    }
  }

  const rows: StatementReportRow[] = [];
  for (const [userId, enrol] of latest) {
    const parish = enrol.parishes as { name?: string } | null;
    const batch = enrol.batches as { name?: string; year?: number } | null;
    const tally = recordByUser.get(userId);
    const attendancePercent =
      tally && tally.total > 0
        ? Math.round((tally.present / tally.total) * 1000) / 10
        : null;
    const name = [enrol.first_name, enrol.middle_name, enrol.last_name]
      .filter(Boolean)
      .join(" ");

    rows.push({
      student_name: name || "Student",
      email: (enrol.email as string) || "",
      reference: (enrol.reference as string | null) ?? null,
      parish_name: parish?.name ?? null,
      batch_label: batch
        ? `${batch.name}${batch.year != null ? ` (${batch.year})` : ""}`
        : null,
      enrolled_on: formatDateLabel(enrol.created_at as string),
      enrolment_status: String(enrol.status ?? ""),
      payment_status: String(enrol.payment_status ?? ""),
      tuition_paid: enrol.payment_status === "paid",
      application_proof: enrol.id ? "Recorded" : "Missing",
      attendance_proof:
        tally && tally.total > 0 ? "Recorded" : "Pending",
      attendance_percent: attendancePercent,
      sessions_present: tally?.present ?? 0,
      sessions_total: tally?.total ?? 0,
    });
  }

  rows.sort((a, b) => a.student_name.localeCompare(b.student_name));

  const issuedAtLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const scopeLabel = parishFilter
    ? parishName
      ? `Parish — ${parishName}`
      : "Parish desk"
    : "National — all UK parishes";

  return {
    title: "Statement of Report",
    subtitle: paidOnly
      ? "Proof of Application / Enrolment and Proof of Attendance (tuition paid)"
      : "Proof of Application / Enrolment and Proof of Attendance",
    issuedAtLabel,
    issuedBy:
      actor.full_name?.trim() ||
      actor.email ||
      "School of Disciples admin",
    scopeLabel,
    rows,
  };
}
