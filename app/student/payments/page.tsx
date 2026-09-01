import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentPaymentsBoard, StudentPaymentsRefresh } from "@/components/student/student-payments";
import { ensureStudentFeeRows, listFeeTransactions } from "@/lib/payments/service";
import { stripeConfigured } from "@/lib/payments/stripe";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import { getSessionStudent, getStudentEnrolment } from "@/lib/student/auth";
import { signStudentPhotoUrl } from "@/lib/student/photos";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Payments | Student Portal",
  description:
    "Pay the £350 programme fee (£300 tuition + £50 graduation) in full or by instalment.",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudentPaymentsPage({ searchParams }: PageProps) {
  const profile = await getSessionStudent();
  if (!profile) redirect("/login/student");

  const cardReady = stripeConfigured();

  let payments: Awaited<ReturnType<typeof ensureStudentFeeRows>> = [];
  let transactions: Awaited<ReturnType<typeof listFeeTransactions>> = [];
  let reference = "—";
  let referenceCompact = "—";
  let loadError: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const [enrolment, feeRows, feeTransactions] = await Promise.all([
      getStudentEnrolment(profile.id),
      ensureStudentFeeRows(supabase, profile.id),
      listFeeTransactions(supabase, profile.id),
    ]);
    payments = feeRows;
    transactions = feeTransactions;
    reference = enrolment?.reference ?? "—";
    referenceCompact = enrolment?.reference_compact ?? "—";
  } catch (error) {
    console.error("[student/payments]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Payments"),
    );
  }

  const graduationTakenDown =
    profile.selfie_moderation_status === "taken_down";
  const [passportUrl, graduationSelfieUrl] = await Promise.all([
    signStudentPhotoUrl(profile.passport_path),
    profile.graduation_selfie_path && !graduationTakenDown
      ? signStudentPhotoUrl(profile.graduation_selfie_path)
      : Promise.resolve(null),
  ]);

  const params = searchParams ? await searchParams : {};
  const paid = typeof params.paid === "string" ? params.paid : null;
  const cancelled =
    typeof params.cancelled === "string" ? params.cancelled : null;

  let flash: string | null = null;
  if (paid === "tuition" || paid === "application") {
    flash =
      "Card checkout finished. Balance updates when payment is confirmed — refresh if needed. Passport unlocks after your first confirmed tuition instalment.";
  } else if (paid === "graduation") {
    flash =
      "Card checkout finished for graduation. Upload your selfie once the fee shows as paid — refresh if needed.";
  } else if (paid) {
    flash =
      "Card checkout finished. Status updates when Stripe confirms — refresh if needed.";
  } else if (cancelled) {
    flash = "Checkout cancelled. You can try again anytime.";
  }

  return (
    <StudentPaymentsRefresh>
      <StudentPaymentsBoard
        payments={payments}
        transactions={transactions}
        reference={reference}
        referenceCompact={referenceCompact}
        flash={flash}
        loadError={loadError}
        cardReady={cardReady}
        passportUploaded={Boolean(profile.passport_path)}
        passportUrl={passportUrl}
        graduationSelfieUploaded={Boolean(profile.graduation_selfie_path)}
        graduationSelfieUrl={graduationSelfieUrl}
        graduationSelfieTakenDown={graduationTakenDown}
        graduationSelfieNote={profile.selfie_moderation_note ?? null}
      />
    </StudentPaymentsRefresh>
  );
}
