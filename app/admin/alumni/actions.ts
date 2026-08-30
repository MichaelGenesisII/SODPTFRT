"use server";

import { revalidatePath } from "next/cache";
import { parseAlumniWorkbook } from "@/lib/alumni/parse-workbook";
import type {
  AlumniExamEntry,
  AlumniImportPreview,
  AlumniImportResult,
  AlumniLegacyPerson,
  AlumniPortalFilter,
  AlumniSessionEntry,
  ParsedAlumniRow,
} from "@/lib/alumni/types";
import { isNationalAdmin, requireSessionAdmin } from "@/lib/admin/auth";
import { ALUMNI_PAGE_SIZE } from "@/lib/admin/alumni-desk";
import { formatCohortLabel } from "@/lib/cohorts";
import {
  createApplicationReference,
  createTemporaryPassword,
} from "@/lib/enrol/reference";
import {
  portalBaseUrl,
  sendEnrolmentAccessRecoveryEmail,
} from "@/lib/email/backend";
import { ensureStudentFeeRows, markFeePaid } from "@/lib/payments/service";
import { publicActionMessage } from "@/lib/safe-action-message";
import { SOD_SITE, supportHref } from "@/lib/site-nav";
import { findAuthUserIdByEmail } from "@/lib/supabase/auth-admin";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AlumniActionResult = {
  ok: boolean;
  message: string;
};

function unauthorized(): AlumniActionResult {
  return { ok: false, message: "Unauthorized." };
}

function asExams(value: unknown): AlumniExamEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return {
        label: String(row.label ?? "Exam"),
        percent:
          typeof row.percent === "number"
            ? row.percent
            : row.percent == null
              ? null
              : Number(row.percent),
      };
    })
    .filter(Boolean) as AlumniExamEntry[];
}

function asSessions(value: unknown): AlumniSessionEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      return {
        label: String(row.label ?? "Session"),
        date: row.date ? String(row.date) : null,
        present: Boolean(row.present),
      };
    })
    .filter(Boolean) as AlumniSessionEntry[];
}

function mapLegacyRow(row: Record<string, unknown>): AlumniLegacyPerson {
  return {
    id: String(row.id),
    batch_year: Number(row.batch_year),
    batch_label: String(row.batch_label),
    source_file: row.source_file ? String(row.source_file) : null,
    source_sheet: row.source_sheet ? String(row.source_sheet) : null,
    source_row: row.source_row == null ? null : Number(row.source_row),
    first_name: String(row.first_name),
    middle_name: row.middle_name ? String(row.middle_name) : null,
    last_name: String(row.last_name),
    display_name: String(row.display_name),
    email: row.email ? String(row.email) : null,
    mobile: row.mobile ? String(row.mobile) : null,
    address_text: row.address_text ? String(row.address_text) : null,
    centre: row.centre ? String(row.centre) : null,
    region: row.region ? String(row.region) : null,
    parish: row.parish ? String(row.parish) : null,
    date_of_birth: row.date_of_birth ? String(row.date_of_birth) : null,
    student_id: row.student_id ? String(row.student_id) : null,
    legacy_ref: row.legacy_ref ? String(row.legacy_ref) : null,
    screenshot_gbp: Number(row.screenshot_gbp ?? 0),
    bank_statement_gbp: Number(row.bank_statement_gbp ?? 0),
    tuition_paid_gbp: Number(row.tuition_paid_gbp ?? 0),
    tuition_covered: Boolean(row.tuition_covered),
    tuition_note: row.tuition_note ? String(row.tuition_note) : null,
    graduation_paid_gbp: Number(row.graduation_paid_gbp ?? 0),
    certificate_note: row.certificate_note
      ? String(row.certificate_note)
      : null,
    comments: row.comments ? String(row.comments) : null,
    manuals_sent: Boolean(row.manuals_sent),
    exams: asExams(row.exams),
    sessions: asSessions(row.sessions),
    cohort_id: row.cohort_id ? String(row.cohort_id) : null,
    activated_user_id: row.activated_user_id
      ? String(row.activated_user_id)
      : null,
    email_assigned_at: row.email_assigned_at
      ? String(row.email_assigned_at)
      : null,
    created_at: String(row.created_at),
  };
}

export async function searchLegacyAlumniAction(input: {
  query: string;
  batchYear: number | null;
  portal: AlumniPortalFilter;
  page?: number;
}): Promise<{
  rows: AlumniLegacyPerson[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const result = await listLegacyAlumni({
    query: input.query,
    batchYear: input.batchYear,
    portal: input.portal,
    page: input.page ?? 1,
    pageSize: ALUMNI_PAGE_SIZE,
  });
  return {
    rows: result.rows,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  };
}

export async function getLegacyAlumniById(
  id: string,
): Promise<
  | { ok: true; person: AlumniLegacyPerson }
  | { ok: false; message: string }
> {
  const actor = await requireSessionAdmin();
  if (!isNationalAdmin(actor)) {
    return { ok: false, message: "National desk only." };
  }

  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("alumni_legacy_people")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[alumni] get by id", error);
    return { ok: false, message: "Could not load this alumni record." };
  }
  if (!data) {
    return { ok: false, message: "Alumni record was not found." };
  }

  const person = mapLegacyRow(data as Record<string, unknown>);
  if (person.cohort_id) {
    const { data: cohort } = await service
      .from("cohorts")
      .select("name, year_start, year_end")
      .eq("id", person.cohort_id)
      .maybeSingle();
    if (cohort) {
      person.cohort_label = formatCohortLabel({
        name: String(cohort.name),
        year_start: Number(cohort.year_start),
        year_end: Number(cohort.year_end),
      });
    }
  }

  return { ok: true, person };
}

export async function listLegacyAlumni(input?: {
  query?: string;
  batchYear?: number | null;
  portal?: AlumniPortalFilter;
  page?: number;
  pageSize?: number;
}): Promise<{
  rows: AlumniLegacyPerson[];
  total: number;
  page: number;
  pageSize: number;
  batchYears: number[];
  stats: {
    total: number;
    awaitingEmail: number;
    portalReady: number;
  };
}> {
  const actor = await requireSessionAdmin();
  if (!isNationalAdmin(actor)) {
    return {
      rows: [],
      total: 0,
      page: 1,
      pageSize: ALUMNI_PAGE_SIZE,
      batchYears: [],
      stats: { total: 0, awaitingEmail: 0, portalReady: 0 },
    };
  }

  const service = createServiceSupabaseClient();
  const pageSize = Math.min(Math.max(input?.pageSize ?? ALUMNI_PAGE_SIZE, 1), 100);
  const page = Math.max(input?.page ?? 1, 1);
  const offset = (page - 1) * pageSize;
  const q = (input?.query ?? "").trim();

  let request = service
    .from("alumni_legacy_people")
    .select("*", { count: "exact" })
    .order("batch_year", { ascending: false })
    .order("display_name", { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (input?.batchYear) {
    request = request.eq("batch_year", input.batchYear);
  }
  if (input?.portal === "awaiting_email") {
    request = request.is("activated_user_id", null);
  } else if (input?.portal === "portal_ready") {
    request = request.not("activated_user_id", "is", null);
  }

  if (q) {
    const safe = q.replace(/[%_,.()]/g, " ").replace(/\s+/g, " ").trim();
    if (safe) {
      const like = `%${safe}%`;
      request = request.or(
        [
          `display_name.ilike.${like}`,
          `email.ilike.${like}`,
          `centre.ilike.${like}`,
          `student_id.ilike.${like}`,
          `legacy_ref.ilike.${like}`,
          `mobile.ilike.${like}`,
          `first_name.ilike.${like}`,
          `last_name.ilike.${like}`,
        ].join(","),
      );
    }
  }

  const { data, count, error } = await request;
  if (error) {
    console.error("[alumni] list legacy", error);
    throw new Error("Could not load alumni register.");
  }

  const [{ data: yearRows }, { count: totalAll }, { count: awaiting }, { count: ready }] =
    await Promise.all([
      service
        .from("alumni_legacy_people")
        .select("batch_year")
        .order("batch_year", { ascending: false }),
      service
        .from("alumni_legacy_people")
        .select("id", { count: "exact", head: true }),
      service
        .from("alumni_legacy_people")
        .select("id", { count: "exact", head: true })
        .is("activated_user_id", null),
      service
        .from("alumni_legacy_people")
        .select("id", { count: "exact", head: true })
        .not("activated_user_id", "is", null),
    ]);

  const batchYears = [
    ...new Set((yearRows ?? []).map((r) => Number(r.batch_year))),
  ].filter((y) => Number.isFinite(y));

  return {
    rows: (data ?? []).map((row) => mapLegacyRow(row as Record<string, unknown>)),
    total: count ?? 0,
    page,
    pageSize,
    batchYears,
    stats: {
      total: totalAll ?? 0,
      awaitingEmail: awaiting ?? 0,
      portalReady: ready ?? 0,
    },
  };
}

export async function previewAlumniImport(
  formData: FormData,
): Promise<{ ok: true; preview: AlumniImportPreview } | AlumniActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) {
      return { ok: false, message: "National desk only." };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, message: "Choose an Excel file to import." };
    }
    if (file.size > 15 * 1024 * 1024) {
      return { ok: false, message: "File is too large. Maximum size is 15 MB." };
    }

    const buffer = await file.arrayBuffer();
    const preview = parseAlumniWorkbook(buffer, { fileName: file.name });
    return { ok: true, preview };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    console.error("[alumni preview]", error);
    return {
      ok: false,
      message: "Could not read that file. Please check the format and try again.",
    };
  }
}

async function upsertLegacyRow(
  row: ParsedAlumniRow,
  cohortId: string | null,
): Promise<"inserted" | "updated" | "skipped"> {
  const service = createServiceSupabaseClient();
  const payload = {
    batch_year: row.batchYear,
    batch_label: row.batchLabel,
    source_file: row.sourceFile,
    source_sheet: row.sheet,
    source_row: row.rowNumber,
    import_fingerprint: row.importFingerprint,
    first_name: row.firstName,
    middle_name: row.middleName,
    last_name: row.lastName,
    display_name: row.displayName,
    email: row.email,
    mobile: row.mobile,
    address_text: row.addressText,
    centre: row.centre,
    region: row.region,
    parish: row.parish,
    date_of_birth: row.dateOfBirth,
    student_id: row.studentId,
    legacy_ref: row.legacyAppComNo,
    screenshot_gbp: row.screenshotGbp,
    bank_statement_gbp: row.bankStatementGbp,
    tuition_paid_gbp: row.tuitionPaidGbp,
    tuition_covered: row.tuitionCovered,
    tuition_note: row.tuitionNote,
    graduation_paid_gbp: row.graduationPaidGbp,
    certificate_note: row.certificateNote,
    comments: row.comments,
    manuals_sent: row.manualsSent,
    exams: row.exams,
    sessions: row.sessions,
    cohort_id: cohortId,
  };

  const { data: existing } = await service
    .from("alumni_legacy_people")
    .select("id, activated_user_id, email")
    .eq("import_fingerprint", row.importFingerprint)
    .maybeSingle();

  if (existing?.id) {
    // Never wipe an assigned portal email on re-import.
    const { error } = await service
      .from("alumni_legacy_people")
      .update({
        ...payload,
        email: existing.email ?? payload.email,
      })
      .eq("id", existing.id);
    if (error) {
      console.error("[alumni] update legacy", error);
      return "skipped";
    }
    return "updated";
  }

  const { error } = await service.from("alumni_legacy_people").insert(payload);
  if (error) {
    console.error("[alumni] insert legacy", error);
    return "skipped";
  }
  return "inserted";
}

export async function commitAlumniImport(input: {
  rows: ParsedAlumniRow[];
  cohortBySheet: Record<string, string | null>;
}): Promise<AlumniImportResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) {
      return {
        ok: false,
        message: "National desk only.",
        imported: 0,
        updated: 0,
        skipped: [],
      };
    }

    if (!input.rows.length) {
      return {
        ok: false,
        message: "No valid rows to import.",
        imported: 0,
        updated: 0,
        skipped: [],
      };
    }

    let imported = 0;
    let updated = 0;
    const skipped: AlumniImportPreview["skipped"] = [];

    for (const row of input.rows) {
      const cohortId = input.cohortBySheet[row.sheet] ?? null;
      const result = await upsertLegacyRow(row, cohortId);
      if (result === "inserted") imported += 1;
      else if (result === "updated") updated += 1;
      else {
        skipped.push({
          sheet: row.sheet,
          rowNumber: row.rowNumber,
          reason: "duplicate_in_file",
          detail: row.displayName,
        });
      }
    }

    revalidatePath("/admin/alumni");

    return {
      ok: true,
      message: `Saved ${imported} new and ${updated} updated alumni record${
        imported + updated === 1 ? "" : "s"
      }.`,
      imported,
      updated,
      skipped,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return {
        ok: false,
        message: unauthorized().message,
        imported: 0,
        updated: 0,
        skipped: [],
      };
    }
    return {
      ok: false,
      message: publicActionMessage(error),
      imported: 0,
      updated: 0,
      skipped: [],
    };
  }
}

/**
 * Assign an email to a legacy alumni row and create their portal account.
 * Without an email they cannot sign in.
 */
export async function assignAlumniEmail(input: {
  legacyId: string;
  email: string;
  sendAccessEmail?: boolean;
}): Promise<AlumniActionResult> {
  try {
    const actor = await requireSessionAdmin();
    if (!isNationalAdmin(actor)) {
      return { ok: false, message: "National desk only." };
    }

    const email = input.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, message: "Enter a valid email address." };
    }

    const service = createServiceSupabaseClient();
    const { data: legacy, error: legacyError } = await service
      .from("alumni_legacy_people")
      .select("*")
      .eq("id", input.legacyId)
      .maybeSingle();

    if (legacyError || !legacy) {
      console.error("[alumni] load legacy for email", legacyError);
      return { ok: false, message: "Alumni record was not found." };
    }

    if (legacy.activated_user_id) {
      return {
        ok: false,
        message: "This alumni already has portal access.",
      };
    }

    const [{ data: existingProfile }, { data: existingAdmin }] =
      await Promise.all([
        service
          .from("student_profiles")
          .select("id, account_kind")
          .eq("email", email)
          .maybeSingle(),
        service.from("admin_profiles").select("id").eq("email", email).maybeSingle(),
      ]);

    if (existingAdmin) {
      return {
        ok: false,
        message: "That email belongs to a staff account.",
      };
    }
    if (existingProfile) {
      return {
        ok: false,
        message: "That email is already registered on the portal.",
      };
    }

    const existingAuthId = await findAuthUserIdByEmail(service, email);
    if (existingAuthId) {
      return {
        ok: false,
        message: "That email is already registered on the portal.",
      };
    }

    const temporaryPassword = createTemporaryPassword();
    const reference = createApplicationReference();
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          first_name: legacy.first_name,
          last_name: legacy.last_name,
          role: "student",
        },
      });

    if (createError || !created.user) {
      console.error("[alumni] createUser", createError);
      return {
        ok: false,
        message: "Could not create the alumni portal account. Please try again.",
      };
    }

    const userId = created.user.id;
    const now = new Date().toISOString();

    const { error: profileError } = await service.from("student_profiles").insert({
      id: userId,
      email,
      first_name: legacy.first_name,
      middle_name: legacy.middle_name,
      last_name: legacy.last_name,
      is_active: true,
      account_kind: "alumni",
      legacy_bypass_graduation_gate: true,
      manuals_status: legacy.manuals_sent ? "sent" : "not_sent",
      manuals_sent_at: legacy.manuals_sent ? now : null,
      manuals_sent_by: legacy.manuals_sent ? actor.id : null,
    });

    if (profileError) {
      await service.auth.admin.deleteUser(userId);
      console.error("[alumni] profile", profileError);
      return {
        ok: false,
        message: "Could not create the alumni profile. Please try again.",
      };
    }

    const { data: enrolment, error: enrolError } = await service
      .from("enrolments")
      .insert({
        user_id: userId,
        reference: reference.display,
        reference_compact: reference.compact,
        status: "accepted",
        payment_status:
          Number(legacy.tuition_paid_gbp) > 0 || legacy.tuition_covered
            ? "paid"
            : "unpaid",
        attendance_mode: "standard",
        first_name: legacy.first_name,
        middle_name: legacy.middle_name,
        last_name: legacy.last_name,
        address_line1: legacy.address_text || "Imported record",
        town_city: "—",
        postcode: "—",
        country: "United Kingdom",
        mobile_number:
          legacy.mobile && String(legacy.mobile).length >= 7
            ? String(legacy.mobile)
            : "0000000000",
        email,
        nationality: "—",
        date_of_birth: "1990-01-01",
        marital_status: "—",
        born_again: "Yes",
        baptised_holy_spirit: "Yes",
        baptised_water: "Yes",
        schools_attended: `Imported from ${legacy.batch_label}`,
        occupations: [],
        local_church: legacy.centre ?? "",
        church_leader: "Imported",
        cohort_id: legacy.cohort_id,
        legacy_app_com_no: legacy.legacy_ref || legacy.student_id,
        declaration_accepted: true,
        declared_at: now,
      })
      .select("id")
      .maybeSingle();

    if (enrolError || !enrolment) {
      await service.from("student_profiles").delete().eq("id", userId);
      await service.auth.admin.deleteUser(userId);
      console.error("[alumni] enrolment", enrolError);
      return {
        ok: false,
        message: "Could not create the alumni enrolment. Please try again.",
      };
    }

    const fees = await ensureStudentFeeRows(service, userId);
    const tuition = fees.find((f) => f.fee_type === "tuition");
    const tuitionAmount =
      Number(legacy.tuition_paid_gbp) > 0
        ? Number(legacy.tuition_paid_gbp)
        : legacy.tuition_covered
          ? Number(tuition?.amount_due_gbp ?? 300)
          : 0;

    if (tuitionAmount > 0) {
      try {
        await markFeePaid({
          userId,
          feeType: "tuition",
          method: "bank_transfer",
          amountGbp: tuitionAmount,
          reviewedBy: actor.id,
        });
      } catch (feeError) {
        console.error("[alumni] tuition mark", feeError);
      }
    }

    if (Number(legacy.graduation_paid_gbp) > 0) {
      try {
        await markFeePaid({
          userId,
          feeType: "graduation",
          method: "bank_transfer",
          amountGbp: Number(legacy.graduation_paid_gbp),
          reviewedBy: actor.id,
        });
      } catch (feeError) {
        console.error("[alumni] graduation mark", feeError);
      }
    }

    const exams = asExams(legacy.exams);
    const sessions = asSessions(legacy.sessions);
    const { data: record } = await service
      .from("student_records")
      .insert({
        user_id: userId,
        enrolment_id: enrolment.id,
        enrolled_at: `${legacy.batch_year}-01-01`,
        completed_at: `${legacy.batch_year}-12-01`,
      })
      .select("id")
      .maybeSingle();

    if (record?.id) {
      const examEntries = exams
        .filter((e) => e.percent != null)
        .map((e) => ({
          record_id: record.id,
          source: "manual" as const,
          label: e.label,
          percent: e.percent!,
          passed: e.percent! >= 80,
          include_in_total: true,
        }));
      if (examEntries.length) {
        await service.from("student_record_entries").insert(examEntries);
      }
      const sessionRows = sessions
        .filter((s) => s.present)
        .map((s, index) => ({
          record_id: record.id,
          session_date: `${legacy.batch_year}-01-01`,
          label: s.label || `Session ${index + 1}`,
          present: true,
        }));
      if (sessionRows.length) {
        await service.from("student_record_sessions").insert(sessionRows);
      }
    }

    if (legacy.cohort_id) {
      await service.from("student_placements").insert({
        user_id: userId,
        enrolment_id: enrolment.id,
        cohort_id: legacy.cohort_id,
        reason: "Legacy alumni email assigned",
        started_at: now,
        created_by: actor.id,
      });
    }

    const { error: linkError } = await service
      .from("alumni_legacy_people")
      .update({
        email,
        activated_user_id: userId,
        email_assigned_at: now,
        email_assigned_by: actor.id,
      })
      .eq("id", legacy.id);

    if (linkError) {
      console.error("[alumni] link activated", linkError);
    }

    let mailOk = true;
    if (input.sendAccessEmail !== false) {
      const mail = await sendEnrolmentAccessRecoveryEmail({
        to: email,
        firstName: String(legacy.first_name || "friend"),
        reference: reference.display,
        temporaryPassword,
        programmeLabel: String(legacy.batch_label || "Alumni"),
        portalLoginUrl: `${portalBaseUrl()}/login/alumni`,
        portalSupportUrl: `${portalBaseUrl()}${supportHref}`,
        siteUrl: SOD_SITE,
      });
      mailOk = mail.ok;
      if (!mail.ok) {
        console.error("[alumni] access email failed", mail);
      }
    }

    revalidatePath("/admin/alumni");
    revalidatePath(`/admin/alumni/${input.legacyId}`);
    revalidatePath("/admin/students");

    return {
      ok: true,
      message: mailOk
        ? "Email saved. Alumni can sign in at the alumni portal — access details were emailed."
        : "Email saved and portal account created, but the access email could not be sent. Use forgot password on alumni sign-in.",
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorized();
    }
    console.error("[alumni] assign email", error);
    return { ok: false, message: publicActionMessage(error) };
  }
}
