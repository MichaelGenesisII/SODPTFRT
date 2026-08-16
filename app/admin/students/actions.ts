"use server";

import { revalidatePath } from "next/cache";
import {
  isEnrolmentStatus,
  isPaymentStatus,
  type AdminEnrolmentRecord,
  type AdminStudentRecord,
} from "@/lib/admin/students";
import {
  isNationalAdmin,
  requireSessionAdmin,
} from "@/lib/admin/auth";
import { createTemporaryPassword } from "@/lib/enrol/reference";
import {
  publicActionMessage,
  publicEmailFailureMessage,
} from "@/lib/safe-action-message";
import { syncApplicationFeePaymentStatus } from "@/lib/payments/service";
import { signStudentPhotoUrls } from "@/lib/student/photos";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type StudentActionResult = {
  ok: boolean;
  message: string;
  temporaryPassword?: string;
};

function unauthorized(): StudentActionResult {
  return { ok: false, message: "Unauthorized." };
}

/**
 * Cookie/RLS gate — parish admins only reach students enrolled in their parish.
 * Service-role mutations must call this first.
 */
async function requireAccessibleStudent(studentId: string) {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("student_profiles")
    .select("id, email, first_name, last_name")
    .eq("id", studentId)
    .maybeSingle();

  if (error) return { ok: false as const, message: publicActionMessage(error.message) };
  if (!data) {
    return {
      ok: false as const,
      message: "Student not found or outside your parish scope.",
    };
  }

  // Defense in depth: profile SELECT can lag behind enrolment parish moves.
  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return {
        ok: false as const,
        message: "Parish desk is not assigned to a parish.",
      };
    }
    const { data: enrolment } = await supabase
      .from("enrolments")
      .select("id, parish_id")
      .eq("user_id", studentId)
      .eq("parish_id", actor.parish_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!enrolment) {
      return {
        ok: false as const,
        message: "Student not found or outside your parish scope.",
      };
    }
  }

  return { ok: true as const, profile: data, supabase, actor };
}

/**
 * Cookie/RLS gate for enrolment mutations (status, payment, contact, placement).
 * Prefer this before every update by enrolment id — RLS alone can no-op silently.
 */
async function requireAccessibleEnrolment(enrolmentId: string): Promise<
  | {
      ok: true;
      supabase: Supabase;
      enrolment: { id: string; parish_id: string | null; user_id: string };
    }
  | { ok: false; message: string }
> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("enrolments")
    .select("id, parish_id, user_id")
    .eq("id", enrolmentId)
    .maybeSingle();

  if (error) return { ok: false, message: publicActionMessage(error.message) };
  if (!data) {
    return {
      ok: false,
      message: "Enrolment not found or outside your parish scope.",
    };
  }

  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return {
        ok: false,
        message: "Parish desk is not assigned to a parish.",
      };
    }
    if (data.parish_id !== actor.parish_id) {
      return {
        ok: false,
        message: "Enrolment not found or outside your parish scope.",
      };
    }
  }

  return {
    ok: true,
    supabase,
    enrolment: {
      id: data.id,
      parish_id: data.parish_id,
      user_id: data.user_id,
    },
  };
}

const ENROLMENT_SELECT = `
  id, user_id, reference, reference_compact, status, payment_status,
  attendance_mode, first_name, middle_name, last_name, address_line1,
  address_line2, town_city, county, postcode, country, mobile_number,
  home_telephone, email, nationality, date_of_birth, marital_status,
  born_again, born_again_date, born_again_where, baptised_holy_spirit,
  holy_spirit_date, holy_spirit_where, baptised_water, water_baptism_date,
  water_baptism_where, schools_attended, occupations, occupation_other,
  parish_id, batch_id, local_church, church_leader, church_activities,
  declaration_accepted, declared_at, created_at, updated_at
`;

export async function listAdminStudents(): Promise<AdminStudentRecord[]> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();

  // Parish desks: force their parish even if RLS were misconfigured.
  let enrolQ = supabase
    .from("enrolments")
    .select(ENROLMENT_SELECT)
    .order("created_at", { ascending: false });
  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) return [];
    enrolQ = enrolQ.eq("parish_id", actor.parish_id);
  }

  const [
    { data: profiles, error: profileError },
    { data: enrolments, error: enrolError },
    { data: parishes },
    { data: batches },
  ] = await Promise.all([
    supabase
      .from("student_profiles")
      .select(
        "id, email, first_name, middle_name, last_name, is_active, created_at, passport_path",
      )
      .order("created_at", { ascending: false }),
    enrolQ,
    supabase.from("parishes").select("id, name, region"),
    supabase.from("batches").select("id, name, year"),
  ]);

  if (profileError) {
    throw new Error(profileError.message);
  }
  if (enrolError) {
    throw new Error(enrolError.message);
  }

  // Optional enrichment tables (payments / records may not be migrated yet)
  const [{ data: fees }, { data: records }] = await Promise.all([
    supabase
      .from("student_fee_payments")
      .select("user_id, fee_type, status, amount_gbp, method, paid_at")
      .then((r) => (r.error ? { data: [] as never[] } : r)),
    supabase
      .from("student_records")
      .select("id, user_id, batch_id")
      .then((r) => (r.error ? { data: [] as never[] } : r)),
  ]);

  const parishMeta = new Map(
    (parishes ?? []).map((p) => [
      p.id as string,
      { name: p.name as string, region: (p.region as string | null) ?? null },
    ]),
  );
  const batchMeta = new Map(
    (batches ?? []).map((b) => [
      b.id as string,
      { name: b.name as string, year: b.year as number },
    ]),
  );

  const latestByUser = new Map<string, AdminEnrolmentRecord>();
  for (const row of (enrolments ?? []) as AdminEnrolmentRecord[]) {
    if (!latestByUser.has(row.user_id)) {
      const parish = row.parish_id ? parishMeta.get(row.parish_id) : null;
      const meta = row.batch_id ? batchMeta.get(row.batch_id) : null;
      latestByUser.set(row.user_id, {
        ...row,
        parish_name: parish?.name ?? null,
        parish_region: parish?.region ?? null,
        batch_name: meta?.name ?? null,
        batch_year: meta?.year ?? null,
      });
    }
  }

  const feesByUser = new Map<string, AdminStudentRecord["fees"]>();
  for (const fee of fees ?? []) {
    const list = feesByUser.get(fee.user_id as string) ?? [];
    list.push({
      fee_type: fee.fee_type as "application" | "graduation",
      status: fee.status as AdminStudentRecord["fees"][number]["status"],
      amount_gbp: Number(fee.amount_gbp),
      method: (fee.method as string | null) ?? null,
      paid_at: (fee.paid_at as string | null) ?? null,
    });
    feesByUser.set(fee.user_id as string, list);
  }

  // Match record to latest enrolment batch when possible
  const recordIdByUser = new Map<string, string>();
  for (const profile of profiles ?? []) {
    const enrol = latestByUser.get(profile.id);
    const matches = (records ?? []).filter((r) => r.user_id === profile.id);
    const match =
      matches.find((r) => (r.batch_id ?? null) === (enrol?.batch_id ?? null)) ??
      matches[0];
    if (match) recordIdByUser.set(profile.id, match.id as string);
  }

  const recordIds = [...recordIdByUser.values()];
  const sessionsByRecord = new Map<
    string,
    { present: number; total: number }
  >();
  const entriesByRecord = new Map<
    string,
    { count: number; includedSum: number; includedN: number }
  >();

  if (recordIds.length) {
    const [{ data: sessions }, { data: entries }] = await Promise.all([
      supabase
        .from("student_record_sessions")
        .select("record_id, present")
        .in("record_id", recordIds),
      supabase
        .from("student_record_entries")
        .select("record_id, percent, include_in_total")
        .in("record_id", recordIds),
    ]);
    for (const s of sessions ?? []) {
      const cur = sessionsByRecord.get(s.record_id as string) ?? {
        present: 0,
        total: 0,
      };
      cur.total += 1;
      if (s.present) cur.present += 1;
      sessionsByRecord.set(s.record_id as string, cur);
    }
    for (const e of entries ?? []) {
      const cur = entriesByRecord.get(e.record_id as string) ?? {
        count: 0,
        includedSum: 0,
        includedN: 0,
      };
      cur.count += 1;
      if (e.include_in_total) {
        cur.includedSum += Number(e.percent);
        cur.includedN += 1;
      }
      entriesByRecord.set(e.record_id as string, cur);
    }
  }

  const emptyPath = (): AdminStudentRecord["path"] => ({
    record_id: null,
    attendance_percent: null,
    exam_average: null,
    sessions_present: 0,
    sessions_total: 0,
    exam_entries: 0,
  });

  const passportUrls = await signStudentPhotoUrls(
    (profiles ?? []).map(
      (p) => (p as { passport_path?: string | null }).passport_path,
    ),
  );

  const mapped = ((profiles ?? []) as (Omit<
    AdminStudentRecord,
    "enrolment" | "fees" | "path" | "passport_url"
  > & { passport_path?: string | null })[]).map((profile) => {
    const recordId = recordIdByUser.get(profile.id) ?? null;
    const sess = recordId ? sessionsByRecord.get(recordId) : null;
    const ents = recordId ? entriesByRecord.get(recordId) : null;
    const path = emptyPath();
    if (recordId) {
      path.record_id = recordId;
      path.sessions_present = sess?.present ?? 0;
      path.sessions_total = sess?.total ?? 0;
      path.exam_entries = ents?.count ?? 0;
      path.attendance_percent =
        sess && sess.total > 0
          ? Math.round((sess.present / sess.total) * 1000) / 10
          : null;
      path.exam_average =
        ents && ents.includedN > 0
          ? Math.round((ents.includedSum / ents.includedN) * 100) / 100
          : null;
    }
    const passportPath = profile.passport_path ?? null;
    const { passport_path: _drop, ...rest } = profile;
    return {
      ...rest,
      passport_url: passportPath
        ? (passportUrls.get(passportPath) ?? null)
        : null,
      enrolment: latestByUser.get(profile.id) ?? null,
      fees: feesByUser.get(profile.id) ?? [],
      path,
    };
  });

  // Parish desks only list students with an in-parish enrolment row.
  if (!isNationalAdmin(actor)) {
    return mapped.filter((row) => row.enrolment?.parish_id === actor.parish_id);
  }
  return mapped;
}

export async function updateEnrolmentStatus(
  enrolmentId: string,
  status: string,
): Promise<StudentActionResult> {
  try {
    if (!isEnrolmentStatus(status)) {
      return { ok: false, message: "Invalid enrolment status." };
    }

    const actor = await requireSessionAdmin();
    const access = await requireAccessibleEnrolment(enrolmentId);
    if (!access.ok) return { ok: false, message: access.message };

    if (status === "paid") {
      await syncApplicationFeePaymentStatus({
        userId: access.enrolment.user_id,
        paymentStatus: "paid",
        reviewedBy: actor.id,
      });
    } else {
      const { data, error } = await access.supabase
        .from("enrolments")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", enrolmentId)
        .select("id")
        .maybeSingle();

      if (error) return { ok: false, message: publicActionMessage(error.message) };
      if (!data) {
        return {
          ok: false,
          message: "Enrolment not found or outside your parish scope.",
        };
      }
    }

    revalidatePath("/admin/students");
    revalidatePath("/admin/payments");
    revalidatePath("/student");
    revalidatePath("/student/payments");
    return { ok: true, message: `Status moved to ${status.replace(/_/g, " ")}.` };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function updatePaymentStatus(
  enrolmentId: string,
  paymentStatus: string,
): Promise<StudentActionResult> {
  try {
    if (!isPaymentStatus(paymentStatus)) {
      return { ok: false, message: "Invalid payment status." };
    }

    const actor = await requireSessionAdmin();
    const access = await requireAccessibleEnrolment(enrolmentId);
    if (!access.ok) return { ok: false, message: access.message };

    await syncApplicationFeePaymentStatus({
      userId: access.enrolment.user_id,
      paymentStatus: paymentStatus as "unpaid" | "pending_review" | "paid",
      reviewedBy: actor.id,
    });

    revalidatePath("/admin/students");
    revalidatePath("/admin/payments");
    revalidatePath("/student");
    revalidatePath("/student/payments");
    return {
      ok: true,
      message: `Payment marked ${paymentStatus.replace(/_/g, " ")}.`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function setStudentActive(
  studentId: string,
  isActive: boolean,
): Promise<StudentActionResult> {
  try {
    await requireSessionAdmin();
    const access = await requireAccessibleStudent(studentId);
    if (!access.ok) return { ok: false, message: access.message };

    const service = createServiceSupabaseClient();
    const { error } = await service
      .from("student_profiles")
      .update({ is_active: isActive })
      .eq("id", studentId);

    if (error) return { ok: false, message: publicActionMessage(error.message) };

    if (!isActive) {
      const { data: enrolment } = await access.supabase
        .from("enrolments")
        .select("reference")
        .eq("user_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { sendStudentSuspendedEmail } = await import(
        "@/lib/email/payment-mail"
      );
      const { portalBaseUrl } = await import("@/lib/email/backend");
      const { SOD_SITE } = await import("@/lib/site-nav");
      const mailed = await sendStudentSuspendedEmail({
        to: access.profile.email,
        firstName: access.profile.first_name,
        reference: enrolment?.reference,
        portalSupportUrl: `${portalBaseUrl()}/support`,
        siteUrl: SOD_SITE,
      });

      revalidatePath("/admin/students");
      if (!mailed.ok) {
        return {
          ok: true,
          message: publicEmailFailureMessage("Seat paused.", mailed.message),
        };
      }
      return { ok: true, message: "Seat paused — student emailed." };
    }

    revalidatePath("/admin/students");
    return { ok: true, message: "Student reactivated." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function resetStudentPassword(
  studentId: string,
): Promise<StudentActionResult> {
  try {
    await requireSessionAdmin();
    const access = await requireAccessibleStudent(studentId);
    if (!access.ok) return { ok: false, message: access.message };

    const temporaryPassword = createTemporaryPassword();
    const service = createServiceSupabaseClient();
    const { error } = await service.auth.admin.updateUserById(studentId, {
      password: temporaryPassword,
    });

    if (error) return { ok: false, message: publicActionMessage(error.message) };

    const { sendStudentTempPasswordEmail } = await import(
      "@/lib/email/payment-mail"
    );
    const { portalBaseUrl } = await import("@/lib/email/backend");
    const { SOD_SITE } = await import("@/lib/site-nav");
    const mailed = await sendStudentTempPasswordEmail({
      to: access.profile.email,
      firstName: access.profile.first_name,
      temporaryPassword,
      portalLoginUrl: `${portalBaseUrl()}/login/student`,
      portalSupportUrl: `${portalBaseUrl()}/student/support`,
      siteUrl: SOD_SITE,
    });

    revalidatePath("/admin/students");
    if (!mailed.ok) {
      return {
        ok: true,
        message: publicEmailFailureMessage(
          "Password reset.",
          mailed.message,
        ),
        temporaryPassword,
      };
    }
    return {
      ok: true,
      message: "Temporary password emailed to the student.",
      temporaryPassword,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function deleteStudentAccount(
  studentId: string,
): Promise<StudentActionResult> {
  try {
    await requireSessionAdmin();
    const access = await requireAccessibleStudent(studentId);
    if (!access.ok) return { ok: false, message: access.message };

    const service = createServiceSupabaseClient();

    // Wipe tickets (incl. email-matched), fees, enrolments, payment proofs first.
    await service.rpc("cleanup_student_related_data", {
      p_user_id: studentId,
      p_email: access.profile.email,
    });

    const { sendStudentRemovedEmail } = await import(
      "@/lib/email/payment-mail"
    );
    const { portalBaseUrl } = await import("@/lib/email/backend");
    const { SOD_SITE } = await import("@/lib/site-nav");
    const mailed = await sendStudentRemovedEmail({
      to: access.profile.email,
      firstName: access.profile.first_name,
      portalSupportUrl: `${portalBaseUrl()}/support`,
      siteUrl: SOD_SITE,
      enrolUrl: `${portalBaseUrl()}/enrol`,
    });

    // Remove profile before Auth so a failed Auth cleanup does not block re-enrol.
    await service.from("student_profiles").delete().eq("id", studentId);

    const { error } = await service.auth.admin.deleteUser(studentId);
    if (error) {
      console.error("[admin/students] auth delete after profile remove", error);
    }

    revalidatePath("/admin/students");
    revalidatePath("/admin/payments");
    const label =
      [access.profile.first_name, access.profile.last_name]
        .filter(Boolean)
        .join(" ") || access.profile.email;
    if (error) {
      const cleanupNote =
        `${label} was removed. They can enrol again with the same email.`;
      if (!mailed.ok) {
        return {
          ok: true,
          message: publicEmailFailureMessage(cleanupNote, mailed.message),
        };
      }
      return { ok: true, message: cleanupNote };
    }
    if (!mailed.ok) {
      return {
        ok: true,
        message: publicEmailFailureMessage(
          `${label} removed.`,
          mailed.message,
        ),
      };
    }
    return { ok: true, message: `${label} removed and emailed.` };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function reassignEnrolmentBatch(
  enrolmentId: string,
  parishId: string,
  batchId: string,
): Promise<StudentActionResult> {
  try {
    if (!enrolmentId || !parishId || !batchId) {
      return { ok: false, message: "Parish and batch are required." };
    }

    const access = await requireAccessibleEnrolment(enrolmentId);
    if (!access.ok) return { ok: false, message: access.message };

    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor) && actor.parish_id !== parishId) {
      return { ok: false, message: "Outside your parish." };
    }

    const { data: batch } = await access.supabase
      .from("batches")
      .select("id, parish_id, name, year, enrolment_open, is_active")
      .eq("id", batchId)
      .maybeSingle();

    if (!batch || batch.parish_id !== parishId) {
      return { ok: false, message: "Batch does not match the parish." };
    }

    const { data, error } = await access.supabase
      .from("enrolments")
      .update({
        parish_id: parishId,
        batch_id: batchId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", enrolmentId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, message: publicActionMessage(error.message) };
    if (!data) {
      return {
        ok: false,
        message: "Enrolment not found or outside your parish scope.",
      };
    }

    revalidatePath("/admin/students");
    const stateNote = !batch.is_active
      ? " (retired batch — student keeps portal access)"
      : !batch.enrolment_open
        ? " (enrolment closed — late placement is fine)"
        : "";
    return {
      ok: true,
      message: `Moved to ${batch.name} (${batch.year}).${stateNote}`,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export async function updateEnrolmentContact(
  enrolmentId: string,
  input: {
    mobile_number: string;
    home_telephone: string;
    address_line1: string;
    address_line2: string;
    town_city: string;
    county: string;
    postcode: string;
    country: string;
    local_church: string;
    church_leader: string;
    church_activities: string;
  },
): Promise<StudentActionResult> {
  try {
    const access = await requireAccessibleEnrolment(enrolmentId);
    if (!access.ok) return { ok: false, message: access.message };

    const mobile = input.mobile_number.trim();
    if (mobile.length < 7) {
      return { ok: false, message: "A valid mobile number is required." };
    }
    const { data, error } = await access.supabase
      .from("enrolments")
      .update({
        mobile_number: mobile,
        home_telephone: input.home_telephone.trim() || null,
        address_line1: input.address_line1.trim(),
        address_line2: input.address_line2.trim() || null,
        town_city: input.town_city.trim(),
        county: input.county.trim() || null,
        postcode: input.postcode.trim(),
        country: input.country.trim(),
        local_church: input.local_church.trim() || null,
        church_leader: input.church_leader.trim(),
        church_activities: input.church_activities.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", enrolmentId)
      .select("id")
      .maybeSingle();

    if (error) return { ok: false, message: publicActionMessage(error.message) };
    if (!data) {
      return {
        ok: false,
        message: "Enrolment not found or outside your parish scope.",
      };
    }
    revalidatePath("/admin/students");
    return { ok: true, message: "Contact details saved." };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    return {
      ok: false,
      message: publicActionMessage(error),
    };
  }
}

export type StudentPathDetail = {
  record_id: string;
  sessions: {
    id: string;
    session_date: string;
    label: string | null;
    present: boolean;
  }[];
  entries: {
    id: string;
    label: string;
    percent: number;
    passed: boolean;
    include_in_total: boolean;
    source: string;
  }[];
};

export async function getAdminStudentPathDetail(
  userId: string,
): Promise<StudentPathDetail | null> {
  await requireSessionAdmin();
  const access = await requireAccessibleStudent(userId);
  if (!access.ok) return null;

  const supabase = await createServerSupabaseClient();
  const { data: enrolment } = await supabase
    .from("enrolments")
    .select("batch_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: records } = await supabase
    .from("student_records")
    .select("id, batch_id")
    .eq("user_id", userId);

  const match =
    (records ?? []).find(
      (r) => (r.batch_id ?? null) === (enrolment?.batch_id ?? null),
    ) ?? records?.[0];
  if (!match) return null;

  const [{ data: sessions }, { data: entries }] = await Promise.all([
    supabase
      .from("student_record_sessions")
      .select("id, session_date, label, present")
      .eq("record_id", match.id)
      .order("session_date", { ascending: true }),
    supabase
      .from("student_record_entries")
      .select("id, label, percent, passed, include_in_total, source")
      .eq("record_id", match.id)
      .order("created_at", { ascending: true }),
  ]);

  return {
    record_id: match.id as string,
    sessions: (sessions ?? []).map((s) => ({
      id: s.id as string,
      session_date: s.session_date as string,
      label: (s.label as string | null) ?? null,
      present: Boolean(s.present),
    })),
    entries: (entries ?? []).map((e) => ({
      id: e.id as string,
      label: e.label as string,
      percent: Number(e.percent),
      passed: Boolean(e.passed),
      include_in_total: Boolean(e.include_in_total),
      source: e.source as string,
    })),
  };
}
