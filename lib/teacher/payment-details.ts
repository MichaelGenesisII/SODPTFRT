import {
  decryptField,
  encryptField,
  isPaymentEncryptionConfigured,
} from "@/lib/crypto/field-encryption";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type TeacherPaymentMethod = "paypal" | "bank_transfer";

export const TEACHER_PAYMENT_RECENT_DAYS = 30;

export type TeacherPaymentDetailsPublic = {
  preferredMethod: TeacherPaymentMethod;
  /** Masked PayPal email, or null when method is bank. */
  paypalEmailMask: string | null;
  /** Last 4 of account number, or null when method is PayPal. */
  bankAccountLast4: string | null;
  detailsUpdatedAt: string;
  recentlyChanged: boolean;
};

/** Teacher-facing view may include full values after decrypt (own row only). */
export type TeacherPaymentDetailsOwn = TeacherPaymentDetailsPublic & {
  paypalEmail: string | null;
  bankAccountName: string | null;
  bankSortCode: string | null;
  bankAccountNumber: string | null;
};

export type FinanceTeacherPaymentSummary = {
  teacherId: string;
  preferredMethod: TeacherPaymentMethod | null;
  payeeMask: string | null;
  detailsUpdatedAt: string | null;
  recentlyChanged: boolean;
  hasDetails: boolean;
};

function isRecent(iso: string, now = Date.now()): boolean {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t <= TEACHER_PAYMENT_RECENT_DAYS * 24 * 60 * 60 * 1000;
}

export function maskPaypalEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "••••";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const head = local.slice(0, 1) || "•";
  return `${head}••••@${domain}`;
}

export function normaliseSortCode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 6) return raw.trim();
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4, 6)}`;
}

export function normaliseAccountNumber(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

export function payeeMaskLabel(row: {
  preferredMethod: TeacherPaymentMethod;
  paypalEmailMask: string | null;
  bankAccountLast4: string | null;
}): string {
  if (row.preferredMethod === "paypal") {
    return row.paypalEmailMask ?? "PayPal on file";
  }
  return row.bankAccountLast4
    ? `Bank ·••••${row.bankAccountLast4}`
    : "Bank on file";
}

export function methodLabel(method: TeacherPaymentMethod): string {
  return method === "paypal" ? "PayPal" : "Bank transfer";
}

type DbRow = {
  teacher_id: string;
  preferred_method: TeacherPaymentMethod;
  paypal_email_enc: string | null;
  paypal_email_mask: string | null;
  bank_account_name_enc: string | null;
  bank_sort_code_enc: string | null;
  bank_account_number_enc: string | null;
  bank_account_last4: string | null;
  details_updated_at: string;
};

function toPublic(row: DbRow): TeacherPaymentDetailsPublic {
  return {
    preferredMethod: row.preferred_method,
    paypalEmailMask: row.paypal_email_mask,
    bankAccountLast4: row.bank_account_last4,
    detailsUpdatedAt: row.details_updated_at,
    recentlyChanged: isRecent(row.details_updated_at),
  };
}

export async function getTeacherPaymentDetailsRow(
  teacherId: string,
): Promise<DbRow | null> {
  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("teacher_payment_details")
    .select(
      "teacher_id, preferred_method, paypal_email_enc, paypal_email_mask, bank_account_name_enc, bank_sort_code_enc, bank_account_number_enc, bank_account_last4, details_updated_at",
    )
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (error) {
    console.error("[teacher/payment-details/get]", error.message);
    throw new Error("Payment details could not be loaded.");
  }
  return (data as DbRow | null) ?? null;
}

export async function getTeacherPaymentDetailsPublic(
  teacherId: string,
): Promise<TeacherPaymentDetailsPublic | null> {
  const row = await getTeacherPaymentDetailsRow(teacherId);
  return row ? toPublic(row) : null;
}

export async function getTeacherPaymentDetailsOwn(
  teacherId: string,
): Promise<TeacherPaymentDetailsOwn | null> {
  const row = await getTeacherPaymentDetailsRow(teacherId);
  if (!row) return null;
  const pub = toPublic(row);
  if (!isPaymentEncryptionConfigured()) {
    return {
      ...pub,
      paypalEmail: null,
      bankAccountName: null,
      bankSortCode: null,
      bankAccountNumber: null,
    };
  }
  try {
    return {
      ...pub,
      paypalEmail: row.paypal_email_enc
        ? decryptField(row.paypal_email_enc)
        : null,
      bankAccountName: row.bank_account_name_enc
        ? decryptField(row.bank_account_name_enc)
        : null,
      bankSortCode: row.bank_sort_code_enc
        ? decryptField(row.bank_sort_code_enc)
        : null,
      bankAccountNumber: row.bank_account_number_enc
        ? decryptField(row.bank_account_number_enc)
        : null,
    };
  } catch (error) {
    console.error("[teacher/payment-details/decrypt]", error);
    throw new Error("Payment details could not be loaded.");
  }
}

/** Decrypt PayPal email for payout addressing (server only). */
export async function getTeacherPaypalEmailForPayout(
  teacherId: string,
): Promise<string | null> {
  const row = await getTeacherPaymentDetailsRow(teacherId);
  if (!row || row.preferred_method !== "paypal" || !row.paypal_email_enc) {
    return null;
  }
  return decryptField(row.paypal_email_enc);
}

export async function listFinanceTeacherPaymentSummaries(
  teacherIds: string[],
): Promise<Map<string, FinanceTeacherPaymentSummary>> {
  const map = new Map<string, FinanceTeacherPaymentSummary>();
  for (const id of teacherIds) {
    map.set(id, {
      teacherId: id,
      preferredMethod: null,
      payeeMask: null,
      detailsUpdatedAt: null,
      recentlyChanged: false,
      hasDetails: false,
    });
  }
  if (teacherIds.length === 0) return map;

  const service = createServiceSupabaseClient();
  const { data, error } = await service
    .from("teacher_payment_details")
    .select(
      "teacher_id, preferred_method, paypal_email_mask, bank_account_last4, details_updated_at",
    )
    .in("teacher_id", teacherIds);

  if (error) {
    console.error("[finance/payment-details/list]", error.message);
    throw new Error("Payment details could not be loaded.");
  }

  for (const row of data ?? []) {
    const method = row.preferred_method as TeacherPaymentMethod;
    const pub = {
      preferredMethod: method,
      paypalEmailMask: (row.paypal_email_mask as string | null) ?? null,
      bankAccountLast4: (row.bank_account_last4 as string | null) ?? null,
    };
    const updated = row.details_updated_at as string;
    map.set(row.teacher_id as string, {
      teacherId: row.teacher_id as string,
      preferredMethod: method,
      payeeMask: payeeMaskLabel(pub),
      detailsUpdatedAt: updated,
      recentlyChanged: isRecent(updated),
      hasDetails: true,
    });
  }
  return map;
}

export type SaveTeacherPaymentInput =
  | {
      method: "paypal";
      paypalEmail: string;
    }
  | {
      method: "bank_transfer";
      bankAccountName: string;
      bankSortCode: string;
      bankAccountNumber: string;
    };

export async function upsertTeacherPaymentDetails(
  teacherId: string,
  input: SaveTeacherPaymentInput,
): Promise<{
  before: TeacherPaymentDetailsOwn | null;
  after: TeacherPaymentDetailsPublic;
}> {
  if (!isPaymentEncryptionConfigured()) {
    throw new Error("Payment details are temporarily unavailable.");
  }

  const before = await getTeacherPaymentDetailsOwn(teacherId);
  const now = new Date().toISOString();

  let payload: Record<string, unknown>;
  if (input.method === "paypal") {
    const email = input.paypalEmail.trim().toLowerCase();
    payload = {
      teacher_id: teacherId,
      preferred_method: "paypal",
      paypal_email_enc: encryptField(email),
      paypal_email_mask: maskPaypalEmail(email),
      bank_account_name_enc: null,
      bank_sort_code_enc: null,
      bank_account_number_enc: null,
      bank_account_last4: null,
      details_updated_at: now,
      updated_at: now,
    };
  } else {
    const name = input.bankAccountName.trim();
    const sort = normaliseSortCode(input.bankSortCode);
    const account = normaliseAccountNumber(input.bankAccountNumber);
    payload = {
      teacher_id: teacherId,
      preferred_method: "bank_transfer",
      paypal_email_enc: null,
      paypal_email_mask: null,
      bank_account_name_enc: encryptField(name),
      bank_sort_code_enc: encryptField(sort),
      bank_account_number_enc: encryptField(account),
      bank_account_last4: account.slice(-4),
      details_updated_at: now,
      updated_at: now,
    };
  }

  const service = createServiceSupabaseClient();
  const { error } = await service
    .from("teacher_payment_details")
    .upsert(payload, { onConflict: "teacher_id" });

  if (error) {
    console.error("[teacher/payment-details/upsert]", error.message);
    throw new Error("Payment details could not be saved.");
  }

  const after = (await getTeacherPaymentDetailsPublic(teacherId))!;
  return { before, after };
}
