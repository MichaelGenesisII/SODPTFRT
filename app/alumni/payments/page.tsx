import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentPaymentsBoard } from "@/components/student/student-payments";
import { ensureStudentFeeRows, listFeeTransactions } from "@/lib/payments/service";
import { stripeConfigured } from "@/lib/payments/stripe";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import { getSessionAlumni, getStudentEnrolment } from "@/lib/student/auth";
import { signStudentPhotoUrl } from "@/lib/student/photos";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Payments | Alumni Portal",
};

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AlumniPaymentsPage({ searchParams }: PageProps) {
  const profile = await getSessionAlumni();
  if (!profile) redirect("/login/alumni");

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
    console.error("[alumni/payments]", error);
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
  );
}
