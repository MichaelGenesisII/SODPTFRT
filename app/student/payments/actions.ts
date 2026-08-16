"use server";

import { revalidatePath } from "next/cache";
import { sendPaymentProofReceivedEmail } from "@/lib/email/payment-mail";
import { portalBaseUrl } from "@/lib/email/backend";
import { formatGbp } from "@/lib/enrol/payment";
import {
  feeDefinition,
  isFeeType,
  MAX_PROOF_BYTES,
  PROOF_MIME_TYPES,
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

export async function startStripeCheckout(
  feeTypeRaw: string,
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
    if (row.status === "paid") {
      return { ok: false, message: "This fee is already paid." };
    }

    const reference = await studentReference(profile.id);
    const session = await createFeeCheckoutSession({
      userId: profile.id,
      email: profile.email,
      firstName: profile.first_name,
      feeType,
      reference,
      paymentRowId: row.id,
    });

    const { error: updateError } = await supabase
      .from("student_fee_payments")
      .update({
        stripe_session_id: session.sessionId,
        method: "stripe",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("user_id", profile.id);

    if (updateError) {
      console.error("[student/payments/checkout]", updateError);
      return fail(updateError, "Could not start checkout.");
    }

    return { ok: true, message: "Redirecting to card checkout.", url: session.url };
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
    if (current.status === "paid") {
      return { ok: false, message: "This fee is already paid." };
    }

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

    const updated = await markFeePendingReview({
      userId: profile.id,
      feeType,
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
      amountLabel: formatGbp(Number(updated.amount_gbp)),
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
      message: "Proof uploaded. An admin will review it shortly.",
    };
  } catch (error) {
    console.error("[student/payments/proof]", error);
    return fail(error, "Could not upload proof.");
  }
}
