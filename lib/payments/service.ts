import {
  FEE_CATALOGUE,
  GRADUATION_FEE,
  TUITION_FEE,
  feeDefinition,
  feeRemaining,
  isFeeFullyPaid,
  normalizeFeeType,
  normalizeStudentFeePayment,
  hasTuitionInstallmentPaid,
  type FeeType,
  type FeeTransaction,
  type StudentFeePayment,
} from "@/lib/payments/fees";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

const ACCOUNT_SELECT =
  "id, user_id, fee_type, amount_gbp, amount_due_gbp, amount_paid_gbp, status, method, stripe_session_id, stripe_payment_intent, proof_path, proof_mime, proof_note, paid_at, reviewed_at, reviewed_by, created_at, updated_at";

const TRANSACTION_SELECT =
  "id, fee_account_id, user_id, fee_type, amount_gbp, status, method, stripe_session_id, stripe_payment_intent, proof_path, proof_mime, proof_note, paid_at, reviewed_at, reviewed_by, created_at, updated_at";

export async function ensureStudentFeeRows(
  client: SupabaseClient,
  userId: string,
): Promise<StudentFeePayment[]> {
  const existing = await listStudentFeePayments(client, userId);
  const have = new Set(existing.map((row) => row.fee_type));

  const missing = FEE_CATALOGUE.filter((fee) => !have.has(fee.type));
  if (missing.length > 0) {
    const { error } = await client.from("student_fee_payments").insert(
      missing.map((fee) => ({
        user_id: userId,
        fee_type: fee.type,
        amount_gbp: fee.amountGbp,
        amount_due_gbp: fee.amountGbp,
        amount_paid_gbp: 0,
        status: "unpaid",
      })),
    );
    if (error && !/duplicate|unique/i.test(error.message)) {
      throw new Error(error.message);
    }
  }

  return listStudentFeePayments(client, userId);
}

/** Ensure tuition and graduation fee rows exist; throw if any are still missing. */
export async function requireStudentFeeRows(
  client: SupabaseClient,
  userId: string,
): Promise<StudentFeePayment[]> {
  const rows = await ensureStudentFeeRows(client, userId);
  const have = new Set(rows.map((row) => row.fee_type));
  const missing = FEE_CATALOGUE.filter((fee) => !have.has(fee.type));
  if (missing.length > 0) {
    throw new Error(
      `Missing fee accounts: ${missing.map((fee) => fee.type).join(", ")}`,
    );
  }
  return rows;
}

export async function listStudentFeePayments(
  client: SupabaseClient,
  userId: string,
): Promise<StudentFeePayment[]> {
  const { data, error } = await client
    .from("student_fee_payments")
    .select(ACCOUNT_SELECT)
    .eq("user_id", userId)
    .order("fee_type", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    normalizeStudentFeePayment(row as Record<string, unknown>),
  );
}

export async function getFeePayment(
  client: SupabaseClient,
  userId: string,
  feeType: FeeType,
): Promise<StudentFeePayment | null> {
  const { data, error } = await client
    .from("student_fee_payments")
    .select(ACCOUNT_SELECT)
    .eq("user_id", userId)
    .eq("fee_type", feeType)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return normalizeStudentFeePayment(data as Record<string, unknown>);
}

export async function listFeeTransactions(
  client: SupabaseClient,
  userId: string,
  feeType?: FeeType,
): Promise<FeeTransaction[]> {
  let query = client
    .from("fee_transactions")
    .select(TRANSACTION_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (feeType) {
    query = query.eq("fee_type", feeType);
  }

  const { data, error } = await query;
  if (error) {
    if (/fee_transactions|relation|schema cache/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    ...(row as FeeTransaction),
    fee_type: normalizeFeeType(String(row.fee_type)) ?? "tuition",
  }));
}

export async function getFeeTransaction(
  client: SupabaseClient,
  transactionId: string,
): Promise<FeeTransaction | null> {
  const { data, error } = await client
    .from("fee_transactions")
    .select(TRANSACTION_SELECT)
    .eq("id", transactionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    ...(data as FeeTransaction),
    fee_type: normalizeFeeType(String(data.fee_type)) ?? "tuition",
  };
}

async function accountHasPendingReview(
  client: SupabaseClient,
  accountId: string,
): Promise<boolean> {
  const { count, error } = await client
    .from("fee_transactions")
    .select("id", { count: "exact", head: true })
    .eq("fee_account_id", accountId)
    .eq("status", "pending_review");

  if (error) {
    if (/fee_transactions|relation|schema cache/i.test(error.message)) {
      return false;
    }
    throw new Error(error.message);
  }
  return (count ?? 0) > 0;
}

async function syncTuitionEnrolment(
  service: SupabaseClient,
  userId: string,
  fullyPaid: boolean,
  pendingReview: boolean,
): Promise<void> {
  const { data: enrolment } = await service
    .from("enrolments")
    .select("id, status")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!enrolment?.id) return;

  const now = new Date().toISOString();
  if (fullyPaid) {
    await service
      .from("enrolments")
      .update({
        payment_status: "paid",
        status: "paid",
        updated_at: now,
      })
      .eq("id", enrolment.id);
    return;
  }

  if (pendingReview) {
    await service
      .from("enrolments")
      .update({
        payment_status: "pending_review",
        status: "payment_pending",
        updated_at: now,
      })
      .eq("id", enrolment.id);
    return;
  }

  const patch: Record<string, string> = {
    payment_status: "unpaid",
    updated_at: now,
  };
  if (enrolment.status === "paid") {
    patch.status = "accepted";
  }

  await service.from("enrolments").update(patch).eq("id", enrolment.id);
}

export async function refreshFeeAccountStatus(
  client: SupabaseClient,
  userId: string,
  feeType: FeeType,
): Promise<StudentFeePayment> {
  const account = await getFeePayment(client, userId, feeType);
  if (!account) {
    throw new Error("Fee account missing.");
  }

  const pending = await accountHasPendingReview(client, account.id);
  const fullyPaid = isFeeFullyPaid(account);
  const now = new Date().toISOString();

  let status: StudentFeePayment["status"] = "unpaid";
  if (fullyPaid) status = "paid";
  else if (pending) status = "pending_review";

  const { data, error } = await client
    .from("student_fee_payments")
    .update({
      status,
      paid_at: fullyPaid ? account.paid_at ?? now : null,
      updated_at: now,
    })
    .eq("id", account.id)
    .select(ACCOUNT_SELECT)
    .single();

  if (error) throw new Error(error.message);

  if (feeType === "tuition") {
    await syncTuitionEnrolment(client, userId, fullyPaid, pending);
    if (fullyPaid) {
      await syncGraduationIncluded(client, userId);
    }
  }

  return normalizeStudentFeePayment(data as Record<string, unknown>);
}

async function syncGraduationIncluded(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  const grad = await getFeePayment(client, userId, "graduation");
  if (!grad || grad.status === "paid") return;
  const now = new Date().toISOString();
  await client
    .from("student_fee_payments")
    .update({
      status: "paid",
      amount_due_gbp: 0,
      amount_paid_gbp: 0,
      paid_at: now,
      updated_at: now,
    })
    .eq("id", grad.id);
}

export async function createStripeTransaction(input: {
  userId: string;
  feeType: FeeType;
  amountGbp: number;
  stripeSessionId: string;
}): Promise<FeeTransaction> {
  const service = createServiceSupabaseClient();
  const account = await getFeePayment(service, input.userId, input.feeType);
  if (!account) throw new Error("Fee account missing.");

  const now = new Date().toISOString();
  const { data, error } = await service
    .from("fee_transactions")
    .insert({
      fee_account_id: account.id,
      user_id: input.userId,
      fee_type: input.feeType,
      amount_gbp: input.amountGbp,
      status: "unpaid",
      method: "stripe",
      stripe_session_id: input.stripeSessionId,
      created_at: now,
      updated_at: now,
    })
    .select(TRANSACTION_SELECT)
    .single();

  if (error) throw new Error(error.message);

  await service
    .from("student_fee_payments")
    .update({ method: "stripe", updated_at: now })
    .eq("id", account.id);

  await refreshFeeAccountStatus(service, input.userId, input.feeType);
  return data as FeeTransaction;
}

export async function applyPaidTransaction(input: {
  transactionId: string;
  method: "stripe" | "bank_transfer";
  stripeSessionId?: string | null;
  stripePaymentIntent?: string | null;
  reviewedBy?: string | null;
}): Promise<{ account: StudentFeePayment; transaction: FeeTransaction }> {
  const service = createServiceSupabaseClient();
  const transaction = await getFeeTransaction(service, input.transactionId);
  if (!transaction) throw new Error("Payment not found.");

  if (transaction.status === "paid") {
    const account = await getFeePayment(
      service,
      transaction.user_id,
      transaction.fee_type,
    );
    if (!account) throw new Error("Fee account missing.");
    return { account, transaction };
  }

  const now = new Date().toISOString();
  const { data: paidTx, error: txError } = await service
    .from("fee_transactions")
    .update({
      status: "paid",
      method: input.method,
      paid_at: now,
      reviewed_at: input.method === "bank_transfer" ? now : null,
      reviewed_by: input.reviewedBy ?? null,
      stripe_session_id:
        input.stripeSessionId ?? transaction.stripe_session_id,
      stripe_payment_intent:
        input.stripePaymentIntent ?? transaction.stripe_payment_intent,
      updated_at: now,
    })
    .eq("id", transaction.id)
    .select(TRANSACTION_SELECT)
    .single();

  if (txError) throw new Error(txError.message);

  const account = await getFeePayment(
    service,
    transaction.user_id,
    transaction.fee_type,
  );
  if (!account) throw new Error("Fee account missing.");

  const newPaid = Number(account.amount_paid_gbp) + Number(transaction.amount_gbp);
  const { data: updatedAccount, error: accountError } = await service
    .from("student_fee_payments")
    .update({
      amount_paid_gbp: newPaid,
      method: input.method,
      paid_at: isFeeFullyPaid({ ...account, amount_paid_gbp: newPaid })
        ? now
        : account.paid_at,
      reviewed_at: input.method === "bank_transfer" ? now : account.reviewed_at,
      reviewed_by: input.reviewedBy ?? account.reviewed_by,
      updated_at: now,
    })
    .eq("id", account.id)
    .select(ACCOUNT_SELECT)
    .single();

  if (accountError) throw new Error(accountError.message);

  const normalized = normalizeStudentFeePayment(
    updatedAccount as Record<string, unknown>,
  );
  const refreshed = await refreshFeeAccountStatus(
    service,
    transaction.user_id,
    transaction.fee_type,
  );

  return {
    account: refreshed ?? normalized,
    transaction: paidTx as FeeTransaction,
  };
}

/** @deprecated Prefer applyPaidTransaction — kept for webhook idempotency paths */
export async function markFeePaid(input: {
  userId: string;
  feeType: FeeType;
  method: "stripe" | "bank_transfer";
  amountGbp?: number;
  stripeSessionId?: string | null;
  stripePaymentIntent?: string | null;
  reviewedBy?: string | null;
  transactionId?: string;
}): Promise<StudentFeePayment> {
  if (input.transactionId) {
    const { account } = await applyPaidTransaction({
      transactionId: input.transactionId,
      method: input.method,
      stripeSessionId: input.stripeSessionId,
      stripePaymentIntent: input.stripePaymentIntent,
      reviewedBy: input.reviewedBy,
    });
    return account;
  }

  const service = createServiceSupabaseClient();
  await ensureStudentFeeRows(service, input.userId);
  const account = await getFeePayment(service, input.userId, input.feeType);
  if (!account) throw new Error("Fee account missing.");

  const remaining = feeRemaining(account);
  const amount = input.amountGbp ?? remaining;
  const now = new Date().toISOString();

  const { data: tx, error } = await service
    .from("fee_transactions")
    .insert({
      fee_account_id: account.id,
      user_id: input.userId,
      fee_type: input.feeType,
      amount_gbp: amount,
      status: "unpaid",
      method: input.method,
      stripe_session_id: input.stripeSessionId ?? null,
      stripe_payment_intent: input.stripePaymentIntent ?? null,
      paid_at: null,
      reviewed_at: input.method === "bank_transfer" ? null : null,
      reviewed_by: input.reviewedBy ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const { account: updated } = await applyPaidTransaction({
    transactionId: tx.id as string,
    method: input.method,
    stripeSessionId: input.stripeSessionId,
    stripePaymentIntent: input.stripePaymentIntent,
    reviewedBy: input.reviewedBy,
  });

  return updated;
}

export async function markFeePendingReview(input: {
  userId: string;
  feeType: FeeType;
  amountGbp: number;
  proofPath: string;
  proofMime: string;
  proofNote: string | null;
}): Promise<{ account: StudentFeePayment; transaction: FeeTransaction }> {
  const service = createServiceSupabaseClient();
  const now = new Date().toISOString();
  await ensureStudentFeeRows(service, input.userId);
  const account = await getFeePayment(service, input.userId, input.feeType);
  if (!account) throw new Error("Fee account missing.");
  if (account.status === "pending_review") {
    throw new Error(
      "A bank proof is already with the desk. Wait for a decision before sending another.",
    );
  }

  const { data, error } = await service
    .from("fee_transactions")
    .insert({
      fee_account_id: account.id,
      user_id: input.userId,
      fee_type: input.feeType,
      amount_gbp: input.amountGbp,
      status: "pending_review",
      method: "bank_transfer",
      proof_path: input.proofPath,
      proof_mime: input.proofMime,
      proof_note: input.proofNote,
      created_at: now,
      updated_at: now,
    })
    .select(TRANSACTION_SELECT)
    .single();

  if (error) throw new Error(error.message);

  await service
    .from("student_fee_payments")
    .update({ method: "bank_transfer", updated_at: now })
    .eq("id", account.id);

  const refreshed = await refreshFeeAccountStatus(
    service,
    input.userId,
    input.feeType,
  );

  return { account: refreshed, transaction: data as FeeTransaction };
}

export async function rejectFeeTransaction(input: {
  transactionId: string;
}): Promise<StudentFeePayment> {
  const service = createServiceSupabaseClient();
  const transaction = await getFeeTransaction(service, input.transactionId);
  if (!transaction) throw new Error("Payment not found.");

  if (transaction.proof_path) {
    await service.storage
      .from("payment-proofs")
      .remove([transaction.proof_path])
      .catch(() => null);
  }

  const { error } = await service
    .from("fee_transactions")
    .delete()
    .eq("id", transaction.id);

  if (error) throw new Error(error.message);

  return refreshFeeAccountStatus(
    service,
    transaction.user_id,
    transaction.fee_type,
  );
}

/** @deprecated Use rejectFeeTransaction */
export async function markFeeReturned(input: {
  userId: string;
  feeType: FeeType;
}): Promise<StudentFeePayment> {
  const service = createServiceSupabaseClient();
  const { data: pending } = await service
    .from("fee_transactions")
    .select("id")
    .eq("user_id", input.userId)
    .eq("fee_type", input.feeType)
    .eq("status", "pending_review")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pending?.id) {
    return rejectFeeTransaction({ transactionId: pending.id as string });
  }

  const account = await getFeePayment(service, input.userId, input.feeType);
  if (!account) throw new Error("Fee account missing.");
  return account;
}

export async function isTuitionFullyPaid(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const account = await getFeePayment(client, userId, "tuition");
  if (!account) return false;
  return isFeeFullyPaid(account);
}

export async function canUploadPassport(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const account = await getFeePayment(client, userId, "tuition");
  return hasTuitionInstallmentPaid(account);
}

/**
 * Align tuition fee account when Students desk changes enrolment payment_status.
 */
export async function syncTuitionFeePaymentStatus(input: {
  userId: string;
  paymentStatus: "unpaid" | "pending_review" | "paid";
  reviewedBy?: string | null;
}): Promise<void> {
  const service = createServiceSupabaseClient();
  await ensureStudentFeeRows(service, input.userId);
  const account = await getFeePayment(service, input.userId, "tuition");
  if (!account) return;

  if (input.paymentStatus === "paid") {
    const remaining = feeRemaining(account);
    if (remaining <= 0) {
      await syncTuitionEnrolment(service, input.userId, true, false);
      return;
    }
    await markFeePaid({
      userId: input.userId,
      feeType: "tuition",
      method: account.method === "stripe" ? "stripe" : "bank_transfer",
      amountGbp: remaining,
      reviewedBy: input.reviewedBy ?? null,
    });
    return;
  }

  if (input.paymentStatus === "unpaid") {
    const now = new Date().toISOString();
    await service
      .from("student_fee_payments")
      .update({
        amount_paid_gbp: 0,
        status: "unpaid",
        method: null,
        paid_at: null,
        reviewed_at: null,
        reviewed_by: null,
        updated_at: now,
      })
      .eq("id", account.id);

    await service
      .from("fee_transactions")
      .delete()
      .eq("fee_account_id", account.id);

    await syncTuitionEnrolment(service, input.userId, false, false);
    return;
  }

  await refreshFeeAccountStatus(service, input.userId, "tuition");
}

/** @deprecated */
export const syncApplicationFeePaymentStatus = syncTuitionFeePaymentStatus;

export function feeCatalogueAmount(type: FeeType): number {
  return feeDefinition(type).amountGbp;
}

export { TUITION_FEE, GRADUATION_FEE };
