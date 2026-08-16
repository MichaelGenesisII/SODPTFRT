import {
  APPLICATION_FEE,
  FEE_CATALOGUE,
  GRADUATION_FEE,
  type FeeType,
  type StudentFeePayment,
} from "@/lib/payments/fees";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

const SELECT =
  "id, user_id, fee_type, amount_gbp, status, method, stripe_session_id, stripe_payment_intent, proof_path, proof_mime, proof_note, paid_at, reviewed_at, reviewed_by, created_at, updated_at";

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
        status: "unpaid",
      })),
    );
    if (error && !/duplicate|unique/i.test(error.message)) {
      throw new Error(error.message);
    }
  }

  return listStudentFeePayments(client, userId);
}

export async function listStudentFeePayments(
  client: SupabaseClient,
  userId: string,
): Promise<StudentFeePayment[]> {
  const { data, error } = await client
    .from("student_fee_payments")
    .select(SELECT)
    .eq("user_id", userId)
    .order("fee_type", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as StudentFeePayment[];
}

export async function getFeePayment(
  client: SupabaseClient,
  userId: string,
  feeType: FeeType,
): Promise<StudentFeePayment | null> {
  const { data, error } = await client
    .from("student_fee_payments")
    .select(SELECT)
    .eq("user_id", userId)
    .eq("fee_type", feeType)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as StudentFeePayment | null) ?? null;
}

/** Mark a fee paid and keep legacy enrolment payment fields in sync for application fee. */
export async function markFeePaid(input: {
  userId: string;
  feeType: FeeType;
  method: "stripe" | "bank_transfer";
  stripeSessionId?: string | null;
  stripePaymentIntent?: string | null;
  reviewedBy?: string | null;
}): Promise<StudentFeePayment> {
  const service = createServiceSupabaseClient();
  const now = new Date().toISOString();
  const fee =
    input.feeType === "graduation" ? GRADUATION_FEE : APPLICATION_FEE;

  await ensureStudentFeeRows(service, input.userId);

  const patch: Record<string, unknown> = {
    status: "paid",
    method: input.method,
    amount_gbp: fee.amountGbp,
    paid_at: now,
    reviewed_at: input.method === "bank_transfer" ? now : null,
    reviewed_by: input.reviewedBy ?? null,
    updated_at: now,
  };
  if (input.stripeSessionId !== undefined) {
    patch.stripe_session_id = input.stripeSessionId;
  }
  if (input.stripePaymentIntent !== undefined) {
    patch.stripe_payment_intent = input.stripePaymentIntent;
  }

  const { data, error } = await service
    .from("student_fee_payments")
    .update(patch)
    .eq("user_id", input.userId)
    .eq("fee_type", input.feeType)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);

  if (input.feeType === "application") {
    await service
      .from("enrolments")
      .update({
        payment_status: "paid",
        status: "paid",
        updated_at: now,
      })
      .eq("user_id", input.userId);
  }

  return data as StudentFeePayment;
}

/**
 * Align application fee row when Students desk changes enrolment payment_status.
 * Preserves existing method / Stripe ids when marking paid.
 */
export async function syncApplicationFeePaymentStatus(input: {
  userId: string;
  paymentStatus: "unpaid" | "pending_review" | "paid";
  reviewedBy?: string | null;
}): Promise<void> {
  const service = createServiceSupabaseClient();
  const now = new Date().toISOString();
  await ensureStudentFeeRows(service, input.userId);

  if (input.paymentStatus === "paid") {
    const existing = await getFeePayment(service, input.userId, "application");
    if (existing?.status === "paid") {
      await service
        .from("enrolments")
        .update({
          payment_status: "paid",
          status: "paid",
          updated_at: now,
        })
        .eq("user_id", input.userId);
      return;
    }
    await markFeePaid({
      userId: input.userId,
      feeType: "application",
      method: existing?.method === "stripe" ? "stripe" : "bank_transfer",
      stripeSessionId: existing?.stripe_session_id,
      stripePaymentIntent: existing?.stripe_payment_intent,
      reviewedBy: input.reviewedBy ?? null,
    });
    return;
  }

  if (input.paymentStatus === "unpaid") {
    await markFeeReturned({
      userId: input.userId,
      feeType: "application",
    });
    return;
  }

  const { error } = await service
    .from("student_fee_payments")
    .update({
      status: "pending_review",
      method: "bank_transfer",
      updated_at: now,
    })
    .eq("user_id", input.userId)
    .eq("fee_type", "application");

  if (error) throw new Error(error.message);

  await service
    .from("enrolments")
    .update({
      payment_status: "pending_review",
      status: "payment_pending",
      updated_at: now,
    })
    .eq("user_id", input.userId);
}

export async function markFeePendingReview(input: {
  userId: string;
  feeType: FeeType;
  proofPath: string;
  proofMime: string;
  proofNote: string | null;
}): Promise<StudentFeePayment> {
  const service = createServiceSupabaseClient();
  const now = new Date().toISOString();
  await ensureStudentFeeRows(service, input.userId);

  const { data, error } = await service
    .from("student_fee_payments")
    .update({
      status: "pending_review",
      method: "bank_transfer",
      proof_path: input.proofPath,
      proof_mime: input.proofMime,
      proof_note: input.proofNote,
      updated_at: now,
    })
    .eq("user_id", input.userId)
    .eq("fee_type", input.feeType)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);

  if (input.feeType === "application") {
    await service
      .from("enrolments")
      .update({
        payment_status: "pending_review",
        status: "payment_pending",
        updated_at: now,
      })
      .eq("user_id", input.userId);
  }

  return data as StudentFeePayment;
}

/** Return a bank proof to the student — clears proof and marks unpaid again. */
export async function markFeeReturned(input: {
  userId: string;
  feeType: FeeType;
}): Promise<StudentFeePayment> {
  const service = createServiceSupabaseClient();
  const now = new Date().toISOString();
  await ensureStudentFeeRows(service, input.userId);

  const { data, error } = await service
    .from("student_fee_payments")
    .update({
      status: "unpaid",
      method: null,
      proof_path: null,
      proof_mime: null,
      proof_note: null,
      paid_at: null,
      reviewed_at: null,
      reviewed_by: null,
      updated_at: now,
    })
    .eq("user_id", input.userId)
    .eq("fee_type", input.feeType)
    .select(SELECT)
    .single();

  if (error) throw new Error(error.message);

  if (input.feeType === "application") {
    const { data: enrolment } = await service
      .from("enrolments")
      .select("status")
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const patch: {
      payment_status: string;
      updated_at: string;
      status?: string;
    } = {
      payment_status: "unpaid",
      updated_at: now,
    };
    // Do not wipe review progress — only unwind a paid seat.
    if (enrolment?.status === "paid") {
      patch.status = "accepted";
    }

    await service.from("enrolments").update(patch).eq("user_id", input.userId);
  }

  return data as StudentFeePayment;
}
