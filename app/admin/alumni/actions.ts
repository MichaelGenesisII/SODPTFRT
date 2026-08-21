"use server";

import { revalidatePath } from "next/cache";
import { parseAlumniWorkbook } from "@/lib/alumni/parse-workbook";
import type {
  AlumniImportPreview,
  AlumniImportResult,
  ParsedAlumniRow,
} from "@/lib/alumni/types";
import { isNationalAdmin, requireSessionAdmin } from "@/lib/admin/auth";
import type { AdminStudentRecord } from "@/lib/admin/students";
import { listAdminStudents } from "@/app/admin/students/actions";
import { createApplicationReference, createTemporaryPassword } from "@/lib/enrol/reference";
import { ensureStudentFeeRows, markFeePaid } from "@/lib/payments/service";
import { publicActionMessage } from "@/lib/safe-action-message";
import { findAuthUserIdByEmail } from "@/lib/supabase/auth-admin";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type AlumniActionResult = {
  ok: boolean;
  message: string;
};

function unauthorized(): AlumniActionResult {
  return { ok: false, message: "Unauthorized." };
}

export async function listAlumniStudents(): Promise<AdminStudentRecord[]> {
  const students = await listAdminStudents();
  return students.filter((s) => s.account_kind === "alumni");
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
    const preview = parseAlumniWorkbook(buffer);
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

async function importAlumniRow(
  row: ParsedAlumniRow,
  cohortId: string | null,
  actorId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const service = createServiceSupabaseClient();
  const email = row.email.toLowerCase();

  const [{ data: existingProfile }, { data: existingAdmin }] = await Promise.all([
    service.from("student_profiles").select("id, email").eq("email", email).maybeSingle(),
    service.from("admin_profiles").select("id").eq("email", email).maybeSingle(),
  ]);

  if (existingProfile || existingAdmin) {
    return { ok: false, reason: "Email already registered" };
  }

  const existingAuthId = await findAuthUserIdByEmail(service, email);
  if (existingAuthId) {
    return { ok: false, reason: "Email already registered" };
  }

  const temporaryPassword = createTemporaryPassword();
  const reference = createApplicationReference();
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      first_name: row.firstName,
      last_name: row.lastName,
      role: "student",
    },
  });

  if (createError || !created.user) {
    console.error("[alumni import createUser]", createError);
    return { ok: false, reason: "Could not create account" };
  }

  const userId = created.user.id;
  const now = new Date().toISOString();

  const { error: profileError } = await service.from("student_profiles").insert({
    id: userId,
    email,
    first_name: row.firstName,
    middle_name: row.middleName,
    last_name: row.lastName,
    is_active: true,
    account_kind: "alumni",
    legacy_bypass_graduation_gate: true,
    manuals_status: row.manualsSent ? "sent" : "not_sent",
    manuals_sent_at: row.manualsSent ? now : null,
    manuals_sent_by: row.manualsSent ? actorId : null,
  });

  if (profileError) {
    await service.auth.admin.deleteUser(userId);
    console.error("[alumni import profile]", profileError);
    return { ok: false, reason: "Could not create profile" };
  }

  const { data: enrolment, error: enrolError } = await service
    .from("enrolments")
    .insert({
      user_id: userId,
      reference: reference.display,
      reference_compact: reference.compact,
      status: "accepted",
      payment_status: row.tuitionPaidGbp > 0 ? "paid" : "unpaid",
      attendance_mode: "standard",
      first_name: row.firstName,
      middle_name: row.middleName,
      last_name: row.lastName,
      address_line1: "Imported record",
      town_city: "—",
      postcode: "—",
      country: "United Kingdom",
      mobile_number: row.mobile && row.mobile.length >= 7 ? row.mobile : "0000000000",
      email,
      nationality: "—",
      date_of_birth: "1990-01-01",
      marital_status: "—",
      born_again: "Yes",
      baptised_holy_spirit: "Yes",
      baptised_water: "Yes",
      schools_attended: "Imported from legacy spreadsheet",
      occupations: [],
      local_church: row.parishName ?? "",
      church_leader: "Imported",
      cohort_id: cohortId,
      legacy_app_com_no: row.legacyAppComNo,
      declaration_accepted: true,
      declared_at: now,
    })
    .select("id")
    .maybeSingle();

  if (enrolError || !enrolment) {
    await service.from("student_profiles").delete().eq("id", userId);
    await service.auth.admin.deleteUser(userId);
    console.error("[alumni import enrolment]", enrolError);
    return { ok: false, reason: "Could not create enrolment" };
  }

  await ensureStudentFeeRows(service, userId);

  if (row.tuitionPaidGbp > 0) {
    try {
      await markFeePaid({
        userId,
        feeType: "tuition",
        method: "bank_transfer",
        amountGbp: row.tuitionPaidGbp,
        reviewedBy: actorId,
      });
    } catch (feeError) {
      console.error("[alumni import tuition]", feeError);
    }
  }

  if (row.graduationPaidGbp > 0) {
    try {
      await markFeePaid({
        userId,
        feeType: "graduation",
        method: "bank_transfer",
        amountGbp: row.graduationPaidGbp,
        reviewedBy: actorId,
      });
    } catch (feeError) {
      console.error("[alumni import graduation]", feeError);
    }
  }

  const { data: record } = await service
    .from("student_records")
    .insert({
      user_id: userId,
      enrolment_id: enrolment.id,
      enrolled_at: now.slice(0, 10),
    })
    .select("id")
    .maybeSingle();

  if (record?.id) {
    const examEntries = row.exams
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

    const sessionRows = row.sessions
      .filter((s) => s.present)
      .map((s, index) => ({
        record_id: record.id,
        session_date: now.slice(0, 10),
        label: s.label || `Session ${index + 1}`,
        present: true,
      }));

    if (sessionRows.length) {
      await service.from("student_record_sessions").insert(sessionRows);
    }
  }

  if (cohortId) {
    await service.from("student_placements").insert({
      user_id: userId,
      enrolment_id: enrolment.id,
      cohort_id: cohortId,
      reason: "Legacy alumni import",
      started_at: now,
      created_by: actorId,
    });
  }

  return { ok: true };
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
        skipped: [],
      };
    }

    if (!input.rows.length) {
      return {
        ok: false,
        message: "No valid rows to import.",
        imported: 0,
        skipped: [],
      };
    }

    let imported = 0;
    const skipped: AlumniImportPreview["skipped"] = [];

    for (const row of input.rows) {
      const cohortId = input.cohortBySheet[row.sheet] ?? null;
      const result = await importAlumniRow(row, cohortId, actor.id);
      if (result.ok) {
        imported += 1;
      } else {
        skipped.push({
          sheet: row.sheet,
          rowNumber: row.rowNumber,
          reason: "duplicate_email",
          detail: `${row.email} — ${result.reason}`,
        });
      }
    }

    revalidatePath("/admin/alumni");
    revalidatePath("/admin/students");

    return {
      ok: true,
      message: `Imported ${imported} alumni record${imported === 1 ? "" : "s"}.`,
      imported,
      skipped,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return {
        ok: false,
        message: unauthorized().message,
        imported: 0,
        skipped: [],
      };
    }
    return {
      ok: false,
      message: publicActionMessage(error),
      imported: 0,
      skipped: [],
    };
  }
}
