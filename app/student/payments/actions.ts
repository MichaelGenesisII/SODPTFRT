"use server";

import { revalidatePath } from "next/cache";
import { sendPaymentProofReceivedEmail } from "@/lib/email/payment-mail";
import { portalBaseUrl } from "@/lib/email/backend";
import { formatGbp } from "@/lib/enrol/payment";
import {
  feeDefinition,
  feeRemaining,
  isFeeFullyPaid,
  isFeeType,
  MAX_PROOF_BYTES,
  PROOF_MIME_TYPES,
  validateInstallmentAmount,
  type FeeType,
} from "@/lib/payments/fees";
import {
  ensureStudentFeeRows,
  getFeePayment,
  markFeePendingReview,
} from "@/lib/payments/service";
import { createFeeCheckoutSession, stripeConfigured } from "@/lib/payments/stripe";
import { publicActionMessage } from "@/lib/safe-action-message";
import { SOD_SITE } from "@/lib/site-nav";
import { getSessionStudent } from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type PaymentActionResult = {
  ok: boolean;
  message: string;
  url?: string;
};

function fail(error: unknown, fallback?: string): PaymentActionResult {
  return { ok: false, message: publicActionMessage(error, fallback) };
}

async function requireStudent() {
  const profile = await getSessionStudent();
  if (!profile) throw new Error("Unauthorized");
  return profile;
}

async function studentReference(userId: string) {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("enrolments")
    .select("reference")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.reference?.trim() || "SOD";
}

function parseAmount(raw: FormDataEntryValue | null): number | null {
  const text = String(raw ?? "").trim().replace(/[£,]/g, "");
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

export async function startStripeCheckout(
  feeTypeRaw: string,
  amountRaw?: string,
): Promise<PaymentActionResult> {
  try {
    if (!stripeConfigured()) {
      return {
        ok: false,
        message:
          "Card payments are not available right now. Please pay by bank transfer.",
      };
    }
    if (!isFeeType(feeTypeRaw)) {
      return { ok: false, message: "Unknown fee." };
    }
    const feeType = feeTypeRaw as FeeType;
    const profile = await requireStudent();
    const supabase = await createServerSupabaseClient();
    const rows = await ensureStudentFeeRows(supabase, profile.id);
    const row = rows.find((item) => item.fee_type === feeType);
    if (!row) return { ok: false, message: "Fee record missing." };
    if (isFeeFullyPaid(row)) {
      return { ok: false, message: "This fee is already paid in full." };
    }

    const remaining = feeRemaining(row);
    const amount = amountRaw ? parseAmount(amountRaw) : remaining;
    if (amount === null) {
      return { ok: false, message: "Enter a valid amount." };
    }
    const check = validateInstallmentAmount(amount, remaining);
    if (!check.ok) return { ok: false, message: check.message };

    const reference = await studentReference(profile.id);
    const service = createServiceSupabaseClient();
    const now = new Date().toISOString();

    // Drop abandoned unpaid Stripe attempts for this fee before opening a new session.
    await service
      .from("fee_transactions")
      .delete()
      .eq("user_id", profile.id)
      .eq("fee_type", feeType)
      .eq("method", "stripe")
      .eq("status", "unpaid");

    const { data: tx, error: txError } = await service
      .from("fee_transactions")
      .insert({
        fee_account_id: row.id,
        user_id: profile.id,
        fee_type: feeType,
        amount_gbp: amount,
        status: "unpaid",
        method: "stripe",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (txError) {
      console.error("[student/payments/checkout/tx]", txError);
      return fail(txError, "Could not start checkout.");
    }

    const txId = tx.id as string;

    try {
      const session = await createFeeCheckoutSession({
        userId: profile.id,
        email: profile.email,
        firstName: profile.first_name,
        feeType,
        reference,
        paymentRowId: row.id,
        transactionId: txId,
        amountGbp: amount,
      });

      await service
        .from("fee_transactions")
        .update({
          stripe_session_id: session.sessionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", txId);

      return {
        ok: true,
        message: "Redirecting to card checkout.",
        url: session.url,
      };
    } catch (checkoutError) {
      await service
        .from("fee_transactions")
        .delete()
        .eq("id", txId)
        .eq("status", "unpaid");
      console.error("[student/payments/checkout]", checkoutError);
      return fail(checkoutError, "Could not start checkout.");
    }
  } catch (error) {
    console.error("[student/payments/checkout]", error);
    return fail(error, "Could not start checkout.");
  }
}

export async function submitBankProof(
  formData: FormData,
): Promise<PaymentActionResult> {
  try {
    const feeTypeRaw = String(formData.get("feeType") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    const file = formData.get("proof");
    const amount = parseAmount(formData.get("amount"));

    if (!isFeeType(feeTypeRaw)) {
      return { ok: false, message: "Unknown fee." };
    }
    if (!(file instanceof File) || file.size === 0) {
      return {
        ok: false,
        message: "Upload a screenshot or photo of your transfer.",
      };
    }
    if (file.size > MAX_PROOF_BYTES) {
      return { ok: false, message: "Proof must be 10MB or smaller." };
    }
    if (
      !PROOF_MIME_TYPES.includes(file.type as (typeof PROOF_MIME_TYPES)[number])
    ) {
      return { ok: false, message: "Use a JPG, PNG, WEBP, or GIF image." };
    }
    if (note.length > 280) {
      return { ok: false, message: "Keep your note under 280 characters." };
    }

    const feeType = feeTypeRaw as FeeType;
    const profile = await requireStudent();
    const supabase = await createServerSupabaseClient();
    await ensureStudentFeeRows(supabase, profile.id);
    const current = await getFeePayment(supabase, profile.id, feeType);
    if (!current) return { ok: false, message: "Fee record missing." };
    if (isFeeFullyPaid(current)) {
      return { ok: false, message: "This fee is already paid in full." };
    }

    const remaining = feeRemaining(current);
    if (amount === null) {
      return { ok: false, message: "Enter the amount you transferred." };
    }
    const check = validateInstallmentAmount(amount, remaining);
    if (!check.ok) return { ok: false, message: check.message };

    const ext =
      file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : file.type === "image/gif"
            ? "gif"
            : "jpg";
    const path = `${profile.id}/${feeType}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(path, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error("[student/payments/proof-upload]", uploadError);
      return fail(uploadError, "Could not upload proof.");
    }

    const { transaction } = await markFeePendingReview({
      userId: profile.id,
      feeType,
      amountGbp: amount,
      proofPath: path,
      proofMime: file.type,
      proofNote: note || null,
    });

    const fee = feeDefinition(feeType);
    const reference = await studentReference(profile.id);
    await sendPaymentProofReceivedEmail({
      to: profile.email,
      firstName: profile.first_name,
      feeLabel: fee.label,
      amountLabel: formatGbp(Number(transaction.amount_gbp)),
      reference,
      methodLabel: "Bank transfer",
      portalPaymentsUrl: `${portalBaseUrl()}/student/payments`,
      portalSupportUrl: `${portalBaseUrl()}/student/support`,
      siteUrl: SOD_SITE,
      feeType,
    });

    revalidatePath("/student");
    revalidatePath("/student/payments");
    revalidatePath("/admin/students");
    revalidatePath("/admin/payments");
    return {
      ok: true,
      message: `Proof uploaded for ${formatGbp(Number(transaction.amount_gbp))}. An admin will review it shortly.`,
    };
  } catch (error) {
    console.error("[student/payments/proof]", error);
    return fail(error, "Could not upload proof.");
  }
}
