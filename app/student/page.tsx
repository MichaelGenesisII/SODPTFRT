import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StudentDashboard } from "@/components/student/student-dashboard";
import { fetchStudentAnnouncements } from "@/lib/announcements-server";
import type { FeePaymentStatus } from "@/lib/payments/fees";
import {
  ensureStudentFeeRows,
  getFeePayment,
} from "@/lib/payments/service";
import {
  publicActionMessage,
  publicUnavailableMessage,
} from "@/lib/safe-action-message";
import {
  getSessionStudent,
  getStudentEnrolment,
} from "@/lib/student/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Student Portal | School of Disciples",
  description:
    "Track your School of Disciples application, payment, and course journey.",
};

export default async function StudentPortalPage() {
  const profile = await getSessionStudent();
  if (!profile) {
    redirect("/login/student");
  }

  let enrolment: Awaited<ReturnType<typeof getStudentEnrolment>> = null;
  let applicationFeeStatus: FeePaymentStatus | null = null;
  let loadError: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    enrolment = await getStudentEnrolment(profile.id);
    if (enrolment) {
      try {
        await ensureStudentFeeRows(supabase, profile.id);
        const fee = await getFeePayment(supabase, profile.id, "application");
        applicationFeeStatus = fee?.status ?? null;
      } catch (feeError) {
        console.error("[student/home/fees]", feeError);
        applicationFeeStatus = enrolment.payment_status;
      }
    }
  } catch (error) {
    console.error("[student/home]", error);
    loadError = publicActionMessage(
      error,
      publicUnavailableMessage("Your application"),
    );
  }

  let notices: Awaited<ReturnType<typeof fetchStudentAnnouncements>> = [];
  try {
    notices = await fetchStudentAnnouncements();
  } catch (error) {
    console.error("[student/home/notices]", error);
  }

  return (
    <StudentDashboard
      profile={profile}
      enrolment={enrolment}
      applicationFeeStatus={applicationFeeStatus}
      notices={notices}
      loadError={loadError}
    />
  );
}
