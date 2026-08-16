"use server";

import { revalidatePath } from "next/cache";
import {
  isNationalAdmin,
  requireSessionAdmin,
  type AdminProfile,
} from "@/lib/admin/auth";
import {
  feeDefinition,
  formatGbp,
  isFeeType,
  type FeeType,
  type StudentFeePayment,
} from "@/lib/payments/fees";
import {
  markFeePaid,
  markFeeReturned,
} from "@/lib/payments/service";
import {
  sendPaymentApprovedEmail,
  sendPaymentReturnedEmail,
} from "@/lib/email/payment-mail";
import { portalBaseUrl } from "@/lib/email/backend";
import { publicActionMessage } from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { formatBatchLabel } from "@/lib/parishes";

export type PaymentActionResult = {
  ok: boolean;
  message: string;
  url?: string;
};

export type AdminPaymentQueueItem = StudentFeePayment & {
  student_name: string;
  student_email: string;
  reference: string | null;
  parish_id: string | null;
  parish_name: string | null;
  batch_label: string | null;
};

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

function fail(error: unknown, fallback?: string): PaymentActionResult {
  return { ok: false, message: publicActionMessage(error, fallback) };
}

function revalidatePayments() {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/students");
  revalidatePath("/student");
  revalidatePath("/student/payments");
}

/**
 * Cookie gate — parish desks only act on fees for students enrolled in their
 * parish. Does not rely solely on fee-table RLS (older installs were too open).
 */
async function requireAccessiblePayment(paymentId: string): Promise<
  | {
      ok: true;
      row: StudentFeePayment;
      supabase: Supabase;
      actor: AdminProfile;
      parish_id: string | null;
    }
  | { ok: false; message: string }
> {
  let actor: AdminProfile;
  try {
    actor = await requireSessionAdmin();
  } catch {
    return { ok: false, message: "Unauthorized." };
  }

  if (!paymentId) {
    return { ok: false, message: "Payment id is required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("student_fee_payments")
    .select(
      "id, user_id, fee_type, amount_gbp, status, method, proof_path, proof_mime, proof_note, paid_at, reviewed_at, reviewed_by, created_at, updated_at, stripe_session_id, stripe_payment_intent",
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (error) return { ok: false, message: publicActionMessage(error.message) };
  if (!data) {
    return {
      ok: false,
      message: "Payment not found or outside your parish scope.",
    };
  }

  const { data: enrolment } = await supabase
    .from("enrolments")
    .select("parish_id")
    .eq("user_id", data.user_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const parishId = enrolment?.parish_id ?? null;

  if (!isNationalAdmin(actor)) {
    if (!actor.parish_id) {
      return {
        ok: false,
        message: "Parish desk is not assigned to a parish.",
      };
    }
    // Enrolment must be visible and match — blocks loose fee RLS leaks.
    if (!parishId || parishId !== actor.parish_id) {
      return {
        ok: false,
        message: "Payment not found or outside your parish scope.",
      };
    }
  }

  return {
    ok: true,
    row: data as StudentFeePayment,
    supabase,
    actor,
    parish_id: parishId,
  };
}

export async function listAdminPaymentQueue(
  statusFilter: "pending_review" | "paid" | "all" = "pending_review",
): Promise<AdminPaymentQueueItem[]> {
  const actor = await requireSessionAdmin();
  const supabase = await createServerSupabaseClient();

  if (!isNationalAdmin(actor) && !actor.parish_id) {
    return [];
  }

  let query = supabase
    .from("student_fee_payments")
    .select(
      "id, user_id, fee_type, amount_gbp, status, method, stripe_session_id, stripe_payment_intent, proof_path, proof_mime, proof_note, paid_at, reviewed_at, reviewed_by, created_at, updated_at",
    )
    .order("updated_at", { ascending: false });

  if (statusFilter === "pending_review") {
    query = query.eq("status", "pending_review");
  } else if (statusFilter === "paid") {
    query = query.eq("status", "paid").eq("method", "bank_transfer");
  } else {
    query = query.in("status", ["pending_review", "paid"]);
  }

  const { data: rows, error } = await query.limit(200);
  if (error) throw new Error(error.message);
  const payments = (rows ?? []) as StudentFeePayment[];
  if (payments.length === 0) return [];

  const userIds = Array.from(new Set(payments.map((p) => p.user_id)));

  const [{ data: profiles }, { data: enrolments }] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("id, first_name, last_name, email")
      .in("id", userIds),
    supabase
      .from("enrolments")
      .select(
        "user_id, reference, parish_id, batch_id, created_at, parishes(name), batches(name, year)",
      )
      .in("user_id", userIds)
      .order("created_at", { ascending: false }),
  ]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      {
        name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Student",
        email: (p.email as string) || "",
      },
    ]),
  );

  type EnrolRow = {
    user_id: string;
    reference: string | null;
    parish_id: string | null;
    batch_id: string | null;
    parishes: { name: string } | { name: string }[] | null;
    batches:
      | { name: string; year: number }
      | { name: string; year: number }[]
      | null;
  };

  function one<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
  }

  const enrolMap = new Map<string, EnrolRow>();
  for (const row of (enrolments ?? []) as EnrolRow[]) {
    if (!enrolMap.has(row.user_id)) enrolMap.set(row.user_id, row);
  }

  const items = payments.map((payment) => {
    const profile = profileMap.get(payment.user_id);
    const enrol = enrolMap.get(payment.user_id);
    const parish = one(enrol?.parishes);
    const batch = one(enrol?.batches);
    return {
      ...payment,
      student_name: profile?.name ?? "Student",
      student_email: profile?.email ?? "",
      reference: enrol?.reference ?? null,
      parish_id: enrol?.parish_id ?? null,
      parish_name: parish?.name ?? null,
      batch_label: batch
        ? formatBatchLabel({ name: batch.name, year: batch.year })
        : null,
    };
  });

  // App-layer parish filter (covers installs where fee RLS is still open).
  if (!isNationalAdmin(actor) && actor.parish_id) {
    return items.filter((item) => item.parish_id === actor.parish_id);
  }

  return items;
}

export async function getPaymentProofSignedUrl(
  paymentId: string,
): Promise<PaymentActionResult> {
  try {
    const access = await requireAccessiblePayment(paymentId);
    if (!access.ok) return { ok: false, message: access.message };
    if (!access.row.proof_path) {
      return { ok: false, message: "No proof file on this payment." };
    }

    const service = createServiceSupabaseClient();
    const { data, error } = await service.storage
      .from("payment-proofs")
      .createSignedUrl(access.row.proof_path, 60 * 10);

    if (error || !data?.signedUrl) {
      console.error("[admin/payments/proof-url]", error);
      return fail(error, "Could not create preview link.");
    }

    return { ok: true, message: "Preview ready.", url: data.signedUrl };
  } catch (error) {
    console.error("[admin/payments/proof-url]", error);
    return fail(error, "Could not load proof.");
  }
}

export async function approvePaymentProof(
  paymentId: string,
): Promise<PaymentActionResult> {
  try {
    const access = await requireAccessiblePayment(paymentId);
    if (!access.ok) return { ok: false, message: access.message };
    const { actor: admin, row } = access;

    if (row.status === "paid") {
      return { ok: false, message: "Already paid." };
    }
    if (row.status !== "pending_review") {
      return { ok: false, message: "Nothing to approve yet." };
    }

    const paid = await markFeePaid({
      userId: row.user_id,
      feeType: row.fee_type as FeeType,
      method: "bank_transfer",
      reviewedBy: admin.id,
    });

    const service = createServiceSupabaseClient();
    const { data: profile } = await service
      .from("student_profiles")
      .select("email, first_name")
      .eq("id", row.user_id)
      .maybeSingle();

    const { data: enrolment } = await service
      .from("enrolments")
      .select("reference")
      .eq("user_id", row.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profile) {
      const fee = feeDefinition(row.fee_type as FeeType);
      await sendPaymentApprovedEmail({
        to: profile.email,
        firstName: profile.first_name,
        feeLabel: fee.label,
        amountLabel: formatGbp(Number(paid.amount_gbp)),
        reference: enrolment?.reference || "SOD",
        methodLabel: "Bank transfer",
        portalPaymentsUrl: `${portalBaseUrl()}/student/payments`,
        portalSupportUrl: `${portalBaseUrl()}/student/support`,
        siteUrl: SOD_SITE,
        feeType: row.fee_type as FeeType,
      });
    }

    revalidatePayments();
    return { ok: true, message: "Payment approved." };
  } catch (error) {
    console.error("[admin/payments/approve]", error);
    return fail(error, "Could not approve payment.");
  }
}

export async function rejectPaymentProof(
  paymentId: string,
): Promise<PaymentActionResult> {
  try {
    const access = await requireAccessiblePayment(paymentId);
    if (!access.ok) return { ok: false, message: access.message };
    const row = access.row;

    if (row.status !== "pending_review") {
      return { ok: false, message: "Only proofs in review can be returned." };
    }
    if (!isFeeType(row.fee_type)) {
      return { ok: false, message: "Unknown fee." };
    }

    const service = createServiceSupabaseClient();

    // Best-effort remove stored file.
    if (row.proof_path) {
      await service.storage.from("payment-proofs").remove([row.proof_path]);
    }

    await markFeeReturned({
      userId: row.user_id,
      feeType: row.fee_type,
    });

    const { data: profile } = await service
      .from("student_profiles")
      .select("email, first_name")
      .eq("id", row.user_id)
      .maybeSingle();

    const { data: enrolment } = await service
      .from("enrolments")
      .select("reference")
      .eq("user_id", row.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profile) {
      const fee = feeDefinition(row.fee_type as FeeType);
      await sendPaymentReturnedEmail({
        to: profile.email,
        firstName: profile.first_name,
        feeLabel: fee.label,
        amountLabel: formatGbp(Number(row.amount_gbp)),
        reference: enrolment?.reference || "SOD",
        methodLabel: "Bank transfer",
        portalPaymentsUrl: `${portalBaseUrl()}/student/payments`,
        portalSupportUrl: `${portalBaseUrl()}/student/support`,
        siteUrl: SOD_SITE,
        feeType: row.fee_type as FeeType,
      });
    }

    revalidatePayments();
    return {
      ok: true,
      message: "Proof returned. Student can upload again.",
    };
  } catch (error) {
    console.error("[admin/payments/reject]", error);
    return fail(error, "Could not return proof.");
  }
}
