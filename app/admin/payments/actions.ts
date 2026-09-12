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
  normalizeFeeType,
  type FeeTransaction,
  type FeeType,
} from "@/lib/payments/fees";
import {
  applyPaidTransaction,
  getFeeTransaction,
  rejectFeeTransaction,
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
import { formatCohortLabel } from "@/lib/cohorts";

export type PaymentActionResult = {
  ok: boolean;
  message: string;
  url?: string;
};

export type AdminPaymentQueueItem = FeeTransaction & {
  student_name: string;
  student_email: string;
  reference: string | null;
  reference_compact: string | null;
  parish_id: string | null;
  parish_name: string | null;
  batch_label: string | null;
  cohort_label: string | null;
};

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

const TRANSACTION_SELECT =
  "id, fee_account_id, user_id, fee_type, amount_gbp, status, method, stripe_session_id, stripe_payment_intent, proof_path, proof_mime, proof_note, paid_at, reviewed_at, reviewed_by, created_at, updated_at";

function fail(error: unknown, fallback?: string): PaymentActionResult {
  return { ok: false, message: publicActionMessage(error, fallback) };
}

function revalidatePayments() {
  revalidatePath("/admin/payments");
  revalidatePath("/admin/students");
  revalidatePath("/student");
  revalidatePath("/student/payments");
}

async function requireAccessibleTransaction(transactionId: string): Promise<
  | {
      ok: true;
      row: FeeTransaction;
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

  if (!transactionId) {
    return { ok: false, message: "Payment id is required." };
  }

  const supabase = await createServerSupabaseClient();
  const row = await getFeeTransaction(supabase, transactionId);
  if (!row) {
    return {
      ok: false,
      message: "Payment not found or outside your desk scope.",
    };
  }

  const { data: enrolment } = await supabase
    .from("enrolments")
    .select("parish_id")
    .eq("user_id", row.user_id)
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
    if (!parishId || parishId !== actor.parish_id) {
      return {
        ok: false,
        message: "Payment not found or outside your parish scope.",
      };
    }
  }

  return {
    ok: true,
    row,
    supabase,
    actor,
    parish_id: parishId,
  };
}

async function hydrateQueueItems(
  supabase: Supabase,
  actor: AdminProfile,
  payments: FeeTransaction[],
): Promise<AdminPaymentQueueItem[]> {
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
        "user_id, reference, reference_compact, parish_id, batch_id, cohort_id, created_at, parishes(name), batches(name, year), cohorts(name, year_start, year_end)",
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
    reference_compact: string | null;
    parish_id: string | null;
    parishes: { name: string } | { name: string }[] | null;
    batches:
      | { name: string; year: number }
      | { name: string; year: number }[]
      | null;
    cohorts:
      | { name: string; year_start: number; year_end: number }
      | { name: string; year_start: number; year_end: number }[]
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
    const cohort = one(enrol?.cohorts);
    return {
      ...payment,
      fee_type: normalizeFeeType(String(payment.fee_type)) ?? "tuition",
      student_name: profile?.name ?? "Student",
      student_email: profile?.email ?? "",
      reference: enrol?.reference ?? null,
      reference_compact: enrol?.reference_compact ?? null,
      parish_id: enrol?.parish_id ?? null,
      parish_name: parish?.name ?? null,
      batch_label: batch
        ? formatBatchLabel({ name: batch.name, year: batch.year })
        : null,
      cohort_label: cohort
        ? formatCohortLabel({
            name: cohort.name,
            year_start: cohort.year_start,
            year_end: cohort.year_end,
          })
        : null,
    };
  });

  if (!isNationalAdmin(actor) && actor.parish_id) {
    return items.filter((item) => item.parish_id === actor.parish_id);
  }

  return items;
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
    .from("fee_transactions")
    .select(TRANSACTION_SELECT)
    .order("updated_at", { ascending: false });

  if (statusFilter === "pending_review") {
    query = query.eq("status", "pending_review");
  } else if (statusFilter === "paid") {
    query = query.eq("status", "paid").eq("method", "bank_transfer");
  } else {
    query = query.in("status", ["pending_review", "paid"]);
  }

  const { data: rows, error } = await query.limit(200);
  if (error) {
    if (/fee_transactions|relation|schema cache/i.test(error.message)) {
      return [];
    }
    throw new Error(error.message);
  }

  return hydrateQueueItems(
    supabase,
    actor,
    (rows ?? []) as FeeTransaction[],
  );
}

export async function getPaymentProofSignedUrl(
  paymentId: string,
): Promise<PaymentActionResult> {
  try {
    const access = await requireAccessibleTransaction(paymentId);
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
    const access = await requireAccessibleTransaction(paymentId);
    if (!access.ok) return { ok: false, message: access.message };
    const { actor: admin, row } = access;

    if (row.status === "paid") {
      return { ok: false, message: "Already paid." };
    }
    if (row.status !== "pending_review") {
      return { ok: false, message: "Nothing to approve yet." };
    }

    const { account, transaction } = await applyPaidTransaction({
      transactionId: row.id,
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

    if (profile && isFeeType(row.fee_type)) {
      const fee = feeDefinition(row.fee_type);
      await sendPaymentApprovedEmail({
        to: profile.email,
        firstName: profile.first_name,
        feeLabel: fee.label,
        amountLabel: formatGbp(Number(transaction.amount_gbp)),
        reference: enrolment?.reference || "SOD",
        methodLabel: "Bank transfer",
        portalPaymentsUrl: `${portalBaseUrl()}/student/payments`,
        portalSupportUrl: `${portalBaseUrl()}/student/support`,
        siteUrl: SOD_SITE,
        feeType: row.fee_type,
      });
    }

    revalidatePayments();
    return {
      ok: true,
      message: `Approved ${formatGbp(Number(transaction.amount_gbp))} toward ${feeDefinition(row.fee_type as FeeType).label.toLowerCase()}.`,
    };
  } catch (error) {
    console.error("[admin/payments/approve]", error);
    return fail(error, "Could not approve payment.");
  }
}

export async function rejectPaymentProof(
  paymentId: string,
): Promise<PaymentActionResult> {
  try {
    const access = await requireAccessibleTransaction(paymentId);
    if (!access.ok) return { ok: false, message: access.message };
    const row = access.row;

    if (row.status !== "pending_review") {
      return { ok: false, message: "Only proofs in review can be returned." };
    }
    if (!isFeeType(row.fee_type)) {
      return { ok: false, message: "Unknown fee." };
    }

    await rejectFeeTransaction({ transactionId: row.id });

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
      const fee = feeDefinition(row.fee_type);
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
        feeType: row.fee_type,
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
