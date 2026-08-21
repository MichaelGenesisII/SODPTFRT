import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentPaymentsBoard } from "@/components/student/student-payments";
import { ensureStudentFeeRows } from "@/lib/payments/service";
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
    "Pay tuition and graduation fees — in full or by instalment.",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StudentPaymentsPage({ searchParams }: PageProps) {
  const profile = await getSessionStudent();
  if (!profile) redirect("/login/student");

  const cardReady = stripeConfigured();

  let payments: Awaited<ReturnType<typeof ensureStudentFeeRows>> = [];
  let reference = "—";
  let referenceCompact = "—";
  let loadError: string | null = null;
  try {
    const supabase = await createServerSupabaseClient();
    const [enrolment, feeRows] = await Promise.all([
      getStudentEnrolment(profile.id),
      ensureStudentFeeRows(supabase, profile.id),
    ]);
    payments = feeRows;
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
  const graduationSelfieUrl =
    profile.graduation_selfie_path && !graduationTakenDown
      ? await signStudentPhotoUrl(profile.graduation_selfie_path)
      : null;

  const params = searchParams ? await searchParams : {};
  const paid = typeof params.paid === "string" ? params.paid : null;
  const cancelled =
    typeof params.cancelled === "string" ? params.cancelled : null;

  let flash: string | null = null;
  if (paid === "tuition" || paid === "application") {
    flash =
      "Payment received. You can upload your passport photograph after your first tuition instalment is confirmed.";
  } else if (paid === "graduation") {
    flash =
      "Graduation fee received. Please upload your graduation selfie below.";
  } else if (paid) {
    flash =
      "Card payment received. Status updates when Stripe confirms — refresh if needed.";
  } else if (cancelled) {
    flash = "Checkout cancelled. You can try again anytime.";
  }

  return (
    <StudentPaymentsBoard
      payments={payments}
      reference={reference}
      referenceCompact={referenceCompact}
      flash={flash}
      loadError={loadError}
      cardReady={cardReady}
      passportUploaded={Boolean(profile.passport_path)}
      passportUrl={profile.passportUrl}
      graduationSelfieUploaded={Boolean(profile.graduation_selfie_path)}
      graduationSelfieUrl={graduationSelfieUrl}
      graduationSelfieTakenDown={graduationTakenDown}
      graduationSelfieNote={profile.selfie_moderation_note ?? null}
    />
  );
}
